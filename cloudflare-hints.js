/**
 * Conversation hints (on-demand Call C) — multi-move edition.
 *
 * Extracted from cloudflare-unified-worker.js for the same measured reason as
 * cloudflare-admin.js / cloudflare-crypto.js: this handler
 * sat at ~80 KB of byte offset, past the ~48 KB wall where the edit tooling
 * cannot apply diffs. Everything worker-scoped (auth, entitlement, provider
 * pool, KV cache, response helper) is injected from the call site,
 * so this module owns only the hint logic: auth, entitlement, the provider pool,
 * the KV-backed cache and the response helper all arrive through `deps`.
 *
 * One hint was the old behaviour: a single "what could you say next" sentence.
 * Real conversation offers several valid moves at the same point — agreeing,
 * disagreeing, answering directly, adding detail, asking a follow-up, admitting
 * you didn't understand. This asks for those moves and explicitly forbids
 * rephrasings of one idea, which is what made the old expander useless.
 */

/** 2-4 distinct options; more than four is a wall of text on a phone. */
export const MIN_HINTS = 2;
export const MAX_HINTS = 4;

/**
 * The conversational moves the model may tag. Kept as a closed enum so the
 * client can render a stable Arabic label per move and so "distinct" is
 * machine-checkable rather than a promise in the prompt.
 */
export const HINT_INTENTS = [
  "answer",
  "agree",
  "disagree",
  "add_detail",
  "ask_followup",
  "clarify",
  "express_uncertainty",
  "deflect",
];

/** Explicit output ceiling (~90 tokens per option + JSON overhead). */
export const MAX_OUTPUT_TOKENS = 400;

const ARABIC_RE = /[\u0600-\u06FF]/;

function normalizeGerman(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s.,!?;:'"()\-]/g, "");
}

/**
 * Keeps only options that are actually usable and actually different:
 * no duplicate sentences, no two options making the same move, and every
 * translation readable Arabic.
 */
export function selectDistinctHints(candidates, { max = MAX_HINTS } = {}) {
  const seenText = new Set();
  const seenIntent = new Set();
  const kept = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const german = typeof candidate?.german === "string" ? candidate.german.trim() : "";
    const translation_ar = typeof candidate?.translation_ar === "string" ? candidate.translation_ar.trim() : "";
    if (!german || !translation_ar || !ARABIC_RE.test(translation_ar)) continue;
    const key = normalizeGerman(german);
    if (!key || seenText.has(key)) continue;
    const intent = HINT_INTENTS.includes(candidate?.intent) ? candidate.intent : "answer";
    if (seenIntent.has(intent)) continue;
    seenText.add(key);
    seenIntent.add(intent);
    kept.push({ german, translation_ar, intent });
    if (kept.length >= max) break;
  }
  return kept;
}

function buildPrompt({ reply, cefrLevel, scenarioTitle, recentHistory }) {
  return `An Arabic-speaking learner is practising spoken German. They must answer this line from their conversation partner: "${reply}".
Level: ${cefrLevel}. Scenario: ${scenarioTitle}.
Bounded recent conversation context (at most the last four messages): ${JSON.stringify(recentHistory)}.

Give between ${MIN_HINTS} and ${MAX_HINTS} German reply options that are DIFFERENT CONVERSATIONAL MOVES available at this exact point — for example: answering the question directly, agreeing, disagreeing, adding more detail, asking a follow-up question, saying they did not understand (clarify), expressing uncertainty, or politely deflecting.
Rules:
- Each option must be a complete, natural sentence at CEFR level ${cefrLevel} — never a fragment or a grammar exercise.
- The options must NOT be rephrasings of one idea. If the partner asked a yes/no question, offer at least one agreement and one disagreement (or a detail-adding answer) — never two ways of saying yes.
- Use only the bounded context given above; do not invent facts about the learner.
- intent must be the move that option makes, chosen from: ${HINT_INTENTS.join(", ")}. Two options may never share the same intent.
- translation_ar must convey the meaning naturally in Modern Standard Arabic (not word-by-word transliteration).
- Never use religious greeting substitutions.
Respond strictly in JSON:
{ "hints": [ { "german": "string", "translation_ar": "string", "intent": "string" } ] }`;
}

