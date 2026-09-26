/**
 * Conversation turn + translation handlers.
 *
 * Extracted from cloudflare-unified-worker.js for the same measured reason as
 * cloudflare-hints.js / cloudflare-writing.js: both handlers sit past the ~63 KB
 * byte offset where the edit tooling cannot reach (the turn handler starts at
 * 77,563 bytes), so they could not be changed in place. Everything worker-scoped
 * (auth, entitlement, quota, validation, prompt-shaping helpers, the AI router)
 * is injected from the call site; this module owns only the handler logic.
 *
 * Three things changed while moving:
 * - Both handlers now call `callAiRouter` (multi-provider pool + terminal
 *   day-quota ledger) instead of the Gemini-only failover walker.
 * - `/ai/translate` gained the entitlement check it never had. It was the one AI
 *   route with no entitlement gate at all, which made it the cheapest way to
 *   spend provider quota: any signed-in learner, any volume, forever.
 * - `/ai/turn` makes ONE model call, not two. The roleplay reply and the grammar
 *   evaluation travel in one fused prompt/schema, which halves the provider cost
 *   of every learner message. The HTTP response shape is unchanged, so the client
 *   (and any PWA bundle still cached on a phone) needed no update.
 */

/**
 * @param {Request} request
 * @param {object} env
 * @param {object} cors
 * @param {object} deps worker-scoped internals, injected at the call site
 */
