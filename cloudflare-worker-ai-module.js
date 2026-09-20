/**
 * Katzu AI Server-Side Worker Module (Cloudflare Worker)
 * 
 * Supports 6+ Gemini API keys with:
 * 1. Automatic Key Rotation: If an API key hits rate limits (429 / RESOURCE_EXHAUSTED) or (403),
 *    it is placed in a temporary cooldown (60 seconds) and immediately switches to the next key.
 * 2. Instant Routing: Active working keys are preferred so users never wait for exhausted keys.
 * 3. Fast Model Fallback: Tries flash-lite models first with strict timeouts to prevent lag.
 * 4. Parallel Roleplay + Evaluation: Executes roleplay counterpart & pedagogical feedback concurrently.
 */

const DEFAULT_MODEL_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-flash-latest"
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Content-Type": "application/json; charset=utf-8"
};

// In-memory key health state across worker invocations (per Cloudflare Edge isolate)
let primaryWorkingModel = null;
let requestCounter = 0;
const keyCooldownMap = new Map(); // key -> cooldownExpiryTimestamp
const keyConsecutiveFails = new Map(); // key -> consecutive fail count
const translationCache = new Map(); // text.toLowerCase() -> translation_ar (LRU max 1000)
const hintsCache = new Map(); // cacheKey -> hints array (LRU max 500)

function isKeyCoolingDown(key) {
  const expiry = keyCooldownMap.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    keyCooldownMap.delete(key);
    return false;
  }
  return true;
}

function markKeyCooldown(key, status = 429) {
  const fails = (keyConsecutiveFails.get(key) || 0) + 1;
  keyConsecutiveFails.set(key, fails);

  let durationMs = 25000;
  if (status === 403) {
    durationMs = 3600000;
  } else if (fails === 2) {
    durationMs = 60000;
  } else if (fails >= 3) {
    durationMs = 120000;
  }

  keyCooldownMap.set(key, Date.now() + durationMs);
}

function markKeySuccess(key) {
  keyConsecutiveFails.delete(key);
  keyCooldownMap.delete(key);
}

function getCache(map, key) {
  if (!map.has(key)) return null;
  const val = map.get(key);
  map.delete(key);
  map.set(key, val);
  return val;
}

function setCache(map, key, val, maxSize = 1000) {
  if (map.size >= maxSize) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
  map.set(key, val);
}

