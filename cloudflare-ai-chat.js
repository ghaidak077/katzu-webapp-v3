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
 * Two things changed while moving:
 * - Both handlers now call `callAiRouter` (multi-provider pool + terminal
 *   day-quota ledger) instead of the Gemini-only failover walker.
 * - `/ai/translate` gained the entitlement check it never had. It was the one AI
 *   route with no entitlement gate at all, which made it the cheapest way to
 *   spend provider quota: any signed-in learner, any volume, forever.
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
    boundedHistory,
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
  const roleplayInstruction = `You are the in-character native German roleplay counterpart in '${scenario_title || scenario_id}'.
Persona: ${persona || "friendly conversational partner"}. Target learner CEFR level: ${level}.
${wrapUpInstruction}
CONVERSATION RULES:
- react to what the learner ACTUALLY just said — answer their question, comment on their statement, build on it. Never reply with a generic pleasance.
- Keep reply_de to 1-2 short sentences that feel like real spoken German.
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
Respond strictly as JSON: {"is_correct":boolean,"original_mistake":"string","corrected_german":"string","grammar_rule":"string","explanation_ar":"string","roast_comment":"string","user_message_translation_ar":"string","positive_note_ar":"string"}`;

  const conversationPayload = {
    systemInstruction: { parts: [{ text: roleplayInstruction }] },
    contents: [
      ...boundedHistory(history, mode).map(h => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text || "" }]
      })),
      { role: "user", parts: [{ text: user_message }] }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          reply_de: { type: "STRING" },
          reply_ar: { type: "STRING" },
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
        required: ["reply_de", "reply_ar", "next_hint", "followup_question_ar"],
        propertyOrdering: ["reply_de", "reply_ar", "next_hint", "followup_question_ar"]
      },
    // Generous output budget: reasoning models spend tokens on thoughts before
    // the JSON answer — a tight cap truncates the payload and produces empty
    // fields that used to surface as fake fallback replies.
      temperature: 0.3,
      maxOutputTokens: 700
    }
  };
  const evaluationPayload = {
    systemInstruction: { parts: [{ text: evaluationInstruction }] },
    contents: [{ role: "user", parts: [{ text: user_message }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          is_correct: { type: "BOOLEAN" },
          original_mistake: { type: "STRING" },
          corrected_german: { type: "STRING" },
          grammar_rule: { type: "STRING" },
          explanation_ar: { type: "STRING" },
          roast_comment: { type: "STRING" },
          user_message_translation_ar: { type: "STRING" },
          positive_note_ar: { type: "STRING" }
        },
        required: ["is_correct", "explanation_ar", "positive_note_ar"],
        propertyOrdering: ["is_correct", "original_mistake", "corrected_german", "grammar_rule", "explanation_ar", "roast_comment", "user_message_translation_ar", "positive_note_ar"]
      },
      temperature: 0.2,
      maxOutputTokens: 350
    }
  };

  try {
    // These calls intentionally have separate prompts/personas and independent inputs.
    const [roleplayRaw, evaluationRaw] = await Promise.all([
      callAiRouter(conversationPayload, env),
      callAiRouter(evaluationPayload, env)
    ]);
    const roleplay = cleanJson(roleplayRaw);
    const evaluationParsed = cleanJson(evaluationRaw);
    const evaluation = evaluationParsed.evaluation || evaluationParsed;
    // Sanitize every string field — a model echoing schema labels ("reply_de: ...")
    // must never reach the learner's chat bubbles.
    const replyDe = sanitizeFieldLabel(roleplay.reply_de) || "";
    const replyAr = sanitizeFieldLabel(roleplay.reply_ar) || "";
    // An empty German reply means the model output was unusable. Fail honestly
    // (client shows the retry card) instead of fabricating a templated answer
    // that ignores what the learner just said.
    if (!replyDe) {
      console.error("[ai/turn] empty reply_de after parse — raw:", String(roleplayRaw).slice(0, 200));
      return json({
        error: "ai_empty_reply",
        code: "AI_EMPTY_REPLY",
        message: "تعذر توليد رد واضح. حاول إعادة الإرسال."
      }, 502, cors);
    }
    const nextHint = roleplay.next_hint && typeof roleplay.next_hint === "object"
      ? {
          german: sanitizeFieldLabel(roleplay.next_hint.german) || "",
          translation_ar: sanitizeFieldLabel(roleplay.next_hint.translation_ar) || ""
        }
      : null;
    const hints = nextHint && nextHint.german ? [nextHint] : [];
    const followupAr = sanitizeFieldLabel(roleplay.followup_question_ar) || "";
    return json({
      reply_de: replyDe,
      reply_ar: replyAr,
      evaluation: evaluation && typeof evaluation === "object" ? evaluation : {},
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
    const raw = await callAiRouter(payload, env);
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
