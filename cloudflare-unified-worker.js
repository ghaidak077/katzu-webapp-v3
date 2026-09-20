/**
 * Unified Cloudflare Worker: Auth, D1 Content CMS, Glassmorphic Admin Dashboard & 6+ Gemini AI Engine
 * 
 * Bindings required / supported:
 * - REDEEMED_CODES (KV)
 * - USER_PROGRESS (KV)
 * - DB (D1 Database)
 * - ADMIN_SECRET (Secret)
 * - HMAC_SECRET (Secret)
 * - GOOGLE_CLIENT_ID (Secret)
 * - GEMINI_API_KEYS (Secret: comma-separated list of 6+ keys)
 *   OR GEMINI_API_KEY, GEMINI_API_KEY_1..6 (Individual secrets)
 */

// ============================================================================
// AI ROUTER CONFIGURATION & STATE (HIGH-PERFORMANCE & RELIABILITY ENGINE)
// ============================================================================

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

let primaryWorkingModel = null;
let requestCounter = 0;
const keyCooldownMap = new Map(); // key -> cooldownExpiryTimestamp
const keyConsecutiveFails = new Map(); // key -> consecutive fail count
const translationCache = new Map(); // text.toLowerCase() -> translation_ar (LRU max 1000)
const hintsCache = new Map(); // key -> hints array (LRU max 500)

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

  // Progressive backoff:
  // 403 (revoked/bad): 1 hour
  // 429: 25s for 1st fail, 60s for 2nd, 120s for 3rd+
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
  map.set(key, val); // Move to recent (LRU)
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

  // 1. Dynamic inspection of all env variables / secrets
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

  // 2. Explicit checks up to 30 keys in case CF secrets aren't enumerable via Object.entries
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

  // Count frequencies to find duplicates
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

// ============================================================================
// CORS & SECURITY CONFIGURATION
// ============================================================================

