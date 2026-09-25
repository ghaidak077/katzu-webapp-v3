/**
 * Graded writing (Schreiben) — the fourth skill.
 *
 * The app trained speaking, listening and recognition, so it could not honestly
 * claim to prepare anyone: Goethe, telc and the DTZ all test Schreiben, and for
 * this audience it is the module that decides the certificate (a formal email to
 * a landlord or an employer is the exact task a learner faces). Writing was the
 * only one of the four skills that needed no new content table, which is why it
 * comes before the reading and exam work.
 *
 * Extracted into its own module for the same measured reason as
 * cloudflare-hints.js and cloudflare-admin.js: the AI handlers sit past the
 * ~63 KB byte offset where the edit tooling cannot apply diffs. Everything
 * worker-scoped (auth, entitlement, key rotation, Gemini failover, JSON helper)
 * is injected at the call site, so this file owns only the writing logic — and
 * the normalizer below is pure, so it is unit-tested without a model call.
 *
 * One deliberate design rule: the model never produces the star rating the
 * learner sees for *progress*. Scores are clamped to a 0-5 rubric and a percent
 * the client cannot inflate, and a response with no usable rubric is an error
 * rather than a silently empty result.
 */

/** Exam-shaped task types, from the easiest to the one a B2 learner must survive. */
export const WRITING_TASK_TYPES = ["short_message", "appointment_request", "formal_email", "complaint"];

/** Scales a learner must reach before a task type is fair. */
export const MAX_SCORE = 5;

/** Below this there is nothing to correct; above it, the text is not a task answer. */
export const MIN_WRITING_CHARS = 20;
export const MAX_WRITING_CHARS = 900;

/** Five corrections is a lesson; ten is a wall the learner will not read. */
export const MAX_WRITING_MISTAKES = 5;

/** ~1 dialogue turn of rubric + corrected text. */
export const MAX_OUTPUT_TOKENS = 900;

/** Bounds for the topic the client sends (it comes from D1 content). */
export const MAX_TARGET_PHRASES = 6;
const MAX_PHRASE_CHARS = 80;
const MAX_TITLE_CHARS = 120;

export const RUBRIC_DIMENSIONS = ["task", "coherence", "grammar", "vocabulary"];

const ARABIC_RE = /[\u0600-\u06FF]/;

/**
 * The task a level is ready for. Deterministic and shared with the client's
 * contract test, so the learner is never shown one task while being graded on
 * another.
 */
export function taskTypeForLevel(level) {
  switch (String(level || "").toUpperCase()) {
    case "B2":
      return "complaint";
    case "B1":
      return "formal_email";
    case "A2":
      return "appointment_request";
    default:
      return "short_message";
  }
}

/** What each task type means to the grader. Kept here so the definition and the grading cannot drift. */
const TASK_DEFINITIONS = {
  short_message:
    "a short informal message to a friend, neighbour or colleague (2-3 sentences)",
  appointment_request:
    "a short, polite request for an appointment (4-6 sentences): why, when, and what they need",
  formal_email:
    "a formal email with a salutation and a closing (6-10 sentences) to an office, landlord or employer",
  complaint:
    "a formal complaint or objection (8-12 sentences) that states the problem, the facts, what has already been tried, and what the writer wants to happen",
};

function clampScore(value) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_SCORE, Math.max(0, Math.round(n)));
}

function cleanText(value, maxChars) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

/** Target phrases come from D1 content but through the client, so they are bounded here. */
export function normalizeTargetPhrases(phrases) {
  if (!Array.isArray(phrases)) return [];
  const seen = new Set();
  const kept = [];
  for (const phrase of phrases) {
    const text = cleanText(phrase, MAX_PHRASE_CHARS);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    kept.push(text);
    if (kept.length >= MAX_TARGET_PHRASES) break;
  }
  return kept;
}