function buildResponseSchema() {
  return {
    type: "OBJECT",
    properties: {
      hints: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            german: { type: "STRING" },
            translation_ar: { type: "STRING" },
            intent: { type: "STRING", enum: HINT_INTENTS },
          },
          required: ["german", "translation_ar", "intent"],
          propertyOrdering: ["german", "translation_ar", "intent"],
        },
      },
    },
    required: ["hints"],
  };
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {object} cors
 * @param {object} deps worker-scoped internals, injected at the call site
 */
export async function handleHintsRoute(request, env, cors, deps) {
  const {
    authenticateAiRequest,
    boundedHistory,
    hasUsableProvider,
    readAiCache,
    writeAiCache,
    callAiRouter,
    cleanJson,
    json,
  } = deps;

  const body = await request.json().catch(() => null);
  const { scenario_title, cefr_level, last_ai_reply, history } = body || {};

  const auth = await authenticateAiRequest(request, body, env, cors, {
    level: cefr_level || "A1",
    quotaExempt: true,
    requireEntitlement: true,
  });
  if (auth.response) return auth.response;

  const reply = (last_ai_reply || "").trim();
  const recentHistory = boundedHistory(history, "hints");
  if (!hasUsableProvider(env)) {
    return json({ error: "ai_unavailable" }, 503, cors);
  }

  const cefrLevel = cefr_level || "A1";
  const scenarioTitle = scenario_title || "";
  // `v2` keeps single-hint entries cached by the previous version from ever
  // being served to a client that now expects 2-4 distinct moves.
  const cacheKey = `v2:${cefrLevel}:${scenarioTitle}:${reply}:${JSON.stringify(recentHistory)}`.toLowerCase();
  // KV-backed (namespace "hints"). The per-isolate Map this replaced was cold on
  // every recycled isolate, so the same hint set was regenerated after every
  // deploy and every idle gap — one of the ways free-tier quota disappeared.
  const cached = await readAiCache(env, "hints", cacheKey);
  if (Array.isArray(cached) && cached.length > 0) {
    return json({ hints: cached, cached: true }, 200, cors);
  }

  const payload = {
    contents: [{ parts: [{ text: buildPrompt({ reply, cefrLevel, scenarioTitle, recentHistory }) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: buildResponseSchema(),
      temperature: 0.5,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  };

  let raw;
  try {
    raw = await callAiRouter(payload, env, { preferFast: true });
  } catch (err) {
    console.error("[ai/hints] pool exhausted:", String(err?.message || err).slice(0, 160));
    return json({ error: "ai_unavailable", code: "AI_HINTS_FAILED", message: "تعذر توليد اقتراحات الآن." }, 502, cors);
  }
  const parsed = cleanJson(raw);
  let candidates = Array.isArray(parsed.hints) ? parsed.hints : [];

  // Same defensive recovery as before: a truncated/loosely-framed reply still
  // yields usable options instead of an empty sheet.
  if (candidates.length === 0 && typeof raw === "string") {
    const germanMatches = [...raw.matchAll(/"german"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => m[1]);
    const arMatches = [...raw.matchAll(/"translation_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => m[1]);
    const intentMatches = [...raw.matchAll(/"intent"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => m[1]);
    candidates = germanMatches.map((german, i) => ({
      german: german.replace(/\\"/g, '"'),
      translation_ar: arMatches[i] ? arMatches[i].replace(/\\"/g, '"') : "",
      intent: intentMatches[i] ? intentMatches[i].replace(/\\"/g, '"') : "answer",
    }));
  }

  const hints = selectDistinctHints(candidates);

  if (hints.length > 0) {
    await writeAiCache(env, "hints", cacheKey, hints, { ttlSeconds: 7 * 86400 });
  }

  return json(
    {
      hints,
      // Tells the client whether the "more options" expander has anything to
      // show, without leaking the model's raw output.
      distinctIntents: hints.length,
      belowTarget: hints.length < MIN_HINTS,
    },
    200,
    cors
  );
}