export async function handleChatTurnRoute(request, env, cors, deps) {
  const {
    json,
    hasUsableProvider,
    extractIdToken,
    verifyGoogleIdToken,
    checkGlobalRateLimit,
    validateAiTurnBody,
    resolveScenarioIdentity,
    checkUserEntitlement,
    isTrialSessionConsumed,
    consumeTrialQuota,
    trialSessionKey,
    sanitizeFieldLabel,
    cleanJson,
    callAiRouter,
    routerCounters,
    getProvider,
  } = deps;

  if (!hasUsableProvider(env)) return json({ error: "ai_unavailable" }, 503, cors);

  const body = await request.json().catch(() => null);
  if (!body || !body.user_message) return json({ error: "user_message required" }, 400, cors);

  const idToken = extractIdToken(request, body);
  if (!idToken) return json({ error: "unauthenticated", code: "UNAUTHENTICATED", message: "يرجى تسجيل الدخول بحساب Google أولاً لمتابعة المحادثة." }, 401, cors);
  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) return json({ error: "invalid_id_token", code: "UNAUTHENTICATED", message: "جلسة الدخول غير صالحة أو منتهية. يرجى تسجيل الدخول مجدداً." }, 401, cors);

  const rate = await checkGlobalRateLimit(account.sub, env);
  if (!rate.allowed) return json({ error: "rate_limit_exceeded", code: "RATE_LIMIT_EXCEEDED", message: "تم تجاوز الحد الأقصى للمحادثات مؤقتاً. يرجى الانتظار دقيقة.", retry_after: rate.retryAfter }, 429, cors);

  // Phase 1 security gate: strict validation + server-authoritative scenario identity.
  const validation = validateAiTurnBody(body);
  if (!validation.ok) {
    return json({ error: "invalid_request", code: "INVALID_AI_INPUT", details: validation.errors, message: "حدث خطأ في بيانات الطلب. يرجى إعادة المحاولة." }, 400, cors);
  }
  const v = validation.clean;
  const scenarioIdentity = await resolveScenarioIdentity(env, v.scenario_id);
  if (!scenarioIdentity) {
    return json({ error: "unknown_scenario", code: "UNKNOWN_SCENARIO", message: "هذا الموقف التدريبي غير متاح حالياً." }, 400, cors);
  }
  const scenario_id = v.scenario_id;
  const scenario_title = scenarioIdentity.title_de;   // server-authoritative (client value ignored)
  const persona = scenarioIdentity.persona;           // server-authoritative (client value ignored)
  const cefr_level = v.cefr_level;
  const user_message = v.user_message;
  const history = v.history;
  const mode = v.mode;
  const session_id = v.session_id;
  const sarcasm_level = v.sarcasm_level;
  const is_final_turn = body.is_final_turn === true;
  const level = cefr_level;
  const entitlement = await checkUserEntitlement(account, level, env);
  if (!entitlement.allowed) {
    const quotaFailure = ["FREE_QUOTA_EXHAUSTED", "QUOTA_UNAVAILABLE"].includes(entitlement.code);
    return json({
      error: quotaFailure ? "free_quota_error" : "subscription_required",
      code: entitlement.code || "PAYWALL_REQUIRED",
      message: entitlement.message
    }, entitlement.code === "QUOTA_UNAVAILABLE" ? 503 : 402, cors);
  }
  // Consume the free quota once per conversation session (tracked via session_id),
  // NOT per individual message. Signed-in subscribers skip this entirely.
  if (!entitlement.isSubscribed) {
    // Phase 2: with D1 the ledger claim inside consumeTrialQuota is the atomic
    // idempotency mark (replays return SESSION_ALREADY_CONSUMED and proceed at
    // zero quota cost). The KV trial-session key remains as a fast-path check.
    const sessionConsumed = session_id ? await isTrialSessionConsumed(account.sub, session_id, env) : false;
    if (!sessionConsumed) {
      const quota = await consumeTrialQuota(account.sub, env, session_id || null);
      if (!quota.allowed && quota.code !== "SESSION_ALREADY_CONSUMED") {
        const status = quota.code === "QUOTA_UNAVAILABLE" ? 503 : 402;
        return json({ error: "free_quota_unavailable", code: quota.code, message: quota.message }, status, cors);
      }
      if (session_id && env.USER_PROGRESS) {
        try {
          await env.USER_PROGRESS.put(
            trialSessionKey(account.sub, session_id),
            JSON.stringify({ consumed_at: Date.now() }),
            { expirationTtl: 6 * 3600 }
          );
        } catch {}
      }
    }
  }

  const wrapUpInstruction = is_final_turn
    ? "This is the final exchange. Give a warm realistic farewell and do not ask a new question."
    : `Continue naturally at CEFR level ${level}.`;
  // The learner is staring at a typing indicator for the whole of this response,
  // and the response is not streamed — so its length IS its latency. Every field
  // below asks for the shortest thing that still does its job; the old prompt
  // asked for "1-2 sentences" of everything and let a model spend 1600 tokens
  // getting there.
  const brevity = "Keep every field as short as it can be while still being useful: the learner is waiting on this response.";
  const roleplayInstruction = `You are the in-character native German roleplay counterpart in '${scenario_title || scenario_id}'.
Persona: ${persona || "friendly conversational partner"}. Target learner CEFR level: ${level}.
${wrapUpInstruction}
CONVERSATION RULES:
- The learner's LAST message is the one you are answering. Answer THAT, not an earlier line, and never restate their sentence back as your reply.
- react to what the learner ACTUALLY just said — answer their question, comment on their statement, build on it. Never reply with a generic pleasance.
- Keep reply_de to 1-2 short sentences that feel like real spoken German.
${brevity}
Return:
- reply_de: your natural German reply, in character, at CEFR level ${level}. Plain sentence only — never prefix it with field labels.
- reply_ar: its accurate, idiomatic Modern Standard Arabic translation. Never translate secular German greetings as السلام عليكم.
- next_hint: ONE short German sentence (with its Arabic translation_ar) that the LEARNER could realistically say next in this conversation at their level — a suggestion, not your own line.
- followup_question_ar: ONE short, inviting Arabic question that encourages the learner to keep chatting (about the scenario, e.g. about rent, appointment, order).
Respond strictly as JSON with keys: reply_de, reply_ar, next_hint { german, translation_ar }, followup_question_ar`;
  const evaluationInstruction = `You are Katzu, a witty, warm Arabic-speaking German grammar coach who roasts German grammar (not the learner).
Evaluate ONLY the learner's latest German sentence against CEFR level ${level}. Do not use conversation history, scenario context, or the roleplay persona.
Sarcasm level for roast_comment (1-5, default 2): ${Math.min(5, Math.max(1, Number(sarcasm_level) || 2))}. 1 = gentle, 3 = playfully sarcastic, 5 = maximum sass about how absurd German grammar is — never mocking the learner.
roast_comment must be in Arabic targeting German grammar absurdity (articles, cases, word order), staying encouraging.
FIELD RULES — the learner reads these, so they have to be short and in the right language:
- is_correct: true only when the sentence is grammatically correct at ${level}. A wrong article, case, ending or word order makes it false.
- corrected_german / original_mistake: the broken PART of the sentence only, not the whole sentence, and only when is_correct is false. Leave both empty when the sentence is correct.
- grammar_rule: a SHORT ARABIC label of 3-7 words naming the rule (e.g. "ترتيب الكلمات: الفعل في الموضع الثاني"). Never English — it is shown to an Arabic speaker as a chip, not explained.
- explanation_ar: one or two short Arabic sentences explaining the fix.
- roast_comment: one playful Arabic line about German grammar; empty when is_correct is true.
- positive_note_ar: one short encouraging Arabic line, always present.
${brevity}
Keep the whole JSON under ~350 tokens: the learner is waiting, and a longer answer risks being cut off mid-sentence.`;

  // ONE call, two jobs. The halves have to stay separable in the output, so the
  // isolation rule is explicit: the coach now sees the conversation that used to
  // be withheld from it (it ran as its own stateless call), and left alone it
  // would start grading the learner's history instead of their last sentence.
  const fusionInstruction = `You have TWO jobs in this ONE response. They must not bleed into each other.

JOB 1 — ROLEPLAY REPLY
${roleplayInstruction}

JOB 2 — GRAMMAR EVALUATION
${evaluationInstruction}

Isolation rule for JOB 2: grade ONLY the learner's final sentence. Earlier turns exist as context for JOB 1 and must not change the grade, the corrections, or the roast.
The conversation history is context, not a topic list: if the learner's last message answers your own previous question, continue from there. Do not change the subject and do not repeat a question you already asked.
Write the JSON keys in exactly this order:
{ "reply_de": string, "reply_ar": string, "evaluation": { "is_correct": boolean, "corrected_german": string, "original_mistake": string, "grammar_rule": string, "explanation_ar": string, "roast_comment": string, "positive_note_ar": string }, "next_hint": { "german": string, "translation_ar": string }, "followup_question_ar": string }`;

  // The learner's own recurring errors. The worker has validated this field since
  // the route was written and then thrown it away, so the coach graded a stranger
  // every turn while the app kept a list of exactly what they keep getting wrong.
  const memory = Array.isArray(v.learner_memory) ? v.learner_memory : [];
  const memoryInstruction = memory.length
    ? `MEMORY — this learner's own recorded corrections, most repeated first:
${memory
  .map((m) => `- ${m.rule}${m.example ? ` (they wrote: "${m.example}")` : ""}`)
  .join("\n")}
How to use it:
- When one of these patterns fits this exchange, shape your reply so the learner naturally has to use it correctly. Do not lecture about it and do not announce that you are testing them.
- When they repeat one of these mistakes, correct it consistently with the same rule wording.
- Never mention that you keep a list of their mistakes.`
    : "";

  const turnPayload = {
    // Two parts, base first: the stable half stays byte-identical turn to turn so
    // provider-side prefix caching can still hit, and the learner-specific half is
    // appended. `convertGeminiPayloadToMessages` joins all parts, so every
    // transport sees the memory too.
    systemInstruction: {
      parts: memoryInstruction
        ? [{ text: fusionInstruction }, { text: memoryInstruction }]
        : [{ text: fusionInstruction }],
    },
    contents: shapeTurnContents(history, user_message, mode),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          // Order is load-bearing. `propertyOrdering` is what the model emits
          // first, and a long answer is cut from the END — so the short, load-
          // bearing fields come first and the Arabic prose comes last. A response
          // that hits the token cap still carries the reply and the grade;
          // `parseTurnJson`/`mergeEvaluation` below still refuse a turn with no
          // real boolean `is_correct`, so truncation can lose feedback but can
          // never invent it. (It used to: the generic parser stamped an unparsed
          // answer as correct and passed the raw JSON through as the reply.)
          reply_de: { type: "STRING" },
          reply_ar: { type: "STRING" },
          evaluation: {
            type: "OBJECT",
            properties: {
              is_correct: { type: "BOOLEAN" },
              corrected_german: { type: "STRING" },
              original_mistake: { type: "STRING" },
              grammar_rule: { type: "STRING" },
              explanation_ar: { type: "STRING" },
              roast_comment: { type: "STRING" },
              positive_note_ar: { type: "STRING" }
            },
            required: ["is_correct", "explanation_ar", "positive_note_ar"],
            propertyOrdering: ["is_correct", "corrected_german", "original_mistake", "grammar_rule", "explanation_ar", "roast_comment", "positive_note_ar"]
          },
          next_hint: {
            type: "OBJECT",
            properties: {
              german: { type: "STRING" },
              translation_ar: { type: "STRING" }
            },
            required: ["german", "translation_ar"]
          },
          followup_question_ar: { type: "STRING" }
        },
        required: ["reply_de", "reply_ar", "evaluation", "next_hint", "followup_question_ar"],
        propertyOrdering: ["reply_de", "reply_ar", "evaluation", "next_hint", "followup_question_ar"]
      },
      // One budget for what used to be two calls (700 + 350). Reasoning models
      // spend tokens on thoughts before the JSON answer, and a tight cap is what
      // used to truncate the fused answer mid-string.
      temperature: 0.3,
      // 1600 was slack, and slack is latency: the answer is not streamed, so
      // every unused token of headroom is headroom a chatty model will take.
      // A well-behaved answer is ~350 tokens, and the field order above means a
      // cut tail costs prose rather than the reply or the grade.
      maxOutputTokens: 1000,
      // Reasoning tokens are latency the learner pays for and never sees. Grading
      // one A1-B2 sentence and answering it does not need a long think.
      reasoningEffort: "low"
    }
  };

  try {
    // Fused: one model call both answers the learner and grades them. The two
    // separate calls used to double every message's provider cost for the same
    // total work — and doubled every failover walk with it.
    // `preferFast`: this is the route a learner is watching, so the tier walk is
    // ordered by measured latency instead of round-robin.
    const raw = await callAiRouter(turnPayload, env, { preferFast: true });
    const parsed = parseTurnJson(raw);
    // Sanitize every string field — a model echoing schema labels ("reply_de: ...")
    // must never reach the learner's chat bubbles.
    const replyDe = sanitizeFieldLabel(parsed?.reply_de) || "";
    const replyAr = sanitizeFieldLabel(parsed?.reply_ar) || "";
    // Unusable model output has to fail loudly. The generic parser the other
    // routes use answers "this is not JSON" with the raw text as the reply, and
    // that put schema fragments — `evaluation: is_correct: false, original_mistake:
    // Jaja, corrected_german: Ja, gerne!...` — in a chat bubble while stamping the
    // turn CORRECT. The learner saw a normal reply, no correction, and an accuracy
    // score the model never gave. A 502 raises the client's retry card instead.
    if (!parsed || !replyDe || SCHEMA_ECHO.test(replyDe)) {
      console.error("[ai/turn] unusable model output — raw:", String(raw).slice(0, 200));
      return json({
        error: "ai_empty_reply",
        code: "AI_EMPTY_REPLY",
        message: "تعذر توليد رد واضح. حاول إعادة الإرسال."
      }, 502, cors);
    }
    const evaluation = mergeEvaluation(parsed);
    if (!evaluation) {
      console.error("[ai/turn] model returned no grade — raw:", String(raw).slice(0, 200));
      return json({
        error: "ai_missing_evaluation",
        code: "AI_EVAL_MISSING",
        message: "لم يصل تقييم هذه الجملة كاملاً. حاول إعادة الإرسال."
      }, 502, cors);
    }
    const nextHint = parsed.next_hint && typeof parsed.next_hint === "object"
      ? {
          german: sanitizeFieldLabel(parsed.next_hint.german) || "",
          translation_ar: sanitizeFieldLabel(parsed.next_hint.translation_ar) || ""
        }
      : null;
    const hints = nextHint && nextHint.german ? [nextHint] : [];
    const followupAr = sanitizeFieldLabel(parsed.followup_question_ar) || "";
    return json({
      reply_de: replyDe,
      reply_ar: replyAr,
      evaluation,
      hints,
      followup_ar: followupAr,
      provider: getProvider()
    }, 200, cors);
  } catch (err) {
    console.error("[ai/turn] failed:", String(err?.message || err).slice(0, 200), "| attempts:", JSON.stringify(routerCounters()));
    const detail = String(err?.message || "").slice(0, 180);
    return json({ error: "ai_error", code: "AI_TURN_FAILED", message: "تعذر إكمال دور المحادثة والتقييم. حاول إعادة الإرسال.", detail }, 502, cors);
  }
}