function inspectGeminiKeys(env) {
  const rawList = [];

  if (env && typeof env === "object") {
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === "string" && v.trim().length > 0) {
        if (k === "GEMINI_API_KEYS") {
          v.split(/[,;\n]+/).forEach(s => {
            const trimmed = s.trim().replace(/^["']|["']$/g, "");
            if (trimmed) rawList.push({ key: trimmed, source: k });
          });
        } else if (k === "GEMINI_API_KEY" || /^GEMINI_API_KEY_\d+$/i.test(k) || /^GEMINI_KEY_\d+$/i.test(k)) {
          const trimmed = v.trim().replace(/^["']|["']$/g, "");
          if (trimmed) rawList.push({ key: trimmed, source: k });
        }
      }
    }
  }

  if (rawList.length === 0) {
    if (env.GEMINI_API_KEYS && typeof env.GEMINI_API_KEYS === "string") {
      env.GEMINI_API_KEYS.split(/[,;\n]+/).forEach(s => {
        const trimmed = s.trim().replace(/^["']|["']$/g, "");
        if (trimmed) rawList.push({ key: trimmed, source: "GEMINI_API_KEYS" });
      });
    }
    for (let i = 1; i <= 30; i++) {
      if (env[`GEMINI_API_KEY_${i}`]) {
        const trimmed = String(env[`GEMINI_API_KEY_${i}`]).trim().replace(/^["']|["']$/g, "");
        if (trimmed) rawList.push({ key: trimmed, source: `GEMINI_API_KEY_${i}` });
      }
      if (env[`GEMINI_KEY_${i}`]) {
        const trimmed = String(env[`GEMINI_KEY_${i}`]).trim().replace(/^["']|["']$/g, "");
        if (trimmed) rawList.push({ key: trimmed, source: `GEMINI_KEY_${i}` });
      }
    }
    if (env.GEMINI_API_KEY) {
      const trimmed = String(env.GEMINI_API_KEY).trim().replace(/^["']|["']$/g, "");
      if (trimmed) rawList.push({ key: trimmed, source: "GEMINI_API_KEY" });
    }
  }

  const validEntries = rawList.filter(e => e.key && e.key.length > 5);

  const counts = new Map();
  for (const entry of validEntries) {
    counts.set(entry.key, (counts.get(entry.key) || 0) + 1);
  }

  const duplicates = [];
  for (const [key, count] of counts.entries()) {
    if (count > 1) {
      const mask = key.length > 10 ? `${key.substring(0, 8)}...${key.substring(key.length - 4)}` : "key";
      duplicates.push(`${mask} (appears ${count} times)`);
    }
  }

  const uniqueKeys = [...new Set(validEntries.map(e => e.key))];
  const previews = uniqueKeys.map((k, idx) => {
    const mask = k.length > 10 ? `${k.substring(0, 8)}...${k.substring(k.length - 4)}` : k;
    return `Key #${idx + 1}: ${mask}`;
  });

  return {
    uniqueKeys,
    rawCount: validEntries.length,
    uniqueCount: uniqueKeys.length,
    hasDuplicates: duplicates.length > 0,
    duplicates,
    previews
  };
}

function getGeminiApiKeys(env) {
  return inspectGeminiKeys(env).uniqueKeys;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    const inspection = inspectGeminiKeys(env);
    const apiKeys = inspection.uniqueKeys;

    if (apiKeys.length === 0) {
      return new Response(JSON.stringify({
        error: "No Gemini API keys configured on server. Add GEMINI_API_KEYS or GEMINI_API_KEY_1..14 in Cloudflare Settings -> Variables & Secrets."
      }), {
        status: 500,
        headers: CORS_HEADERS
      });
    }

    try {
      if (path === "/ai/turn" || path === "/turn") {
        const body = await request.json();
        const result = await handleConversationTurn(body, apiKeys);
        return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
      }

      if (path === "/ai/translate" || path === "/translate") {
        const body = await request.json();
        const result = await handleTranslation(body.text || "", apiKeys);
        return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
      }

      if (path === "/ai/hints" || path === "/hints") {
        const body = await request.json();
        const result = await handleHints(body, apiKeys);
        return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
      }

      if (path === "/ai/health" || path === "/health") {
        const coolingCount = apiKeys.filter(k => isKeyCoolingDown(k)).length;
        return new Response(JSON.stringify({
          status: "healthy",
          service: "Katzu Multi-Key AI Engine",
          keysConfigured: inspection.uniqueCount,
          rawKeysFound: inspection.rawCount,
          hasDuplicateKeys: inspection.hasDuplicates,
          duplicateWarning: inspection.hasDuplicates 
            ? `One or more keys are duplicated: ${inspection.duplicates.join(", ")}`
            : null,
          healthyKeys: inspection.uniqueCount - coolingCount,
          coolingDownKeys: coolingCount,
          primaryWorkingModel: primaryWorkingModel || "auto-pinning on first call",
          cachedTranslationsCount: translationCache.size,
          cachedHintsCount: hintsCache.size,
          ready: apiKeys.length > 0,
          strategy: "single-prompt fusion + round-robin 14-key load balancing + edge memory cache",
          registeredKeysMasked: inspection.previews
        }), { headers: CORS_HEADERS });
      }

      return new Response(JSON.stringify({ error: "Endpoint not found" }), {
        status: 404,
        headers: CORS_HEADERS
      });
    } catch (err) {
      console.error("[Katzu-AI-Worker Error]", err);
      return new Response(JSON.stringify({
        error: err.message || "Server AI processing error"
      }), {
        status: 500,
        headers: CORS_HEADERS
      });
    }
  }
};

/**
 * Executes a Gemini prompt with ultra-fast multi-key round-robin load distribution and cooldown failover.
 */
async function callGeminiWithFailover(apiKeys, payload) {
  let lastError = null;
  const numKeys = apiKeys.length;
  if (numKeys === 0) throw new Error("No Gemini API keys available");

  // Round-robin distribution across all 14+ keys
  const startIndex = (requestCounter++) % numKeys;
  const orderedIndices = [];

  for (let i = 0; i < numKeys; i++) {
    const idx = (startIndex + i) % numKeys;
    orderedIndices.push(idx);
  }

  // Sort so non-cooling-down keys come first
  orderedIndices.sort((a, b) => {
    const aCool = isKeyCoolingDown(apiKeys[a]) ? 1 : 0;
    const bCool = isKeyCoolingDown(apiKeys[b]) ? 1 : 0;
    return aCool - bCool;
  });

  const models = primaryWorkingModel
    ? [primaryWorkingModel, ...DEFAULT_MODEL_CHAIN.filter(m => m !== primaryWorkingModel)]
    : DEFAULT_MODEL_CHAIN;

  for (const keyIdx of orderedIndices) {
    const key = apiKeys[keyIdx];

    for (const model of models) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        
        // Timeout signal: 3.8 seconds maximum per single model attempt to eliminate latency spikes
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3800);

        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const data = await resp.json();
          const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidate) {
            primaryWorkingModel = model;
            markKeySuccess(key);
            return candidate;
          }
        }

        const respText = await resp.text().catch(() => "");

        // If rate limited (429) or quota exceeded or permission denied (403)
        if (resp.status === 429 || resp.status === 403 || respText.includes("RESOURCE_EXHAUSTED")) {
          console.warn(`[AI Failover] Key #${keyIdx + 1} throttled (${resp.status}). Progressive cooldown...`);
          markKeyCooldown(key, resp.status);
          lastError = new Error(`Key #${keyIdx + 1} rate limited (${resp.status})`);
          break; // Break model loop immediately to rotate to next API key
        } else if (resp.status === 404) {
          lastError = new Error(`Model ${model} not available (404)`);
        } else {
          lastError = new Error(`Key #${keyIdx + 1} model ${model} HTTP ${resp.status}: ${respText.slice(0, 100)}`);
        }
      } catch (e) {
        lastError = e;
      }
    }
  }

  throw lastError || new Error("All configured Gemini API keys and models failed");
}

function cleanJson(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;

  let text = String(raw).trim();
  // Strip markdown code fences
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  // 1. Direct parse attempt
  try {
    return JSON.parse(text);
  } catch (_) {}

  // 2. Extract between first '{' and last '}'
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = text.substring(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      try {
        // Fix trailing commas or raw control characters
        const sanitized = candidate
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/[\u0000-\u001F]+/g, (m) => (m === "\n" || m === "\r" ? " " : ""));
        return JSON.parse(sanitized);
      } catch (_) {}
    }
  }

  // 3. Fallback regex field extraction so an error is NEVER thrown to user
  const replyDeMatch = text.match(/"reply_de"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const replyArMatch = text.match(/"reply_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const correctedMatch = text.match(/"corrected_german"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const ruleMatch = text.match(/"grammar_rule"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const explMatch = text.match(/"explanation_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const noteMatch = text.match(/"positive_note_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);

  if (replyDeMatch || replyArMatch) {
    return {
      reply_de: replyDeMatch ? replyDeMatch[1].replace(/\\"/g, '"') : "Sehr gerne!",
      reply_ar: replyArMatch ? replyArMatch[1].replace(/\\"/g, '"') : "بكل سرور!",
      evaluation: {
        is_correct: !text.includes('"is_correct": false') && !text.includes('"is_correct":false'),
        original_mistake: "",
        corrected_german: correctedMatch ? correctedMatch[1].replace(/\\"/g, '"') : "",
        grammar_rule: ruleMatch ? ruleMatch[1].replace(/\\"/g, '"') : "Kommunikation",
        explanation_ar: explMatch ? explMatch[1].replace(/\\"/g, '"') : "جملتك مفهومة ومناسبة للمحادثة.",
        user_message_translation_ar: "",
        positive_note_ar: noteMatch ? noteMatch[1].replace(/\\"/g, '"') : "أحسنت! واصل التحدث بثقة."
      }
    };
  }

  // 4. Ultimate fallback if plain text was returned
  return {
    reply_de: text.slice(0, 180).replace(/["{}]/g, ""),
    reply_ar: "",
    evaluation: {
      is_correct: true,
      original_mistake: "",
      corrected_german: "",
      grammar_rule: "Allgemein",
      explanation_ar: "استجابة طبيعية.",
      user_message_translation_ar: "",
      positive_note_ar: "أحسنت في المتابعة!"
    }
  };
}

/**
 * Handles /ai/turn with single-prompt fusion (2x faster, 50% less quota)
 */
async function handleConversationTurn(body, apiKeys) {
  const { scenario_id, scenario_title, persona, cefr_level, user_message, history } = body;
  const level = cefr_level || "A1";

  const systemInstruction = `You are an expert native German language teacher and conversational counterpart in roleplay '${scenario_title || scenario_id}'.
Persona: ${persona || "friendly conversational partner"}.
Target Learner CEFR Level: ${level}.

YOUR DUAL MISSION:
1. Continue the conversational German roleplay naturally in character at level ${level}.
2. Provide an accurate Modern Standard Arabic translation of your reply.
3. Perform a rigorous pedagogical evaluation of the learner's German message: "${user_message}".

CRITICAL PEDAGOGICAL & CULTURAL RULES:
- Never translate secular German greetings ("Hallo", "Guten Tag", "Guten Morgen", "Guten Abend") into "السلام عليكم". Always use "مرحباً", "أهلاً", "صباح الخير", "مساء الخير".
- Keep reply_de completely in natural German suitable for ${level}.
- If the learner made a mistake: set is_correct=false, identify original_mistake, give corrected_german, name the grammar_rule in German, explain it clearly in Arabic (explanation_ar), and add warm positive encouragement in Arabic (positive_note_ar).
- If the learner is correct: set is_correct=true, set original_mistake="", provide concise praise in positive_note_ar.

Respond STRICTLY in this JSON structure:
{
  "reply_de": "string",
  "reply_ar": "string",
  "evaluation": {
    "is_correct": boolean,
    "original_mistake": "string",
    "corrected_german": "string",
    "grammar_rule": "string",
    "explanation_ar": "string",
    "user_message_translation_ar": "string",
    "positive_note_ar": "string"
  }
}`;

  const conversationPayload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [
      ...(history || []).map(h => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text }]
      })),
      { role: "user", parts: [{ text: user_message }] }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
      maxOutputTokens: 900
    }
  };

  const raw = await callGeminiWithFailover(apiKeys, conversationPayload);
  const parsed = cleanJson(raw);

  const evaluation = parsed.evaluation || {
    is_correct: true,
    original_mistake: "",
    corrected_german: user_message,
    grammar_rule: "Allgemeine Kommunikation",
    explanation_ar: "جملتك واضحة وصحيحة في سياق المحادثة.",
    user_message_translation_ar: "",
    positive_note_ar: "أحسنت! استمر في التحدث بثقة."
  };

  return {
    reply_de: parsed.reply_de || "Danke!",
    reply_ar: parsed.reply_ar || "شكراً!",
    evaluation: evaluation
  };
}

/**
 * Handles /ai/translate with edge LRU caching
 */
async function handleTranslation(text, apiKeys) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { translation_ar: "" };

  const cacheKey = trimmed.toLowerCase();
  const cached = getCache(translationCache, cacheKey);
  if (cached) {
    return { translation_ar: cached, cached: true };
  }

  const prompt = `Translate this German sentence into accurate, natural Modern Standard Arabic.
German: "${trimmed}"
Never use "السلام عليكم" for "Guten Tag" or "Hallo". Use "مرحباً".
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

  const raw = await callGeminiWithFailover(apiKeys, payload);
  const parsed = cleanJson(raw);
  const result = parsed.translation_ar || "";

  if (result) {
    setCache(translationCache, cacheKey, result, 1000);
  }

  return { translation_ar: result };
}

/**
 * Handles /ai/hints with edge LRU caching
 */
async function handleHints(body, apiKeys) {
  const { scenario_title, cefr_level, last_ai_reply } = body || {};
  const reply = (last_ai_reply || "").trim();

  const cacheKey = `${cefr_level || "A1"}:${scenario_title || ""}:${reply}`.toLowerCase();
  const cached = getCache(hintsCache, cacheKey);
  if (cached) {
    return { hints: cached, cached: true };
  }

  const prompt = `Generate exactly 3 practical German response options for an Arabic-speaking learner to reply to: "${reply}".
Level: ${cefr_level || "A1"}. Scenario: ${scenario_title || ""}.
Never use religious greeting substitutions.
Respond strictly in JSON:
{
  "hints": [
    { "german": "string", "translation_ar": "string" },
    { "german": "string", "translation_ar": "string" },
    { "german": "string", "translation_ar": "string" }
  ]
}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
      maxOutputTokens: 380
    }
  };

  const raw = await callGeminiWithFailover(apiKeys, payload);
  const parsed = cleanJson(raw);
  const hints = Array.isArray(parsed.hints) ? parsed.hints : [];

  if (hints.length > 0) {
    setCache(hintsCache, cacheKey, hints, 500);
  }

  return { hints };
}