export function buildWritingPrompt({ level, taskType, scenarioTitle, targetPhrases, text }) {
  const definition = TASK_DEFINITIONS[taskType] || TASK_DEFINITIONS.short_message;
  const phraseLine = targetPhrases.length
    ? `Vocabulary the learner has been studying (they were asked to use it, but using it badly is fine): ${JSON.stringify(targetPhrases)}.`
    : "The learner has been studying this topic's vocabulary.";

  return `You are a German teacher marking a written task from an Arabic-speaking learner at CEFR ${level}.
Task: write ${definition}.
Topic / situation: ${scenarioTitle}.
${phraseLine}

The learner wrote:
"""
${text}
"""

Mark it honestly against the four rubric dimensions, each 0-${MAX_SCORE}:
- task: did they do what was asked, at the right level of formality, with the content the situation needs?
- coherence: is it organised and connected (greeting/closing where the task needs them, order of information)?
- grammar: cases, verb position, conjugation, agreement.
- vocabulary: is the word choice right for the situation, or is it vague/wrong?

Rules:
- Correct real errors. Do NOT rewrite correct German into your own style, and do not invent errors to look thorough.
- corrected_de is the learner's text with the errors fixed — same meaning, same length, not an upgrade.
- Every entry in mistakes must quote the learner's exact words in original, give the fixed German in corrected, name the rule in rule_de (short, e.g. "Akkusativ nach 'für'"), and explain it in Arabic in explanation_ar the way a patient teacher speaking Arabic would.
- Report at most ${MAX_WRITING_MISTAKES} mistakes — the ones that matter most at ${level}, not every comma.
- summary_ar: 1-2 sentences in Modern Standard Arabic telling the learner what they already do well and what to fix first. Address them directly.
- Never transliterate German into Arabic letters; use the Arabic term for a concept.
- If the learner wrote something unrelated to the task or in the wrong language, say so in summary_ar and score task accordingly.
Respond strictly in JSON:
{ "scores": { "task": number, "coherence": number, "grammar": number, "vocabulary": number },
  "corrected_de": "string", "summary_ar": "string",
  "mistakes": [ { "original": "string", "corrected": "string", "rule_de": "string", "explanation_ar": "string" } ] }`;
}

export function buildWritingResponseSchema() {
  return {
    type: "OBJECT",
    properties: {
      scores: {
        type: "OBJECT",
        properties: Object.fromEntries(
          RUBRIC_DIMENSIONS.map((dimension) => [dimension, { type: "INTEGER" }]),
        ),
        required: [...RUBRIC_DIMENSIONS],
        propertyOrdering: [...RUBRIC_DIMENSIONS],
      },
      corrected_de: { type: "STRING" },
      summary_ar: { type: "STRING" },
      mistakes: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            original: { type: "STRING" },
            corrected: { type: "STRING" },
            rule_de: { type: "STRING" },
            explanation_ar: { type: "STRING" },
          },
          required: ["original", "corrected", "rule_de", "explanation_ar"],
          propertyOrdering: ["original", "corrected", "rule_de", "explanation_ar"],
        },
      },
    },
    required: ["scores", "corrected_de", "summary_ar", "mistakes"],
  };
}

/**
 * Turns whatever the model returned into a result the UI can trust, or null when
 * there is no usable rubric. A missing dimension is dropped rather than guessed:
 * showing a score the model never gave would be the exact dishonesty this app is
 * built to avoid. Percent is computed here so there is one definition of it.
 */