// ----------------------------------------------------------------------------
// TURN CONTEXT
// ----------------------------------------------------------------------------

/** History turns to keep, per mode. A "turn" is one learner exchange. */
const HISTORY_TURNS = { roleplay: 3, extended: 5 };

const normalizeForCompare = (text) =>
  String(text || "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Builds the model's `contents` array for one turn.
 *
 * The transcript the client sends already ends with the message being answered,
 * and the request carries that same message again as `user_message`. Concatenating
 * the two handed the model the learner's sentence twice, back to back — the exact
 * shape that makes a model answer the previous question, restate the input instead
 * of replying to it, or drift off the topic the learner just raised. So the rule
 * here is one message, once: a trailing history entry that repeats the new message
 * is dropped.
 *
 * Two more rules keep the window a conversation rather than a slice:
 * - consecutive same-role entries collapse to the newest one — two learner turns
 *   in a row are otherwise indistinguishable from an accidental double-send;
 * - when the window is cut, it is cut so it does not open on a reply whose
 *   question was trimmed away. The scenario opener is exempt: it has no question
 *   before it, and dropping it would remove the situation the learner is in.
 */
export function shapeTurnContents(history, userMessage, mode = "roleplay") {
  const turns = HISTORY_TURNS[mode] || HISTORY_TURNS.roleplay;
  const limit = turns * 2 + 1;
  const incoming = normalizeForCompare(userMessage);

  const cleaned = [];
  for (const entry of Array.isArray(history) ? history : []) {
    const text = String(entry?.text || "").trim();
    if (!text) continue;
    const role = entry?.role === "user" || entry?.sender?.toLowerCase() === "user" ? "user" : "model";
    cleaned.push({ role, text });
  }

  const last = cleaned[cleaned.length - 1];
  if (incoming && last && last.role === "user" && normalizeForCompare(last.text) === incoming) {
    cleaned.pop();
  }

  const collapsed = [];
  for (const entry of cleaned) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.role === entry.role) collapsed[collapsed.length - 1] = entry;
    else collapsed.push(entry);
  }

  const truncated = collapsed.length > limit;
  const window = collapsed.slice(-limit);
  if (truncated && window.length && window[0].role !== "user") window.shift();

  return [
    ...window.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: String(userMessage || "").trim() }] },
  ];
}