function getCorsHeaders(request, env = {}) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env?.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  let allowOrigin = "";
  if (allowed.length === 0) {
    allowOrigin = origin || "*";
  } else if (allowed.includes(origin)) {
    allowOrigin = origin;
  } else {
    allowOrigin = allowed[0];
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function extractIdToken(request, body) {
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  if (body && typeof body.id_token === "string" && body.id_token.trim()) {
    return body.id_token.trim();
  }
  return null;
}

// In-memory rate limiting per user (sub)
const userRateLimits = new Map();

function checkRateLimit(userId, env = {}) {
  const limitPerMinute = parseInt(env?.AI_RATE_LIMIT_PER_MINUTE || "20", 10);
  const limitPerDay = parseInt(env?.AI_RATE_LIMIT_PER_DAY || "150", 10);
  const now = Date.now();
  const currentMinute = Math.floor(now / 60000);
  const currentDay = Math.floor(now / 86400000);

  let record = userRateLimits.get(userId);
  if (!record) {
    record = { minute: currentMinute, minuteCount: 0, day: currentDay, dayCount: 0 };
    userRateLimits.set(userId, record);
  }

  if (record.minute !== currentMinute) {
    record.minute = currentMinute;
    record.minuteCount = 0;
  }
  if (record.day !== currentDay) {
    record.day = currentDay;
    record.dayCount = 0;
  }

  if (record.minuteCount >= limitPerMinute) {
    return { allowed: false, reason: "minute_limit", retryAfter: 60 };
  }
  if (record.dayCount >= limitPerDay) {
    return { allowed: false, reason: "day_limit", retryAfter: 3600 };
  }

  record.minuteCount += 1;
  record.dayCount += 1;
  return { allowed: true };
}

async function checkUserEntitlement(account, cefrLevel, env = {}) {
  // 1. Active subscription in REDEEMED_CODES KV
  if (env?.REDEEMED_CODES) {
    const subRaw = await env.REDEEMED_CODES.get(`account:${account.sub}`);
    if (subRaw) {
      try {
        const sub = JSON.parse(subRaw);
        if (sub.expiresAt && new Date(sub.expiresAt).getTime() > Date.now()) {
          return { allowed: true, isSubscribed: true };
        }
      } catch {}
    }
  }

  // 2. Trial access: restricted to A1 level with 3 free sessions
  const level = (cefrLevel || "A1").toUpperCase();
  if (level !== "A1") {
    return {
      allowed: false,
      code: "PAYWALL_REQUIRED",
      message: "المستويات المتقدمة (A2, B1, B2) تتطلب اشتراك Katzu Pro نشط أو كود تفعيل."
    };
  }

  let trialSessionsUsed = 0;
  const maxTrialSessions = 3;
  if (env?.REDEEMED_CODES) {
    const trialRaw = await env.REDEEMED_CODES.get(`trial:${account.sub}`);
    if (trialRaw) {
      try {
        const trial = JSON.parse(trialRaw);
        trialSessionsUsed = trial.sessionsUsed || 0;
      } catch {}
    }
  }

  if (trialSessionsUsed >= maxTrialSessions) {
    return {
      allowed: false,
      code: "PAYWALL_REQUIRED",
      message: "انتهت الجلسات التجريبية المجانية (3 جلسات). يرجى الاشتراك في Katzu Pro لمتابعة التعلم."
    };
  }

  return { allowed: true, isSubscribed: false, trialSessionsRemaining: maxTrialSessions - trialSessionsUsed };
}

async function handleDeleteUser(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  if (!idToken) {
    return json({ error: "missing_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }

  if (env.USER_PROGRESS) {
    await env.USER_PROGRESS.delete(`progress:${account.sub}`);
  }
  if (env.REDEEMED_CODES) {
    await env.REDEEMED_CODES.delete(`account:${account.sub}`);
    await env.REDEEMED_CODES.delete(`trial:${account.sub}`);
  }
  if (env.DB) {
    try {
      await env.DB.prepare("DELETE FROM user_progress WHERE user_id = ?").bind(account.sub).run();
    } catch {}
  }

  return json({ success: true, message: "تم حذف الحساب والبيانات السحابية بنجاح." }, 200, cors);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = getCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // Enforce request size limit (64 KB)
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > 65536) {
      return json({ error: "payload_too_large", message: "Request payload exceeds 64KB limit." }, 413, cors);
    }

    try {
      // --- AI Engine Endpoints (6+ Keys, Cooldown Tracking & Failover) ---
      if ((url.pathname === "/ai/turn" || url.pathname === "/turn") && request.method === "POST") {
        return await handleAiConversationTurn(request, env, cors);
      }
      if ((url.pathname === "/ai/translate" || url.pathname === "/translate") && request.method === "POST") {
        return await handleAiTranslation(request, env, cors);
      }
      if ((url.pathname === "/ai/hints" || url.pathname === "/hints") && request.method === "POST") {
        return await handleAiHints(request, env, cors);
      }
      if ((url.pathname === "/ai/health" || url.pathname === "/health") && request.method === "GET") {
        return handleAiHealth(env, cors);
      }

      // --- User & Account Operations ---
      if (url.pathname === "/user/delete" && request.method === "POST") {
        return await handleDeleteUser(request, env, cors);
      }

      // --- Admin Dashboard (GET /admin or GET /admin/) ---
      if ((url.pathname === "/admin" || url.pathname === "/admin/") && request.method === "GET") {
        return new Response(renderAdminDashboardHtml(env), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      }

      // --- Worker 1 Core Auth & Progress Endpoints ---
      if (url.pathname === "/verify" && request.method === "POST") {
        return await handleVerify(request, env, cors);
      }
      if (url.pathname === "/check-status" && request.method === "POST") {
        return await handleCheckStatus(request, env, cors);
      }
      if (url.pathname === "/admin/generate" && request.method === "POST") {
        return await handleAdminGenerate(request, env, cors);
      }
      if (url.pathname === "/progress/sync" && request.method === "POST") {
        return await handleProgressSync(request, env, cors);
      }
      if (url.pathname === "/progress/get" && request.method === "POST") {
        return await handleProgressGet(request, env, cors);
      }

      // --- Worker 2 D1 Content Read Endpoints ---
      if (url.pathname === "/scenarios" && request.method === "GET") {
        return await handleGetScenarios(request, env, cors);
      }
      if (url.pathname.startsWith("/scenarios/") && request.method === "GET") {
        const id = url.pathname.slice("/scenarios/".length).trim();
        return await handleGetScenarioById(id, request, env, cors);
      }
      if (url.pathname === "/vocabulary" && request.method === "GET") {
        return await handleGetVocabulary(url, request, env, cors);
      }
      if (url.pathname === "/grammar" && request.method === "GET") {
        return await handleGetGrammar(url, request, env, cors);
      }
      if (url.pathname === "/admin/upload" && request.method === "POST") {
        return await handleAdminUpload(request, env, cors);
      }

      // --- Admin Subscription & Progress Telemetry Endpoints ---
      if (url.pathname === "/admin/lookup" && request.method === "POST") {
        return await handleAdminLookup(request, env, cors);
      }
      if (url.pathname === "/admin/edit" && request.method === "POST") {
        return await handleAdminEdit(request, env, cors);
      }
      if (url.pathname === "/admin/revoke" && request.method === "POST") {
        return await handleAdminRevoke(request, env, cors);
      }
      if (url.pathname === "/admin/progress-lookup" && request.method === "POST") {
        return await handleAdminProgressLookup(request, env, cors);
      }
      if (url.pathname === "/admin/progress-edit" && request.method === "POST") {
        return await handleAdminProgressEdit(request, env, cors);
      }

      // --- Single-Row Content CRUD for scenarios, vocabulary, grammar, starter_phrases ---
      const crudMatch = url.pathname.match(/^\/admin\/(scenarios|vocabulary|grammar|starter_phrases)(?:\/([^\/]+))?$/);
      if (crudMatch) {
        const type = crudMatch[1];
        const id = crudMatch[2];
        if (request.method === "GET") {
          return id
            ? await handleAdminGetSingleContent(type, id, request, env, cors)
            : await handleAdminListContent(type, request, env, cors);
        }
        if (request.method === "POST" && !id) {
          return await handleAdminCreateContent(type, request, env, cors);
        }
        if (request.method === "PUT" && id) {
          return await handleAdminUpdateContent(type, id, request, env, cors);
        }
        if (request.method === "DELETE" && id) {
          return await handleAdminDeleteContent(type, id, request, env, cors);
        }
      }

      return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      return json({ error: "server_error", detail: String(err) }, 500, cors);
    }
  },
};

// ============================================================================
// AI ROUTER ENGINE (14+ KEYS, ROUND-ROBIN, STICKY MODEL & FAST FAILOVER)
// ============================================================================

async function callGeminiWithFailover(apiKeys, payload) {
  let lastError = null;
  const numKeys = apiKeys.length;
  if (numKeys === 0) throw new Error("No Gemini API keys configured");

  // Round-robin start index distributes requests across all 14+ keys
  const startIndex = (requestCounter++) % numKeys;
  const orderedIndices = [];

  for (let i = 0; i < numKeys; i++) {
    orderedIndices.push((startIndex + i) % numKeys);
  }

  // Non-cooling-down keys come first
  orderedIndices.sort((a, b) => {
    const aCool = isKeyCoolingDown(apiKeys[a]) ? 1 : 0;
    const bCool = isKeyCoolingDown(apiKeys[b]) ? 1 : 0;
    return aCool - bCool;
  });

  // Prioritize primary working model first to eliminate 404 latency round-trips
  const models = primaryWorkingModel
    ? [primaryWorkingModel, ...DEFAULT_MODEL_CHAIN.filter(m => m !== primaryWorkingModel)]
    : DEFAULT_MODEL_CHAIN;

  for (const keyIdx of orderedIndices) {
    const key = apiKeys[keyIdx];

    for (const model of models) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        
        // 3.8 second adaptive timeout per attempt to eliminate slow hangs
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
            primaryWorkingModel = model; // Pin fastest working model
            markKeySuccess(key);
            return candidate;
          }
        }

        const respText = await resp.text().catch(() => "");

        // If rate limited (429), quota exhausted, or permission denied (403)
        if (resp.status === 429 || resp.status === 403 || respText.includes("RESOURCE_EXHAUSTED")) {
          if (respText.includes("per_model") || respText.includes("per_day")) {
            console.warn(`[AI Failover] Model ${model} daily quota hit on Key #${keyIdx + 1}. Trying next model...`);
            lastError = new Error(`Model ${model} daily quota exhausted`);
            continue; // try other models in chain for this key
          }
          console.warn(`[AI Failover] Key #${keyIdx + 1} exhausted (${resp.status}). Progressive cooldown & rotating...`);
          markKeyCooldown(key, resp.status);
          lastError = new Error(`Key #${keyIdx + 1} throttled (${resp.status})`);
          break; // break model loop immediately to rotate to next key
        } else if (resp.status === 404) {
          // Model not found in this region/tier, try next model without penalizing key
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

// ----------------------------------------------------------------------------
// SINGLE-PROMPT TURN FUSION (2x Speed & 50% Quota Savings)
// ----------------------------------------------------------------------------

async function handleAiConversationTurn(request, env, cors) {
  const apiKeys = getGeminiApiKeys(env);
  if (apiKeys.length === 0) {
    return json({ error: "No Gemini API keys configured. Set GEMINI_API_KEYS in Cloudflare settings." }, 500, cors);
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.user_message) {
    return json({ error: "user_message required" }, 400, cors);
  }

  // 1. Authenticate user from Google ID token
  const idToken = extractIdToken(request, body);
  if (!idToken) {
    return json({
      error: "unauthenticated",
      code: "UNAUTHENTICATED",
      message: "يرجى تسجيل الدخول بحساب Google أولاً لمتابعة المحادثة."
    }, 401, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({
      error: "invalid_id_token",
      code: "UNAUTHENTICATED",
      message: "جلسة الدخول غير صالحة أو منتهية. يرجى تسجيل الدخول مجدداً."
    }, 401, cors);
  }

  // 2. Enforce per-user rate limiting
  const rate = checkRateLimit(account.sub, env);
  if (!rate.allowed) {
    return json({
      error: "rate_limit_exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      message: "تم تجاوز الحد الأقصى للمحادثات مؤقتاً. يرجى الانتظار دقيقة.",
      retry_after: rate.retryAfter
    }, 429, cors);
  }

  // 3. Enforce active subscription or valid trial entitlement
  const { scenario_id, scenario_title, persona, cefr_level, user_message, history, is_final_turn } = body;
  const level = cefr_level || "A1";

  const entitlement = await checkUserEntitlement(account, level, env);
  if (!entitlement.allowed) {
    return json({
      error: "subscription_required",
      code: entitlement.code || "PAYWALL_REQUIRED",
      message: entitlement.message
    }, 402, cors);
  }

  const wrapUpInstruction = is_final_turn ? `
- CRITICAL FINAL TURN CONCLUSION: This is the FINAL exchange of this scenario. The learner is concluding the interaction.
- Provide a warm, friendly, realistic farewell and conclusion appropriate to this scenario (e.g. 'Auf Wiedersehen und einen schönen Tag noch!', 'Gute Besserung und tschüss!', 'Danke für Ihren Besuch, auf Wiedersehen!').
- Strictly DO NOT ask any new questions or introduce any new topics. Conclude the interaction warmly.` : `
- Continue the conversational German roleplay naturally in character at level ${level}.`;

  const systemInstruction = `You are an expert native German language teacher and conversational counterpart in roleplay '${scenario_title || scenario_id}'.
Persona: ${persona || "friendly conversational partner"}.
Target Learner CEFR Level: ${level}.

YOUR DUAL MISSION:
1. Continue the conversational German roleplay naturally in character at level ${level}. ${wrapUpInstruction}
2. Provide an accurate Modern Standard Arabic translation of your reply.
3. Perform a rigorous pedagogical evaluation of the learner's German message: "${user_message}".
4. Generate exactly 3 practical German response options (hints) for the learner to reply to your reply_de: Option 1 (direct answer or acceptance), Option 2 (alternative choice or preference), Option 3 (polite inquiry, question, or follow-up), with natural Modern Standard Arabic translations.

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
  },
  "hints": [
    { "german": "string", "translation_ar": "string" },
    { "german": "string", "translation_ar": "string" },
    { "german": "string", "translation_ar": "string" }
  ]
}
`;

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
      maxOutputTokens: 1150
    }
  };

  try {
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

    let hints = Array.isArray(parsed.hints) ? parsed.hints : [];
    if (hints.length === 0 && typeof raw === "string") {
      const germanMatches = [...raw.matchAll(/"german"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map(m => m[1]);
      const arMatches = [...raw.matchAll(/"translation_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map(m => m[1]);
      for (let i = 0; i < germanMatches.length && i < arMatches.length; i++) {
        hints.push({
          german: germanMatches[i].replace(/\\"/g, '"'),
          translation_ar: arMatches[i].replace(/\\"/g, '"')
        });
      }
    }

    return json({
      reply_de: parsed.reply_de || "Danke!",
      reply_ar: parsed.reply_ar || "شكراً!",
      evaluation: evaluation,
      hints: hints
    }, 200, cors);
  } catch (err) {
    console.error("[Unified Turn Error]", err);
    return json({ error: "ai_error", detail: String(err) }, 500, cors);
  }
}

// ----------------------------------------------------------------------------
// EDGE CACHED TRANSLATION (<5ms for repeated phrases)
// ----------------------------------------------------------------------------

async function handleAiTranslation(request, env, cors) {
  const apiKeys = getGeminiApiKeys(env);
  if (apiKeys.length === 0) {
    return json({ error: "No Gemini API keys configured." }, 500, cors);
  }

  const body = await request.json().catch(() => null);
  const text = (body?.text || "").trim();
  if (!text) return json({ translation_ar: "" }, 200, cors);

  // 1. Check in-memory Edge Cache (0ms latency, zero quota used)
  const cacheKey = text.toLowerCase();
  const cached = getCache(translationCache, cacheKey);
  if (cached) {
    return json({ translation_ar: cached, cached: true }, 200, cors);
  }

  const prompt = `Translate this German sentence into accurate, natural Modern Standard Arabic.
German: "${text}"
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
  const translation = parsed.translation_ar || "";

  if (translation) {
    setCache(translationCache, cacheKey, translation, 1000);
  }

  return json({ translation_ar: translation }, 200, cors);
}

// ----------------------------------------------------------------------------
// EDGE CACHED CONVERSATION HINTS
// ----------------------------------------------------------------------------

async function handleAiHints(request, env, cors) {
  const apiKeys = getGeminiApiKeys(env);
  if (apiKeys.length === 0) {
    return json({ error: "No Gemini API keys configured." }, 500, cors);
  }

  const body = await request.json().catch(() => null);
  const { scenario_title, cefr_level, last_ai_reply } = body || {};
  const reply = (last_ai_reply || "").trim();

  // 1. Check in-memory Edge Cache
  const cacheKey = `${cefr_level || "A1"}:${scenario_title || ""}:${reply}`.toLowerCase();
  const cached = getCache(hintsCache, cacheKey);
  if (cached) {
    return json({ hints: cached, cached: true }, 200, cors);
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
  let hints = Array.isArray(parsed.hints) ? parsed.hints : [];

  if (hints.length === 0 && typeof raw === "string") {
    const germanMatches = [...raw.matchAll(/"german"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map(m => m[1]);
    const arMatches = [...raw.matchAll(/"translation_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map(m => m[1]);
    for (let i = 0; i < germanMatches.length; i++) {
      hints.push({
        german: germanMatches[i].replace(/\\"/g, '"'),
        translation_ar: arMatches[i] ? arMatches[i].replace(/\\"/g, '"') : ""
      });
    }
  }

  if (hints.length > 0) {
    setCache(hintsCache, cacheKey, hints, 500);
  }

  return json({ hints }, 200, cors);
}

// ----------------------------------------------------------------------------
// DIAGNOSTIC HEALTH & ROUTER TELEMETRY
// ----------------------------------------------------------------------------

function handleAiHealth(env, cors) {
  const inspection = inspectGeminiKeys(env);
  const apiKeys = inspection.uniqueKeys;
  const coolingDownCount = apiKeys.filter(k => isKeyCoolingDown(k)).length;
  const healthyCount = apiKeys.length - coolingDownCount;

  return json({
    status: "healthy",
    service: "Katzu Unified Worker + Multi-Key AI Engine",
    keysConfigured: inspection.uniqueCount,
    rawKeysFound: inspection.rawCount,
    hasDuplicateKeys: inspection.hasDuplicates,
    duplicateWarning: inspection.hasDuplicates 
      ? `One or more keys are duplicated: ${inspection.duplicates.join(", ")}`
      : null,
    healthyKeys: healthyCount,
    coolingDownKeys: coolingDownCount,
    primaryWorkingModel: primaryWorkingModel || "auto-pinning on first call",
    cachedTranslationsCount: translationCache.size,
    cachedHintsCount: hintsCache.size,
    ready: apiKeys.length > 0,
    strategy: "single-prompt fusion + round-robin 14-key load balancing + edge memory cache",
    registeredKeysMasked: inspection.previews
  }, 200, cors);
}

// ============================================================================
// WORKER 1 IMPLEMENTATION (AUTH, SUBSCRIPTIONS & PROGRESS)
// ============================================================================

async function handleVerify(request, env, cors) {
  const body = await request.json().catch(() => null);
  const code = body?.code;
  const idToken = body?.id_token;

  if (!code || typeof code !== "string") {
    return json({ valid: false, reason: "malformed" }, 400, cors);
  }
  if (!idToken || typeof idToken !== "string") {
    return json({ valid: false, reason: "missing_id_token" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID);
  if (!account) {
    return json({ valid: false, reason: "invalid_id_token" }, 200, cors);
  }

  const parsed = parseCode(code);
  if (!parsed) {
    return json({ valid: false, reason: "malformed" }, 400, cors);
  }

  const { months, nonce, signature } = parsed;
  const expectedSig = await sign(`DE-${months}M-${nonce}`, env.HMAC_SECRET);
  if (expectedSig !== signature) {
    return json({ valid: false, reason: "invalid_signature" }, 200, cors);
  }

  const codeKey = `code:${code}`;
  const existingCode = await env.REDEEMED_CODES.get(codeKey);
  if (existingCode) {
    return json({ valid: false, reason: "already_redeemed" }, 200, cors);
  }

  const accountKey = `account:${account.sub}`;
  const existingAccountRaw = await env.REDEEMED_CODES.get(accountKey);
  const existingExpiresAt = existingAccountRaw
    ? JSON.parse(existingAccountRaw).expiresAt
    : null;

  const newExpiresAt = addMonthsIso(existingExpiresAt, months);

  await env.REDEEMED_CODES.put(codeKey, JSON.stringify({
    redeemedAt: new Date().toISOString(),
    account: account.sub,
  }));
  await env.REDEEMED_CODES.put(accountKey, JSON.stringify({
    email: account.email,
    expiresAt: newExpiresAt,
    updatedAt: new Date().toISOString(),
  }));

  if (account.email) {
    await env.REDEEMED_CODES.put(`email_index:${account.email.toLowerCase().trim()}`, account.sub);
  }

  return json({
    valid: true,
    months,
    expiresAt: newExpiresAt,
    email: account.email,
  }, 200, cors);
}

async function handleCheckStatus(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = body?.id_token;
  const now = new Date();

  if (!idToken || typeof idToken !== "string") {
    return json({ active: false, days_remaining: 0, server_time: now.toISOString(), reason: "missing_id_token" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID);
  if (!account) {
    return json({ active: false, days_remaining: 0, server_time: now.toISOString(), reason: "invalid_id_token" }, 200, cors);
  }

  const accountKey = `account:${account.sub}`;
  const raw = await env.REDEEMED_CODES.get(accountKey);
  if (!raw) {
    return json({ active: false, days_remaining: 0, server_time: now.toISOString(), expiresAt: null }, 200, cors);
  }

  const record = JSON.parse(raw);
  const expiry = new Date(record.expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const active = diffMs > 0;

  return json({
    active,
    days_remaining: daysRemaining,
    server_time: now.toISOString(),
    expiresAt: record.expiresAt,
  }, 200, cors);
}

async function handleAdminGenerate(request, env, cors) {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${env.ADMIN_SECRET}`) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  const body = await request.json().catch(() => null);
  const months = body?.months;
  if (!months || months < 1 || months > 12) {
    return json({ error: "months must be 1-12" }, 400, cors);
  }

  const nonce = crypto.randomUUID().split("-")[0].toUpperCase();
  const unsigned = `DE-${months}M-${nonce}`;
  const signature = await sign(unsigned, env.HMAC_SECRET);
  const code = `${unsigned}-${signature}`;

  return json({ code }, 200, cors);
}

async function handleProgressSync(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = body?.id_token;
  const incomingStats = body?.stats;
  const incomingTrainings = body?.trainings;
  const incomingSavedWordIds = body?.saved_word_ids;

  if (!idToken || typeof idToken !== "string") {
    return json({ error: "missing_id_token" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID);
  if (!account) {
    return json({ error: "invalid_id_token" }, 200, cors);
  }

  const key = `progress:${account.sub}`;
  const existingRaw = await env.USER_PROGRESS.get(key);
  const existing = existingRaw ? JSON.parse(existingRaw) : null;

  const now = Date.now();
  let merged;

  if (!existing) {
    merged = {
      stats: incomingStats || {},
      trainings: incomingTrainings || [],
      saved_word_ids: incomingSavedWordIds || [],
      updated_at: now,
    };
  } else {
    merged = {
      stats: mergeStats(existing.stats, incomingStats),
      trainings: mergeTrainings(existing.trainings, incomingTrainings),
      saved_word_ids: mergeSavedWordIds(existing.saved_word_ids, incomingSavedWordIds),
      updated_at: now,
    };
  }

  await env.USER_PROGRESS.put(key, JSON.stringify(merged));

  return json({ success: true, updated_at: now }, 200, cors);
}

async function handleProgressGet(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = body?.id_token;

  if (!idToken || typeof idToken !== "string") {
    return json({ error: "missing_id_token" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID);
  if (!account) {
    return json({ error: "invalid_id_token" }, 200, cors);
  }

  const key = `progress:${account.sub}`;
  const raw = await env.USER_PROGRESS.get(key);

  if (!raw) {
    return json({
      updated_at: null,
      stats: { level: "A1", streak_days: 0, total_points: 0, last_active_date: null },
      trainings: [],
      saved_word_ids: [],
    }, 200, cors);
  }

  return json(JSON.parse(raw), 200, cors);
}

function mergeStats(existingStats, incomingStats) {
  if (!existingStats) return incomingStats || {};
  if (!incomingStats) return existingStats;
  const existingUpdated = typeof existingStats.updated_at === "number" ? existingStats.updated_at : -Infinity;
  const incomingUpdated = typeof incomingStats.updated_at === "number" ? incomingStats.updated_at : -Infinity;
  if (incomingUpdated >= existingUpdated) return incomingStats;
  return existingStats;
}

function mergeTrainings(existingTrainings, incomingTrainings) {
  if (!existingTrainings || !Array.isArray(existingTrainings)) existingTrainings = [];
  if (!incomingTrainings || !Array.isArray(incomingTrainings)) incomingTrainings = [];
  const map = new Map();
  for (const t of existingTrainings) {
    if (t && t.scenario_id != null) map.set(t.scenario_id, { ...t });
  }
  for (const inc of incomingTrainings) {
    if (!inc || inc.scenario_id == null) continue;
    const ex = map.get(inc.scenario_id);
    if (!ex) {
      map.set(inc.scenario_id, { ...inc });
      continue;
    }
    map.set(inc.scenario_id, mergeTrainingEntry(ex, inc));
  }
  return [...map.values()];
}

function mergeTrainingEntry(existing, incoming) {
  const merged = { ...existing };
  for (const key of Object.keys(incoming)) {
    if (key === "scenario_id") {
      merged.scenario_id = incoming.scenario_id;
      continue;
    }
    const ev = existing[key];
    const iv = incoming[key];
    if (typeof ev === "boolean" || typeof iv === "boolean") {
      merged[key] = ev === true || iv === true;
    } else if (key === "effective_level") {
      if (iv == null) merged[key] = ev;
      else if (ev == null) merged[key] = iv;
      else merged[key] = iv > ev ? iv : ev;
    } else {
      merged[key] = iv != null ? iv : ev;
    }
  }
  return merged;
}

function mergeSavedWordIds(existingIds, incomingIds) {
  if (!existingIds || !Array.isArray(existingIds)) existingIds = [];
  if (!incomingIds || !Array.isArray(incomingIds)) incomingIds = [];
  const set = new Set([...existingIds, ...incomingIds]);
  return [...set];
}

function parseCode(code) {
  const match = code.trim().match(/^DE-(\d{1,2})M-([A-Z0-9]+)-([A-F0-9]+)$/i);
  if (!match) return null;
  const months = parseInt(match[1], 10);
  if (months < 1 || months > 12) return null;
  return { months, nonce: match[2], signature: match[3].toUpperCase() };
}

async function sign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().slice(0, 16);
}

async function verifyGoogleIdToken(idToken, expectedClientId, env = {}) {
  if (!idToken || typeof idToken !== "string") return null;

  // 1. Verify basic 3-part JWT structure
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  let payload = null;
  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    payload = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (!payload || !payload.sub) return null;

  // 2. Check expiration (exp in epoch seconds)
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < nowSec) {
    return null;
  }

  // 3. Check audience
  if (expectedClientId && payload.aud !== expectedClientId) {
    return null;
  }

  // 4. Check issuer
  const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
  if (payload.iss && !validIssuers.includes(payload.iss)) {
    return null;
  }

  // 5. Check for unsigned / none algorithm
  try {
    const headerStr = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
    const header = JSON.parse(headerStr);
    if (!header.alg || header.alg === "none") {
      return null;
    }
  } catch {
    return null;
  }

  // In test mode or local test runner
  if (env?.TEST_MODE || (typeof process !== "undefined" && process.env?.NODE_ENV === "test")) {
    return { sub: payload.sub, email: payload.email || "" };
  }

  // 6. Cryptographic tokeninfo verification via Google OAuth2 endpoint
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (expectedClientId && data.aud !== expectedClientId) return null;
    if (!data.sub) return null;
    if (data.exp && parseInt(data.exp, 10) < nowSec) return null;
    if (data.iss && !validIssuers.includes(data.iss)) return null;
    return { sub: data.sub, email: data.email || "" };
  } catch {
    return null;
  }
}

function addMonthsIso(existingIso, months) {
  const now = new Date();
  let base = now;
  if (existingIso) {
    const existing = new Date(existingIso);
    if (!isNaN(existing.getTime()) && existing.getTime() > now.getTime()) base = existing;
  }
  const result = new Date(base);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString();
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}

// ============================================================================
// WORKER 2 IMPLEMENTATION (D1 CONTENT DATABASE CMS)
// ============================================================================

const VALID_LEVELS = new Set(["A1", "A2", "B1", "B2"]);

function checkAdminAuth(request, env) {
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${env.ADMIN_SECRET}`;
}

async function handleGetScenarios(request, env, cors) {
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);
  const { results } = await env.DB.prepare("SELECT * FROM scenarios").all();
  return json(results || [], 200, cors);
}

async function handleGetScenarioById(id, request, env, cors) {
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);
  const scenario = await env.DB.prepare("SELECT * FROM scenarios WHERE id = ?").bind(id).first();
  if (!scenario) {
    return json({ error: "scenario_not_found" }, 404, cors);
  }
  const { results: phrases } = await env.DB.prepare(
    "SELECT * FROM starter_phrases WHERE scenario_id = ? ORDER BY level ASC, sort_order ASC"
  ).bind(id).all();

  return json({ ...scenario, starter_phrases: phrases || [] }, 200, cors);
}

async function handleGetVocabulary(url, request, env, cors) {
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);
  const level = url.searchParams.get("level");
  const topic = url.searchParams.get("topic");

  let query = "SELECT rowid AS id, * FROM vocabulary WHERE 1=1";
  const params = [];
  if (level) {
    query += " AND level = ?";
    params.push(level);
  }
  if (topic) {
    query += " AND topic = ?";
    params.push(topic);
  }

  const stmt = env.DB.prepare(query);
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all();
  return json(results || [], 200, cors);
}

async function handleGetGrammar(url, request, env, cors) {
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);
  const level = url.searchParams.get("level");

  let query = "SELECT * FROM grammar WHERE 1=1";
  const params = [];
  if (level) {
    query += " AND level = ?";
    params.push(level);
  }

  const stmt = env.DB.prepare(query);
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all();
  return json(results || [], 200, cors);
}

async function handleAdminUpload(request, env, cors) {
  if (!checkAdminAuth(request, env)) {
    return json({ error: "unauthorized" }, 401, cors);
  }
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const body = await request.json().catch(() => null);
  const contentType = body?.contentType;
  const rows = body?.rows;

  if (!contentType || !Array.isArray(rows) || rows.length === 0) {
    return json({ error: "invalid_body", detail: "contentType and non-empty rows array required" }, 400, cors);
  }

  const validTypes = ["scenarios", "starter_phrases", "vocabulary", "grammar"];
  if (!validTypes.includes(contentType)) {
    return json({ error: "invalid_contentType", allowed: validTypes }, 400, cors);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.level && !VALID_LEVELS.has(String(row.level).trim())) {
      return json({
        error: "invalid_level",
        detail: `Row index ${i} has invalid level '${row.level}'. Must be one of A1, A2, B1, B2.`,
      }, 400, cors);
    }
  }

  try {
    const stmts = [];

    for (const row of rows) {
      const keys = Object.keys(row).filter((k) => k !== "rowid");
      if (keys.length === 0) continue;

      const placeholders = keys.map(() => "?").join(", ");
      const columns = keys.join(", ");
      const values = keys.map((k) => row[k]);

      if (contentType === "scenarios" || contentType === "grammar") {
        if (!row.id) {
          return json({ error: "missing_id", detail: `Rows for ${contentType} require an 'id' property` }, 400, cors);
        }
        const updateAssignments = keys
          .filter((k) => k !== "id")
          .map((k) => `${k} = excluded.${k}`)
          .join(", ");

        const sql = `INSERT INTO ${contentType} (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateAssignments}`;
        stmts.push(env.DB.prepare(sql).bind(...values));
      } else {
        const sql = `INSERT INTO ${contentType} (${columns}) VALUES (${placeholders})`;
        stmts.push(env.DB.prepare(sql).bind(...values));
      }
    }

    if (stmts.length > 0) {
      await env.DB.batch(stmts);
    }

    return json({ success: true, count: stmts.length, contentType }, 200, cors);
  } catch (err) {
    return json({ error: "upload_failed", detail: String(err) }, 500, cors);
  }
}

// ============================================================================
// ADMIN SUBSCRIPTION & PROGRESS MANAGEMENT
// ============================================================================

async function handleAdminLookup(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  if (!email) return json({ error: "missing_email" }, 400, cors);

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) {
    return json({ found: false }, 200, cors);
  }

  const raw = await env.REDEEMED_CODES.get(`account:${sub}`);
  if (!raw) {
    return json({ found: false }, 200, cors);
  }

  const record = JSON.parse(raw);
  const expiresAt = record.expiresAt || null;
  const active = Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());

  return json({
    found: true,
    sub,
    email: record.email || email,
    expiresAt,
    active,
    updatedAt: record.updatedAt || null,
  }, 200, cors);
}

async function handleAdminEdit(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  if (!email) return json({ error: "missing_email" }, 400, cors);

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) return json({ error: "user_not_found" }, 404, cors);

  const accountKey = `account:${sub}`;
  const raw = await env.REDEEMED_CODES.get(accountKey);
  const record = raw ? JSON.parse(raw) : { email, expiresAt: null };

  let newExpiresAt;
  if (body.set_expiresAt !== undefined) {
    newExpiresAt = body.set_expiresAt ? new Date(body.set_expiresAt).toISOString() : null;
  } else if (body.add_months !== undefined) {
    const months = Number(body.add_months);
    if (isNaN(months)) return json({ error: "invalid_add_months" }, 400, cors);

    const now = new Date();
    let base = now;
    if (record.expiresAt) {
      const existing = new Date(record.expiresAt);
      if (!isNaN(existing.getTime())) base = existing;
    }
    const target = new Date(base);
    target.setUTCMonth(target.getUTCMonth() + months);
    newExpiresAt = target.toISOString();
  } else {
    return json({ error: "must_provide_set_expiresAt_or_add_months" }, 400, cors);
  }

  record.expiresAt = newExpiresAt;
  record.updatedAt = new Date().toISOString();
  await env.REDEEMED_CODES.put(accountKey, JSON.stringify(record));

  return json({ success: true, new_expiresAt: newExpiresAt }, 200, cors);
}

async function handleAdminRevoke(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  if (!email) return json({ error: "missing_email" }, 400, cors);

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) return json({ error: "user_not_found" }, 404, cors);

  const accountKey = `account:${sub}`;
  const raw = await env.REDEEMED_CODES.get(accountKey);
  const record = raw ? JSON.parse(raw) : { email };

  record.expiresAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  await env.REDEEMED_CODES.put(accountKey, JSON.stringify(record));

  return json({ success: true, revoked_at: record.expiresAt }, 200, cors);
}

async function handleAdminProgressLookup(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  if (!email) return json({ error: "missing_email" }, 400, cors);

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) return json({ error: "user_not_found" }, 404, cors);

  const raw = await env.USER_PROGRESS.get(`progress:${sub}`);
  if (!raw) {
    return json({
      updated_at: null,
      stats: { level: "A1", streak_days: 0, total_points: 0, last_active_date: null },
      trainings: [],
      saved_word_ids: [],
    }, 200, cors);
  }

  return json(JSON.parse(raw), 200, cors);
}

async function handleAdminProgressEdit(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  const progress = body?.progress;

  if (!email) return json({ error: "missing_email" }, 400, cors);
  if (!progress || typeof progress !== "object") {
    return json({ error: "missing_or_invalid_progress_object" }, 400, cors);
  }

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) return json({ error: "user_not_found" }, 404, cors);

  const updatedProgress = {
    ...progress,
    updated_at: Date.now(),
  };

  await env.USER_PROGRESS.put(`progress:${sub}`, JSON.stringify(updatedProgress));
  return json({ success: true, updated_at: updatedProgress.updated_at }, 200, cors);
}

// ============================================================================
// SINGLE-ROW D1 CONTENT CRUD
// ============================================================================

function isRowIdTable(type) {
  return type === "vocabulary" || type === "starter_phrases";
}

async function handleAdminListContent(type, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const sql = isRowIdTable(type)
    ? `SELECT rowid AS id, * FROM ${type} ORDER BY rowid DESC LIMIT 300`
    : `SELECT * FROM ${type} ORDER BY id DESC LIMIT 300`;

  const { results } = await env.DB.prepare(sql).all();
  return json(results || [], 200, cors);
}

async function handleAdminGetSingleContent(type, id, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const sql = isRowIdTable(type)
    ? `SELECT rowid AS id, * FROM ${type} WHERE rowid = ?`
    : `SELECT * FROM ${type} WHERE id = ?`;

  const row = await env.DB.prepare(sql).bind(id).first();
  if (!row) return json({ error: "not_found" }, 404, cors);

  return json(row, 200, cors);
}

async function handleAdminCreateContent(type, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "invalid_json_body" }, 400, cors);
  }

  if (body.level && !VALID_LEVELS.has(String(body.level).trim())) {
    return json({ error: "invalid_level", detail: "Level must be A1, A2, B1, or B2" }, 400, cors);
  }

  const keys = Object.keys(body).filter((k) => k !== "rowid" && (isRowIdTable(type) ? k !== "id" : true));
  if (keys.length === 0) return json({ error: "no_fields_to_insert" }, 400, cors);

  const columns = keys.join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => body[k]);

  if (!isRowIdTable(type)) {
    if (!body.id) return json({ error: "id_required_for_" + type }, 400, cors);
    const updateClauses = keys.filter((k) => k !== "id").map((k) => `${k} = excluded.${k}`).join(", ");
    const sql = `INSERT INTO ${type} (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateClauses}`;
    await env.DB.prepare(sql).bind(...values).run();
    return json({ success: true, id: body.id }, 201, cors);
  } else {
    const sql = `INSERT INTO ${type} (${columns}) VALUES (${placeholders})`;
    const result = await env.DB.prepare(sql).bind(...values).run();
    return json({ success: true, id: result.meta?.last_row_id }, 201, cors);
  }
}

async function handleAdminUpdateContent(type, id, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "invalid_json_body" }, 400, cors);
  }

  if (body.level && !VALID_LEVELS.has(String(body.level).trim())) {
    return json({ error: "invalid_level", detail: "Level must be A1, A2, B1, or B2" }, 400, cors);
  }

  const keys = Object.keys(body).filter((k) => k !== "id" && k !== "rowid");
  if (keys.length === 0) return json({ error: "no_fields_to_update" }, 400, cors);

  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => body[k]);
  values.push(id);

  const whereClause = isRowIdTable(type) ? "WHERE rowid = ?" : "WHERE id = ?";
  const sql = `UPDATE ${type} SET ${setClause} ${whereClause}`;

  const result = await env.DB.prepare(sql).bind(...values).run();
  if (result.meta?.changes === 0) {
    return json({ error: "not_found_or_no_change" }, 404, cors);
  }

  return json({ success: true, id }, 200, cors);
}

async function handleAdminDeleteContent(type, id, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const whereClause = isRowIdTable(type) ? "WHERE rowid = ?" : "WHERE id = ?";
  const sql = `DELETE FROM ${type} ${whereClause}`;

  const result = await env.DB.prepare(sql).bind(id).run();
  if (result.meta?.changes === 0) {
    return json({ error: "not_found" }, 404, cors);
  }

  return json({ success: true, deleted_id: id }, 200, cors);
}

// ============================================================================
// AESTHETIC DARK GLASSMORPHIC DASHBOARD (GET /admin) + AI STATUS CARD
// ============================================================================

function renderAdminDashboardHtml(env) {
  const apiKeys = getGeminiApiKeys(env);
  const keysCount = apiKeys.length;
  const coolingCount = apiKeys.filter(k => isKeyCoolingDown(k)).length;

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Katzu Admin Suite • Edge Control Plane</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          },
          colors: {
            surface: '#090d18',
            panel: 'rgba(16, 24, 43, 0.72)',
            card: 'rgba(19, 30, 56, 0.58)',
            accent: '#38bdf8',
            brand: '#2563eb',
            warning: '#f59e0b',
            success: '#10b981',
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #060912;
      background-image: 
        radial-gradient(circle at 85% 35%, rgba(249, 115, 22, 0.12) 0%, transparent 42%),
        radial-gradient(circle at 25% 15%, rgba(56, 189, 248, 0.14) 0%, transparent 40%),
        radial-gradient(circle at 60% 85%, rgba(99, 102, 241, 0.10) 0%, transparent 45%),
        linear-gradient(180deg, #060913 0%, #090e1c 100%);
      background-attachment: fixed;
      color: #e2e8f0;
      min-height: 100vh;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .glass-card {
      background: rgba(15, 23, 42, 0.68);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border-radius: 26px;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .glass-card:hover {
      border-color: rgba(56, 189, 248, 0.22);
    }

    .glass-nav-pill {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 28px;
    }

    .glow-cyan {
      box-shadow: 0 0 24px rgba(56, 189, 248, 0.35);
    }
    .glow-blue {
      box-shadow: 0 0 24px rgba(37, 99, 235, 0.45);
    }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(10, 15, 28, 0.5); }
    ::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.25); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(56, 189, 248, 0.45); }
  </style>
</head>
<body class="p-3 sm:p-6 lg:p-8 flex flex-col items-center">

  <!-- Toast Container -->
  <div id="toast-container" class="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <!-- Outer Max-Width Container -->
  <div class="w-full max-w-[1400px] flex flex-col md:flex-row gap-6">

    <!-- LEFT FLOATING PILL SIDEBAR -->
    <aside class="w-full md:w-20 flex md:flex-col items-center justify-between p-3.5 glass-nav-pill self-start md:sticky md:top-6 z-40 shrink-0">
      <div class="flex md:flex-col items-center gap-4 w-full">
        <button id="nav-home-btn" onclick="switchTab('subscriptions')" title="Dashboard Overview" class="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-blue-600 glow-blue transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
        </button>

        <button id="nav-subscriptions-btn" onclick="switchTab('subscriptions')" title="Subscriptions & License Codes" class="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
        </button>

        <button id="nav-content-btn" onclick="switchTab('content')" title="Content Studio (D1 CMS)" class="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
          </svg>
        </button>

        <button id="nav-progress-btn" onclick="switchTab('progress')" title="User Progress & Stats" class="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
          </svg>
        </button>
      </div>

      <div class="flex md:flex-col items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-amber-400 text-sm">
          ✦
        </div>
        <div class="text-[10px] font-semibold tracking-wider text-slate-400 uppercase hidden md:block">
          Admin ›
        </div>
      </div>
    </aside>

    <!-- MAIN WORKSPACE -->
    <main class="flex-1 flex flex-col gap-6">

      <!-- TOP BAR: Authentication & Live Session -->
      <header class="glass-card p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-cyan-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-lg font-bold text-white tracking-tight">Katzu Unified Control Plane</h1>
              <span id="session-badge" class="px-2 py-0.5 text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">Secret Required</span>
            </div>
            <p class="text-xs text-slate-400">KV Auth • D1 Content DB • Progress Telemetry • 14+ Gemini Multi-Key Engine</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div class="relative flex-1 sm:w-72">
            <input id="admin-secret-input" type="password" placeholder="Enter ADMIN_SECRET..." autocomplete="off" class="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs font-mono text-cyan-300 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors">
            <button onclick="toggleSecretVisibility()" class="absolute right-3 top-2.5 text-slate-400 hover:text-white" title="Toggle Secret Visibility">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </button>
          </div>
          <button onclick="applyAdminSecret()" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-xl text-xs font-semibold tracking-wide transition-all shadow-lg shadow-blue-500/20 active:scale-95">
            Authorize
          </button>
        </div>
      </header>

      <!-- HERO WIDGETS ROW -->
      <section class="grid grid-cols-1 md:grid-cols-12 gap-5">
        <div class="md:col-span-8 glass-card p-6 flex flex-col justify-between relative overflow-hidden group">
          <div class="flex items-start justify-between">
            <div>
              <span class="text-xs font-medium text-slate-400 tracking-wide uppercase">Unified Edge & AI Engine</span>
              <h2 class="text-2xl sm:text-3xl font-bold text-white mt-0.5 tracking-tight">Welcome, Administrator</h2>
              <p class="text-xs text-slate-400 mt-1">KV, D1 database, and 14+ Gemini AI round-robin router are live.</p>
            </div>
            <div class="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/80 text-xs font-mono text-cyan-300 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span id="live-clock">--:--:-- UTC</span>
            </div>
          </div>

          <div class="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-between relative">
            <svg class="w-full h-16 text-cyan-400" viewBox="0 0 500 80" fill="none" preserveAspectRatio="none">
              <defs>
                <linearGradient id="waveGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#2563eb" stop-opacity="0.3"/>
                  <stop offset="50%" stop-color="#38bdf8" stop-opacity="1"/>
                  <stop offset="100%" stop-color="#818cf8" stop-opacity="0.8"/>
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <path d="M 0 55 C 80 55, 120 20, 180 35 C 240 50, 300 10, 360 30 C 420 50, 460 25, 500 40" stroke="url(#waveGlow)" stroke-width="3.5" filter="url(#glow)"/>
              <circle cx="180" cy="35" r="4" fill="#38bdf8" class="animate-ping" style="animation-duration: 3s;"/>
              <circle cx="180" cy="35" r="3" fill="#ffffff"/>
              <circle cx="360" cy="30" r="4" fill="#60a5fa"/>
            </svg>
          </div>
        </div>

        <div class="md:col-span-4 glass-card p-6 flex flex-col justify-between">
          <div class="flex items-start justify-between">
            <div>
              <div id="calendar-date" class="text-sm font-semibold text-white">Gemini Router Status</div>
              <div class="text-xs text-slate-400">Multi-Key Load Balancer</div>
            </div>
            <div class="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              🤖
            </div>
          </div>

          <div class="my-4">
            <div class="flex items-center gap-3">
              <div class="text-3xl font-extrabold text-white tracking-tight">${keysCount} Keys</div>
              <div class="text-xs ${keysCount > 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'} border px-2 py-0.5 rounded-lg">
                ${keysCount > 0 ? 'Active' : 'No Keys Set'}
              </div>
            </div>
            <div class="text-[11px] text-slate-400 mt-1">
              Cooling Down: <span class="text-amber-300 font-mono">${coolingCount}</span> keys
            </div>
          </div>

          <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Route: <strong class="text-cyan-300">/ai/turn</strong></span>
            <span>Timeout: <strong class="text-slate-200">8s Fallback</strong></span>
          </div>
        </div>
      </section>

      <!-- TAB NAVIGATION BAR -->
      <nav class="flex items-center gap-2 p-1.5 glass-card self-start max-w-full overflow-x-auto">
        <button id="tab-btn-subscriptions" onclick="switchTab('subscriptions')" class="px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 bg-blue-600 text-white shadow-lg shadow-blue-600/30">
          <span>Subscriptions & Codes</span>
        </button>
        <button id="tab-btn-content" onclick="switchTab('content')" class="px-5 py-2.5 rounded-2xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all flex items-center gap-2">
          <span>Content Studio (D1 CMS)</span>
        </button>
        <button id="tab-btn-progress" onclick="switchTab('progress')" class="px-5 py-2.5 rounded-2xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all flex items-center gap-2">
          <span>User Progress Telemetry</span>
        </button>
      </nav>

      <!-- TAB 1: SUBSCRIPTIONS & LICENSE GENERATION -->
      <section id="tab-view-subscriptions" class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-7 glass-card p-6 flex flex-col gap-5">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-bold text-white">Subscription Directory</h3>
                <p class="text-xs text-slate-400">Search by user email to inspect expiration or modify status.</p>
              </div>
              <span class="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-800 text-cyan-300">KV: email_index</span>
            </div>

            <div class="flex items-center gap-2">
              <input id="sub-lookup-email" type="email" placeholder="student@example.com" class="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400">
              <button onclick="lookupSubscription()" class="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold transition-all">
                Lookup User
              </button>
            </div>

            <div id="sub-result-card" class="hidden p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <span id="sub-display-email" class="text-sm font-bold text-white"></span>
                  <div id="sub-display-sub" class="text-[11px] font-mono text-slate-400 mt-0.5"></div>
                </div>
                <span id="sub-display-status-pill" class="px-3 py-1 rounded-full text-xs font-bold"></span>
              </div>

              <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/80 text-xs">
                <div>
                  <span class="text-slate-400">Expires At:</span>
                  <div id="sub-display-expires" class="font-mono text-slate-200 mt-0.5">-</div>
                </div>
                <div>
                  <span class="text-slate-400">Active Access:</span>
                  <div id="sub-display-active" class="font-semibold text-slate-200 mt-0.5">-</div>
                </div>
              </div>

              <div class="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                <button onclick="revokeSubscription()" class="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-semibold transition-all">
                  Revoke Immediately
                </button>

                <div class="flex items-center gap-2">
                  <button onclick="quickAddMonths(1)" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg text-slate-200">+1 Mo</button>
                  <button onclick="quickAddMonths(3)" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg text-slate-200">+3 Mo</button>
                  <button onclick="quickAddMonths(12)" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg text-slate-200">+1 Yr</button>
                </div>
              </div>

              <div class="pt-3 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-[11px] text-slate-400 mb-1">Set Exact ISO Expiration</label>
                  <div class="flex gap-1.5">
                    <input id="sub-edit-exact-date" type="datetime-local" class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
                    <button onclick="saveExactExpiry()" class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold text-white">Set</button>
                  </div>
                </div>
                <div>
                  <label class="block text-[11px] text-slate-400 mb-1">Add / Subtract Months</label>
                  <div class="flex gap-1.5">
                    <input id="sub-edit-delta-months" type="number" placeholder="e.g. 6 or -2" class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
                    <button onclick="saveDeltaMonths()" class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold text-white">Apply</button>
                  </div>
                </div>
              </div>
            </div>
            <div id="sub-empty-state" class="py-12 text-center text-xs text-slate-500">
              Search a user email above to review active subscription terms.
            </div>
          </div>

          <div class="lg:col-span-5 glass-card p-6 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-base font-bold text-white">License Key Forge</h3>
                  <p class="text-xs text-slate-400">Generates HMAC-signed <code class="text-cyan-300">DE-[X]M-NONCE-SIG</code></p>
                </div>
                <div class="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 text-xs">
                  HMAC
                </div>
              </div>

              <div class="my-6 flex flex-col items-center justify-center">
                <div class="relative w-44 h-44 flex items-center justify-center">
                  <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.06)" stroke-width="6" fill="transparent"/>
                    <circle id="generator-ring" cx="50" cy="50" r="42" stroke="url(#timerGrad)" stroke-width="6" stroke-dasharray="264" stroke-dashoffset="66" stroke-linecap="round" fill="transparent"/>
                    <defs>
                      <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#f59e0b"/>
                        <stop offset="50%" stop-color="#ef4444"/>
                        <stop offset="100%" stop-color="#8b5cf6"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  <div class="absolute flex flex-col items-center">
                    <span id="generator-months-display" class="text-3xl font-extrabold text-white">6</span>
                    <span class="text-[11px] uppercase tracking-wider text-slate-400">Months</span>
                  </div>
                </div>

                <div class="w-full mt-4 px-4">
                  <input id="generator-months-slider" type="range" min="1" max="12" value="6" oninput="updateGeneratorSlider(this.value)" class="w-full accent-cyan-400 cursor-pointer">
                  <div class="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>1M</span>
                    <span>3M</span>
                    <span>6M</span>
                    <span>12M</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <button onclick="generateAdminCode()" class="w-full py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:opacity-95 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-lg shadow-indigo-500/25 active:scale-98 flex items-center justify-center gap-2">
                <span>⚡ Generate Signed Code</span>
              </button>

              <div id="generated-code-box" class="hidden p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span id="generated-code-text" class="text-xs font-mono text-cyan-300 select-all font-semibold"></span>
                <button onclick="copyGeneratedCode()" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded text-slate-300 transition-colors">
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- TAB 2: CONTENT STUDIO (D1 CMS) -->
      <section id="tab-view-content" class="hidden space-y-6">
        <div class="glass-card p-6 space-y-6">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="flex p-1 rounded-xl bg-slate-900 border border-slate-800">
                <button onclick="selectContentType('scenarios')" id="type-btn-scenarios" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white transition-all">Scenarios</button>
                <button onclick="selectContentType('vocabulary')" id="type-btn-vocabulary" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">Vocabulary</button>
                <button onclick="selectContentType('grammar')" id="type-btn-grammar" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">Grammar</button>
                <button onclick="selectContentType('starter_phrases')" id="type-btn-starter_phrases" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">Phrases</button>
              </div>
              <span id="content-row-count" class="text-xs font-mono text-slate-400">0 rows</span>
            </div>

            <div class="flex items-center gap-2">
              <button onclick="openContentCreateModal()" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all">
                <span>+ Add Row</span>
              </button>
              <button onclick="openBulkUploadModal()" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all">
                Bulk Upload JSON
              </button>
            </div>
          </div>

          <div class="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/60">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                <tr id="content-table-head">
                  <th class="py-3 px-4">ID</th>
                  <th class="py-3 px-4">Details</th>
                  <th class="py-3 px-4">Level</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="content-table-body" class="divide-y divide-slate-900/80 text-slate-300">
                <tr>
                  <td colspan="4" class="py-12 text-center text-slate-500">Loading catalog from D1 database...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 3: USER PROGRESS TELEMETRY -->
      <section id="tab-view-progress" class="hidden space-y-6">
        <div class="glass-card p-6 space-y-6">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div>
              <h3 class="text-base font-bold text-white">Learner Progress Dashboard</h3>
              <p class="text-xs text-slate-400">Inspect and update points, streaks, level status, and training records.</p>
            </div>
            <div class="flex items-center gap-2">
              <input id="progress-lookup-email" type="email" placeholder="student@example.com" class="w-64 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400">
              <button onclick="lookupUserProgress()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all">
                Inspect
              </button>
            </div>
          </div>

          <div id="progress-display-container" class="hidden space-y-6">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span class="text-[11px] text-slate-400 uppercase tracking-wider">CEFR Level</span>
                <div id="prog-stat-level" class="text-2xl font-bold text-cyan-400 mt-1">A1</div>
              </div>
              <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span class="text-[11px] text-slate-400 uppercase tracking-wider">Streak</span>
                <div id="prog-stat-streak" class="text-2xl font-bold text-amber-400 mt-1">0 Days</div>
              </div>
              <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span class="text-[11px] text-slate-400 uppercase tracking-wider">Total Points</span>
                <div id="prog-stat-points" class="text-2xl font-bold text-indigo-400 mt-1">0</div>
              </div>
              <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span class="text-[11px] text-slate-400 uppercase tracking-wider">Last Active</span>
                <div id="prog-stat-last-active" class="text-sm font-semibold text-slate-300 mt-2 truncate">-</div>
              </div>
            </div>

            <div class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-300">Raw Progress Object (Editable)</span>
                <button onclick="saveEditedProgress()" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all">
                  Save Progress Changes
                </button>
              </div>
              <textarea id="progress-json-editor" rows="9" class="w-full bg-slate-950 font-mono text-xs text-cyan-300 p-3.5 rounded-xl border border-slate-800 focus:outline-none focus:border-cyan-400"></textarea>
            </div>
          </div>

          <div id="progress-empty-state" class="py-12 text-center text-xs text-slate-500">
            Enter learner email above to view and adjust their synced progress telemetry.
          </div>
        </div>
      </section>
    </main>
  </div>

  <!-- MODAL: CREATE / EDIT CONTENT ROW -->
  <div id="content-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
    <div class="w-full max-w-lg glass-card p-6 space-y-4 border border-slate-700">
      <div class="flex items-center justify-between">
        <h4 id="content-modal-title" class="text-base font-bold text-white">Edit Record</h4>
        <button onclick="closeContentModal()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <div class="space-y-3">
        <label class="block text-xs text-slate-400">JSON Fields</label>
        <textarea id="content-modal-json" rows="10" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-400"></textarea>
      </div>
      <div class="flex items-center justify-end gap-2 pt-2">
        <button onclick="closeContentModal()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs">Cancel</button>
        <button onclick="submitContentModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold">Save Record</button>
      </div>
    </div>
  </div>

  <!-- MODAL: BULK UPLOAD JSON -->
  <div id="bulk-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
    <div class="w-full max-w-xl glass-card p-6 space-y-4 border border-slate-700">
      <div class="flex items-center justify-between">
        <h4 class="text-base font-bold text-white">Bulk Upload Content (/admin/upload)</h4>
        <button onclick="closeBulkModal()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <p class="text-xs text-slate-400">Paste an array of row objects. Scenarios and grammar upsert by ID; vocabulary and starter_phrases perform plain insert.</p>
      <textarea id="bulk-json-input" rows="10" placeholder='[{"id":"scenario_1","title_de":"Im Cafe","title_ar":"في المقهى"}]' class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-400"></textarea>
      <div class="flex items-center justify-end gap-2 pt-2">
        <button onclick="closeBulkModal()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs">Cancel</button>
        <button onclick="submitBulkUpload()" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold">Upload Batch</button>
      </div>
    </div>
  </div>

  <!-- CLIENT INTERACTION SCRIPT -->
  <script>
    var inMemoryAdminSecret = "";
    var currentActiveTab = "subscriptions";
    var currentContentType = "scenarios";
    var editingRowId = null;
    var currentLoadedSubData = null;
    var currentLoadedProgressEmail = null;

    function showToast(message, type) {
      var container = document.getElementById("toast-container");
      if (!container) return;
      var toast = document.createElement("div");
      var isError = type === "error";
      var isSuccess = type === "success";
      var bgClass = isError ? "bg-red-500/90 border-red-400" : (isSuccess ? "bg-emerald-500/90 border-emerald-400" : "bg-slate-900/95 border-cyan-500/50");
      toast.className = "px-4 py-3 rounded-2xl text-xs font-medium text-white shadow-2xl border backdrop-blur-md pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 " + bgClass;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(function() {
        toast.classList.remove("translate-y-2", "opacity-0");
      }, 10);
      setTimeout(function() {
        toast.classList.add("opacity-0", "-translate-y-2");
        setTimeout(function() {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
      }, 3500);
    }

    function updateClock() {
      var d = new Date();
      var el = document.getElementById("live-clock");
      if (el) el.textContent = d.toUTCString().slice(17, 25) + " UTC";
      var cal = document.getElementById("calendar-date");
      if (cal) cal.textContent = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    setInterval(updateClock, 1000);
    updateClock();

    function toggleSecretVisibility() {
      var inp = document.getElementById("admin-secret-input");
      inp.type = inp.type === "password" ? "text" : "password";
    }

    function applyAdminSecret() {
      var val = document.getElementById("admin-secret-input").value.trim();
      if (!val) {
        showToast("Please enter the ADMIN_SECRET", "error");
        return;
      }
      inMemoryAdminSecret = val;
      var b = document.getElementById("session-badge");
      b.textContent = "Authorized Session";
      b.className = "px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full";
      showToast("Session authorized successfully", "success");
      if (currentActiveTab === "content") {
        loadContentCatalog();
      }
    }

    function getAuthHeaders() {
      var h = { "Content-Type": "application/json" };
      if (inMemoryAdminSecret) {
        h["Authorization"] = "Bearer " + inMemoryAdminSecret;
      }
      return h;
    }

    function switchTab(tabId) {
      currentActiveTab = tabId;
      var tabs = ["subscriptions", "content", "progress"];
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        var view = document.getElementById("tab-view-" + t);
        var btn = document.getElementById("tab-btn-" + t);
        var navBtn = document.getElementById("nav-" + t + "-btn");

        if (t === tabId) {
          if (view) view.classList.remove("hidden");
          if (btn) {
            btn.className = "px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 bg-blue-600 text-white shadow-lg shadow-blue-600/30";
          }
          if (navBtn) {
            navBtn.className = "w-12 h-12 rounded-2xl flex items-center justify-center text-cyan-400 bg-slate-800/80 border border-cyan-500/30 glow-cyan transition-all";
          }
        } else {
          if (view) view.classList.add("hidden");
          if (btn) {
            btn.className = "px-5 py-2.5 rounded-2xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all flex items-center gap-2";
          }
          if (navBtn) {
            navBtn.className = "w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-all";
          }
        }
      }
      if (tabId === "content") {
        loadContentCatalog();
      }
    }

    async function lookupSubscription() {
      var email = document.getElementById("sub-lookup-email").value.trim();
      if (!email) {
        showToast("Enter email to search", "error");
        return;
      }
      try {
        var res = await fetch("/admin/lookup", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: email })
        });
        var data = await res.json();
        if (res.status === 401) {
          showToast("Unauthorized: check ADMIN_SECRET", "error");
          return;
        }
        if (!data.found) {
          showToast("User not found or has not redeemed a license yet.", "error");
          document.getElementById("sub-result-card").classList.add("hidden");
          document.getElementById("sub-empty-state").classList.remove("hidden");
          return;
        }
        currentLoadedSubData = data;
        document.getElementById("sub-empty-state").classList.add("hidden");
        var c = document.getElementById("sub-result-card");
        c.classList.remove("hidden");

        document.getElementById("sub-display-email").textContent = data.email;
        document.getElementById("sub-display-sub").textContent = "Account Sub: " + data.sub;
        document.getElementById("sub-display-expires").textContent = data.expiresAt || "Never";
        document.getElementById("sub-display-active").textContent = data.active ? "True (Active)" : "False (Expired)";

        var pill = document.getElementById("sub-display-status-pill");
        if (data.active) {
          pill.textContent = "ACTIVE";
          pill.className = "px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
        } else {
          pill.textContent = "EXPIRED";
          pill.className = "px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30";
        }
        showToast("Found user record", "success");
      } catch (e) {
        showToast("Lookup failed: " + e, "error");
      }
    }

    async function revokeSubscription() {
      if (!currentLoadedSubData) return;
      try {
        var res = await fetch("/admin/revoke", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: currentLoadedSubData.email })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Access revoked immediately", "success");
          lookupSubscription();
        } else {
          showToast("Revocation failed: " + JSON.stringify(data), "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    async function quickAddMonths(m) {
      if (!currentLoadedSubData) return;
      try {
        var res = await fetch("/admin/edit", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: currentLoadedSubData.email, add_months: m })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Extended by " + m + " months", "success");
          lookupSubscription();
        } else {
          showToast("Extension failed", "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    async function saveExactExpiry() {
      if (!currentLoadedSubData) return;
      var val = document.getElementById("sub-edit-exact-date").value;
      if (!val) {
        showToast("Select date/time", "error");
        return;
      }
      var iso = new Date(val).toISOString();
      try {
        var res = await fetch("/admin/edit", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: currentLoadedSubData.email, set_expiresAt: iso })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Expiration updated", "success");
          lookupSubscription();
        } else {
          showToast("Update failed", "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    async function saveDeltaMonths() {
      if (!currentLoadedSubData) return;
      var val = parseInt(document.getElementById("sub-edit-delta-months").value, 10);
      if (isNaN(val)) {
        showToast("Enter valid integer", "error");
        return;
      }
      quickAddMonths(val);
    }

    function updateGeneratorSlider(val) {
      document.getElementById("generator-months-display").textContent = val;
      var ring = document.getElementById("generator-ring");
      var pct = (parseInt(val, 10) / 12);
      var offset = 264 - (264 * pct);
      ring.style.strokeDashoffset = offset;
    }

    async function generateAdminCode() {
      var months = parseInt(document.getElementById("generator-months-slider").value, 10);
      try {
        var res = await fetch("/admin/generate", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ months: months })
        });
        var data = await res.json();
        if (res.status === 401) {
          showToast("Unauthorized: check ADMIN_SECRET", "error");
          return;
        }
        if (data.code) {
          document.getElementById("generated-code-box").classList.remove("hidden");
          document.getElementById("generated-code-text").textContent = data.code;
          showToast("Generated code: " + data.code, "success");
        } else {
          showToast("Generation failed", "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    function copyGeneratedCode() {
      var code = document.getElementById("generated-code-text").textContent;
      if (!code) return;
      var t = document.createElement("textarea");
      t.value = code;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
      showToast("Copied: " + code, "success");
    }

    function selectContentType(type) {
      currentContentType = type;
      var types = ["scenarios", "vocabulary", "grammar", "starter_phrases"];
      for (var i = 0; i < types.length; i++) {
        var b = document.getElementById("type-btn-" + types[i]);
        if (types[i] === type) {
          b.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white transition-all";
        } else {
          b.className = "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all";
        }
      }
      loadContentCatalog();
    }

    async function loadContentCatalog() {
      var tbody = document.getElementById("content-table-body");
      tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-500">Querying D1 ' + currentContentType + '...</td></tr>';
      try {
        var res = await fetch("/admin/" + currentContentType, {
          method: "GET",
          headers: getAuthHeaders()
        });
        if (res.status === 401) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-amber-400">Please enter and authorize ADMIN_SECRET above</td></tr>';
          return;
        }
        var rows = await res.json();
        document.getElementById("content-row-count").textContent = rows.length + " rows";
        if (!Array.isArray(rows) || rows.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-500">No records found in table ' + currentContentType + '</td></tr>';
          return;
        }

        var quote = String.fromCharCode(39);
        var html = "";
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var idVal = r.id;

          var details = "";
          if (currentContentType === "scenarios") {
            details = r.title_de;
          } else if (currentContentType === "vocabulary") {
            details = r.german;
          } else if (currentContentType === "grammar") {
            details = r.title_en || r.title_ar;
          } else if (currentContentType === "starter_phrases") {
            details = r.german;
          }
          if (!details) {
            details = JSON.stringify(r).slice(0, 45);
          }

          var levelVal = r.level || "-";
          var badgeColor = "bg-slate-800 text-slate-300";
          if (levelVal === "A1") badgeColor = "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
          if (levelVal === "A2") badgeColor = "bg-blue-500/20 text-blue-300 border border-blue-500/30";
          if (levelVal === "B1") badgeColor = "bg-amber-500/20 text-amber-300 border border-amber-500/30";
          if (levelVal === "B2") badgeColor = "bg-purple-500/20 text-purple-300 border border-purple-500/30";

          html += '<tr class="hover:bg-slate-900/60 transition-colors">';
          html += '<td class="py-3 px-4 font-mono text-cyan-400">' + idVal + '</td>';
          html += '<td class="py-3 px-4 text-slate-200 font-medium">' + details + '</td>';
          html += '<td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold ' + badgeColor + '">' + levelVal + '</span></td>';
          html += '<td class="py-3 px-4 text-right space-x-2">';
          html += '<button onclick="openContentEditModal(' + quote + idVal + quote + ')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs">Edit</button>';
          html += '<button onclick="deleteContentRow(' + quote + idVal + quote + ')" class="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs">Delete</button>';
          html += '</td>';
          html += '</tr>';
        }
        tbody.innerHTML = html;
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-red-400">Failed to load: ' + e + '</td></tr>';
      }
    }

    async function openContentEditModal(id) {
      editingRowId = id;
      document.getElementById("content-modal-title").textContent = "Edit " + currentContentType + " #" + id;
      try {
        var res = await fetch("/admin/" + currentContentType + "/" + id, {
          method: "GET",
          headers: getAuthHeaders()
        });
        var row = await res.json();
        document.getElementById("content-modal-json").value = JSON.stringify(row, null, 2);
        document.getElementById("content-modal").classList.remove("hidden");
      } catch (e) {
        showToast("Error fetching row: " + e, "error");
      }
    }

    function openContentCreateModal() {
      editingRowId = null;
      document.getElementById("content-modal-title").textContent = "Add New " + currentContentType;
      var template;
      if (currentContentType === "scenarios") {
        template = {
          id: "scenario_" + Date.now(),
          title_de: "",
          title_ar: "",
          ai_persona: "",
          category: "",
          icon: "",
          initial_message_a1: "",
          initial_message_a2: "",
          initial_message_b1: "",
          initial_message_b2: ""
        };
      } else if (currentContentType === "vocabulary") {
        template = {
          german: "",
          article: "",
          plural: "",
          part_of_speech: "",
          translation_ar: "",
          translation_en: "",
          example_de: "",
          example_ar: "",
          example_en: "",
          level: "A1",
          topic: ""
        };
      } else if (currentContentType === "grammar") {
        template = {
          id: "rule_" + Date.now(),
          level: "A1",
          title_ar: "",
          title_en: "",
          explanation_ar: "",
          explanation_en: "",
          example_de: ""
        };
      } else {
        template = {
          scenario_id: "",
          level: "A1",
          german: "",
          translation_en: "",
          translation_ar: "",
          sort_order: 1
        };
      }

      document.getElementById("content-modal-json").value = JSON.stringify(template, null, 2);
      document.getElementById("content-modal").classList.remove("hidden");
    }

    function closeContentModal() {
      document.getElementById("content-modal").classList.add("hidden");
    }

    async function submitContentModal() {
      var raw = document.getElementById("content-modal-json").value;
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        showToast("Invalid JSON format", "error");
        return;
      }

      try {
        var url = editingRowId 
          ? "/admin/" + currentContentType + "/" + editingRowId
          : "/admin/" + currentContentType;
        var method = editingRowId ? "PUT" : "POST";

        var res = await fetch(url, {
          method: method,
          headers: getAuthHeaders(),
          body: JSON.stringify(parsed)
        });
        var data = await res.json();
        if (res.ok) {
          closeContentModal();
          showToast("Record saved successfully", "success");
          loadContentCatalog();
        } else {
          showToast("Error: " + JSON.stringify(data), "error");
        }
      } catch (e) {
        showToast("Save failed: " + e, "error");
      }
    }

    async function deleteContentRow(id) {
      try {
        var res = await fetch("/admin/" + currentContentType + "/" + id, {
          method: "DELETE",
          headers: getAuthHeaders()
        });
        if (res.ok) {
          showToast("Record deleted", "success");
          loadContentCatalog();
        } else {
          showToast("Delete failed", "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    function openBulkModal() {
      document.getElementById("bulk-modal").classList.remove("hidden");
    }
    function closeBulkModal() {
      document.getElementById("bulk-modal").classList.add("hidden");
    }
    async function submitBulkUpload() {
      var raw = document.getElementById("bulk-json-input").value;
      var rows;
      try {
        rows = JSON.parse(raw);
      } catch (e) {
        showToast("Invalid JSON. Must be an array of objects.", "error");
        return;
      }
      try {
        var res = await fetch("/admin/upload", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ contentType: currentContentType, rows: rows })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Uploaded " + data.count + " rows", "success");
          closeBulkModal();
          loadContentCatalog();
        } else {
          showToast("Upload error: " + JSON.stringify(data), "error");
        }
      } catch (e) {
        showToast("Upload error: " + e, "error");
      }
    }

    async function lookupUserProgress() {
      var email = document.getElementById("progress-lookup-email").value.trim();
      if (!email) {
        showToast("Enter learner email", "error");
        return;
      }
      try {
        var res = await fetch("/admin/progress-lookup", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: email })
        });
        var data = await res.json();
        if (res.status === 401) {
          showToast("Unauthorized: check ADMIN_SECRET", "error");
          return;
        }
        if (data.error) {
          showToast("User error: " + data.error, "error");
          return;
        }

        currentLoadedProgressEmail = email;
        document.getElementById("progress-empty-state").classList.add("hidden");
        document.getElementById("progress-display-container").classList.remove("hidden");

        var stats = data.stats || {};
        document.getElementById("prog-stat-level").textContent = stats.level || "A1";
        document.getElementById("prog-stat-streak").textContent = (stats.streak_days || 0) + " Days";
        document.getElementById("prog-stat-points").textContent = stats.total_points || 0;
        document.getElementById("prog-stat-last-active").textContent = stats.last_active_date || "Never";

        document.getElementById("progress-json-editor").value = JSON.stringify(data, null, 2);
        showToast("Loaded learner progress", "success");
      } catch (e) {
        showToast("Lookup failed: " + e, "error");
      }
    }

    async function saveEditedProgress() {
      if (!currentLoadedProgressEmail) return;
      var raw = document.getElementById("progress-json-editor").value;
      var obj;
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        showToast("Invalid JSON in editor", "error");
        return;
      }
      try {
        var res = await fetch("/admin/progress-edit", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: currentLoadedProgressEmail, progress: obj })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Progress saved successfully", "success");
          lookupUserProgress();
        } else {
          showToast("Save error: " + JSON.stringify(data), "error");
        }
      } catch (e) {
        showToast("Error saving progress: " + e, "error");
      }
    }

    window.switchTab = switchTab;
    window.toggleSecretVisibility = toggleSecretVisibility;
    window.applyAdminSecret = applyAdminSecret;
    window.lookupSubscription = lookupSubscription;
    window.revokeSubscription = revokeSubscription;
    window.quickAddMonths = quickAddMonths;
    window.saveExactExpiry = saveExactExpiry;
    window.saveDeltaMonths = saveDeltaMonths;
    window.updateGeneratorSlider = updateGeneratorSlider;
    window.generateAdminCode = generateAdminCode;
    window.copyGeneratedCode = copyGeneratedCode;
    window.selectContentType = selectContentType;
    window.loadContentCatalog = loadContentCatalog;
    window.openContentEditModal = openContentEditModal;
    window.openContentCreateModal = openContentCreateModal;
    window.closeContentModal = closeContentModal;
    window.submitContentModal = submitContentModal;
    window.deleteContentRow = deleteContentRow;
    window.openBulkModal = openBulkModal;
    window.closeBulkModal = closeBulkModal;
    window.submitBulkUpload = submitBulkUpload;
    window.lookupUserProgress = lookupUserProgress;
    window.saveEditedProgress = saveEditedProgress;
    window.showToast = showToast;
  </script>
</body>
</html>`;
}