export function normalizeWritingFeedback(raw) {
  const parsed = raw && typeof raw === "object" ? raw : null;
  if (!parsed) return null;

  const scores = {};
  for (const dimension of RUBRIC_DIMENSIONS) {
    const value = clampScore(parsed.scores?.[dimension]);
    if (value !== null) scores[dimension] = value;
  }
  const scored = Object.keys(scores);
  if (scored.length === 0) return null;

  const mistakes = (Array.isArray(parsed.mistakes) ? parsed.mistakes : [])
    .map((mistake) => ({
      original: cleanText(mistake?.original, 200),
      corrected: cleanText(mistake?.corrected, 200),
      ruleDe: cleanText(mistake?.rule_de || mistake?.ruleDe, 120),
      explanationAr: cleanText(mistake?.explanation_ar || mistake?.explanationAr, 300),
    }))
    // Without the learner's own words and the fix there is nothing to teach.
    .filter((mistake) => mistake.original && mistake.corrected && mistake.corrected !== mistake.original)
    .slice(0, MAX_WRITING_MISTAKES);

  const summaryAr = cleanText(parsed.summary_ar || parsed.summaryAr, 400);

  return {
    scores,
    maxScore: MAX_SCORE,
    // Percent of the dimensions actually returned, so a two-dimension answer is
    // not scored as if the other two were zero.
    percent: Math.round((scored.reduce((sum, key) => sum + scores[key], 0) / (scored.length * MAX_SCORE)) * 100),
    correctedDe: cleanText(parsed.corrected_de || parsed.correctedDe, MAX_WRITING_CHARS * 2),
    summaryAr: ARABIC_RE.test(summaryAr) ? summaryAr : "",
    mistakes,
  };
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {object} cors
 * @param {object} deps worker-scoped internals, injected at the call site
 */
export async function handleWritingRoute(request, env, cors, deps) {
  const {
    authenticateAiRequest,
    getGeminiApiKeys,
    callGeminiWithFailover,
    cleanJson,
    json,
    validLevels,
  } = deps;

  const body = await request.json().catch(() => null);
  const text = cleanText(body?.text, MAX_WRITING_CHARS + 1);
  const level = String(body?.cefr_level || "A1").toUpperCase();

  // Writing practice costs a model call but is not part of the three free
  // conversation sessions: a learner who practises Schreiben is doing more work
  // than the paid loop requires, and the global daily rate limit still bounds
  // abuse. Non-A1 trial users are paywalled exactly as everywhere else.
  const auth = await authenticateAiRequest(request, body, env, cors, {
    level,
    quotaExempt: true,
    requireEntitlement: true,
  });
  if (auth.response) return auth.response;

  if (!validLevels || !validLevels.has(level)) {
    return json({ error: "invalid_level", code: "INVALID_LEVEL" }, 400, cors);
  }
  if (text.length < MIN_WRITING_CHARS) {
    return json({
      error: "text_too_short",
      code: "TEXT_TOO_SHORT",
      message: `اكتب على الأقل ${MIN_WRITING_CHARS} حرفاً حتى يصبح التصحيح مفيداً.`,
      min_chars: MIN_WRITING_CHARS,
    }, 400, cors);
  }
  if (text.length > MAX_WRITING_CHARS) {
    return json({
      error: "text_too_long",
      code: "TEXT_TOO_LONG",
      message: `أقصى طول للرسالة ${MAX_WRITING_CHARS} حرفاً.`,
      max_chars: MAX_WRITING_CHARS,
    }, 400, cors);
  }

  // The task is derived from the level, not chosen by the client, so a submitted
  // task can never be graded against a definition the learner was not shown.
  const expectedTask = taskTypeForLevel(level);
  const taskType = WRITING_TASK_TYPES.includes(body?.task_type) ? body.task_type : expectedTask;
  if (taskType !== expectedTask) {
    return json({
      error: "task_type_mismatch",
      code: "TASK_TYPE_MISMATCH",
      expected_task_type: expectedTask,
    }, 400, cors);
  }

  const apiKeys = getGeminiApiKeys(env);
  if (apiKeys.length === 0) {
    return json({ error: "ai_unavailable" }, 503, cors);
  }

  const prompt = buildWritingPrompt({
    level,
    taskType,
    scenarioTitle: cleanText(body?.scenario_title, MAX_TITLE_CHARS),
    targetPhrases: normalizeTargetPhrases(body?.target_phrases),
    text,
  });

  let raw;
  try {
    raw = await callGeminiWithFailover(apiKeys, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: buildWritingResponseSchema(),
        temperature: 0.2,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    }, env);
  } catch (err) {
    return json({
      error: "ai_error",
      code: "AI_WRITING_FAILED",
      message: "تعذر تصحيح النص الآن. لم يُفقد ما كتبته — أعد المحاولة.",
    }, 502, cors);
  }

  const feedback = normalizeWritingFeedback(cleanJson(raw));
  if (!feedback) {
    return json({
      error: "ai_error",
      code: "AI_WRITING_UNUSABLE",
      message: "لم يصل تصحيح صالح من المحرّك. لم يُفقد ما كتبته — أعد المحاولة.",
    }, 502, cors);
  }

  return json({ feedback, task_type: taskType, level }, 200, cors);
}