// ----------------------------------------------------------------------------
// FUSED TURN OUTPUT
// ----------------------------------------------------------------------------

/**
 * A reply that names the schema's own fields is not a reply. Providers that
 * reject `response_format` (the OpenAI-compatible path retries without it) can
 * answer with the JSON dumped into the reply field, which would otherwise put
 * `grammar_rule: ...` on screen wearing a normal bubble.
 */
const SCHEMA_ECHO = /(is_correct|original_mistake|corrected_german|grammar_rule|explanation_ar|positive_note_ar|roast_comment|reply_de|reply_ar)\s*["']?\s*[:=]/i;

const EVALUATION_KEYS = [
  "is_correct",
  "original_mistake",
  "corrected_german",
  "grammar_rule",
  "explanation_ar",
  "roast_comment",
  "positive_note_ar"
];

/**
 * The turn route does NOT use the shared `cleanJson`.
 *
 * `cleanJson` is a never-throw extractor: its last resort is "take the raw text,
 * strip quotes and braces, call it reply_de" plus a fabricated `is_correct: true`.
 * That is survivable for a translation or a hint, and destructive here — it put
 * raw JSON fragments in the learner's chat and marked wrong sentences correct.
 * So the turn route parses strictly, repairs only what is provably repairable,
 * and returns null when the output cannot be trusted.
 */
function parseTurnJson(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  const text = String(raw)
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  // A fenced or chattily-prefixed answer still contains the object; take it.
  for (const candidate of [text, extractJsonObject(text)]) {
    if (!candidate) continue;
    const parsed = parseLenient(candidate);
    if (parsed && typeof parsed === "object") return parsed;
  }
  return null;
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end > start ? text.slice(start, end + 1) : null;
}

function parseLenient(text) {
  const attempts = [
    text,
    text.replace(/,\s*([}\]])/g, "$1"),
    // Literal newlines/tabs inside strings are invalid JSON but models emit them.
    text.replace(/[\u0000-\u001F]+/g, " "),
  ];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {}
  }
  const repaired = closeOpenJson(text);
  if (!repaired) return null;
  for (const attempt of [repaired, repaired.replace(/[\u0000-\u001F]+/g, " ")]) {
    try {
      return JSON.parse(attempt);
    } catch {}
  }
  return null;
}

/**
 * A response cut off by the token cap ends mid-string with unclosed quotes and
 * braces (`{"reply_de":"Guten Tag","reply_ar":"نهارك` ). Closing them keeps the
 * fields that DID arrive usable, so a long-winded model costs the learner the
 * tail of its answer instead of the whole turn.
 */
function closeOpenJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  const body = text.slice(start);
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const ch of body) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (!inString && stack.length === 0) return null; // balanced — nothing was lost
  let out = body;
  if (inString) out += '"';
  // A response cut exactly on a key ("...,\"followup_question_ar\":" ) has no
  // value to keep, so the dangling fragment goes before the closers.
  out = out.replace(/,\s*"[^"]*"\s*:\s*$/, "").replace(/,\s*$/, "");
  let closers = "";
  while (stack.length) closers += stack.pop() === "{" ? "}" : "]";
  return out + closers;
}

/**
 * Some models flatten the nested object the schema asks for, some emit only part
 * of it. Merge both shapes — but a grade is only returned when the model really
 * sent a boolean, so an ungraded turn can never be scored as correct.
 */
function mergeEvaluation(parsed) {
  const nested =
    parsed.evaluation && typeof parsed.evaluation === "object" && !Array.isArray(parsed.evaluation)
      ? parsed.evaluation
      : {};
  const merged = { ...nested };
  for (const key of EVALUATION_KEYS) {
    if (merged[key] === undefined && parsed[key] !== undefined) merged[key] = parsed[key];
  }
  return typeof merged.is_correct === "boolean" ? merged : null;
}

// ----------------------------------------------------------------------------
// EDGE CACHED TRANSLATION
// ----------------------------------------------------------------------------

/**
 * Translation is the cheapest call in the app and was the only AI route with no
 * entitlement gate, so it is now gated like the rest (a signed-in learner with
 * trial quota left still gets it). The cache moved from a per-isolate Map to the
 * shared KV-backed cache: isolate recycling used to empty it, which meant the
 * same scenario opener was re-translated on every cold start.
 *
 * @param {object} deps { json, hasUsableProvider, authenticateAiRequest, cleanJson,
 *                        readAiCache, writeAiCache, validLevels, callAiRouter }
 */
export async function handleTranslateRoute(request, env, cors, deps) {
  const {
    json,
    hasUsableProvider,
    authenticateAiRequest,
    cleanJson,
    readAiCache,
    writeAiCache,
    validLevels,
    callAiRouter,
  } = deps;

  const body = await request.json().catch(() => null);
  const requestedLevel = String(body?.cefr_level || "").toUpperCase();
  const level = validLevels?.has(requestedLevel) ? requestedLevel : "A1";
  const auth = await authenticateAiRequest(request, body, env, cors, {
    level,
    requireEntitlement: true,
  });
  if (auth.response) return auth.response;

  const text = String(body?.text || "").trim();
  if (!text) return json({ translation_ar: "" }, 200, cors);
  if (!hasUsableProvider(env)) return json({ error: "ai_unavailable" }, 503, cors);

  const cacheKey = text.toLowerCase();
  const cached = await readAiCache(env, "tr", cacheKey);
  if (typeof cached === "string" && cached) {
    return json({ translation_ar: cached, cached: true }, 200, cors);
  }

  const prompt = `Translate this German sentence into accurate, natural, idiomatic Modern Standard Arabic.
German: "${text}"
Rules:
- Translate meaning, not word-by-word. Rephrase into the way a native Arabic speaker would naturally say it.
- Never transliterate German words into Arabic letters (e.g. write المحاسبة for Buchhaltung, not بوخهالتونج) — use the established Arabic equivalent term.
- Never use "السلام عليكم" for "Guten Tag"/"Hallo"; use "مرحباً" or "صباح الخير"/"مساء الخير".
- Keep it natural for a learner app: concise, clear MSA, correct grammar and gender.
Respond strictly in JSON:
{ "translation_ar": "string" }`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 120
    }
  };

  try {
    // A learner is waiting on this one too, and it is one short sentence: the
    // cheapest provider that can do it is the right one.
    const raw = await callAiRouter(payload, env, { preferFast: true });
    const translation = cleanJson(raw).translation_ar || "";
    if (translation) {
      await writeAiCache(env, "tr", cacheKey, translation, { ttlSeconds: 30 * 86400 });
    }
    return json({ translation_ar: translation }, 200, cors);
  } catch (err) {
    // The client treats a missing translation as "keep the placeholder", so a
    // failed lookup is survivable — but it must not surface as a 500.
    console.error("[ai/translate] failed:", String(err?.message || err).slice(0, 160));
    return json({ error: "ai_unavailable", message: "تعذر ترجمة النص الآن." }, 502, cors);
  }
}
