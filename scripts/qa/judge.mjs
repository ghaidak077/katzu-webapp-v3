/**
 * LLM JUDGE — the qualitative half of the QA run.
 *
 * Deterministic checks catch contract breaks. They cannot tell whether a reply
 * is warm, whether it reacts to what the learner meant, or whether the Arabic
 * gloss sounds like Arabic. This judge reads the whole transcript and scores six
 * dimensions on a 1–5 rubric, quoting the exact turn under every problem.
 *
 * It runs on a different model family from the actor, so it is not grading its
 * own habits. The rubric is frozen for a run: if agreement with the labelled
 * set falls below 85%, the rubric is fixed (calibrate.mjs), never the threshold.
 */
import { JUDGE_MODEL } from './provider.mjs';

export const RUBRIC_VERSION = 2;
export const JUDGE_PASS_MEAN = 4.2;
export const JUDGE_MIN_CORRECTNESS = 3;

export const DIMENSIONS = [
  'natural_in_role',
  'reacts_to_meaning',
  'level_appropriate',
  'german_correct',
  'arabic_gloss',
  'recast_quality',
  'goal_progress',
];

export const JUDGE_SYSTEM = `You are a strict QA reviewer for an Arabic-first German-learning roleplay app.
You read one whole practice-chat transcript and score it. The learner is an Arabic speaker; the persona is a German native in a real-life scene.
Score each dimension from 1 to 5:
- natural_in_role: sounds like a real person in this scene, never a chatbot, never mentions the app/exercise/AI.
- reacts_to_meaning: responds to what the learner actually meant, including typos, missing umlauts and short answers.
- level_appropriate: vocabulary and sentence length fit the CEFR level (simple and short at A1).
- german_correct: reply_de is idiomatic, correctly spelled and grammatically correct. 1 = broken, 3 = understandable with errors, 5 = native-clean.
- arabic_gloss: reply_ar is natural Modern Standard Arabic and a real translation (not a transliteration). It MUST use the persona's gender: a female persona speaking about herself uses feminine first-person forms (أنا سعيدة، أنا مستعدة، ذاهبة), never the masculine (سعيد، مستعد). A wrong gender form is a correctness problem: score arabic_gloss at most 2 and list it.
- recast_quality: understood_de rewrites the learner's sentence with the smallest fix, keeps their words, and fix_reason_ar explains it briefly in Arabic. If the learner's sentence still needs a fix and understood_de repeats the error unchanged, or fix_reason_ar is empty while a fix was needed, score at most 2 and list it. Empty reason is fine only when nothing needed fixing.
- goal_progress: each reply moves toward an unfinished objective without asking something already answered.
Rules:
- Judge only the turns shown. Do not invent objectives that the transcript had no chance to cover, and do not require a scene to have progressed further than the transcript shows.
- A question that was already answered, a meta sentence ("next question", "step"), or a question when closing is a correctness problem: score that dimension at most 2 and list it.
- A missing/empty Arabic line is a correctness problem.
- Quote the exact learner and persona text in every problem.
Return ONLY JSON:
{"scores":{"natural_in_role":1,"reacts_to_meaning":1,"level_appropriate":1,"german_correct":1,"arabic_gloss":1,"recast_quality":1,"goal_progress":1},"problems":[{"turn":1,"quote":"...","issue":"..."}],"summary":"one sentence"}`;

function transcriptForJudge(transcript, plan) {
  const lines = [
    `Scenario: ${transcript.scenarioId} | level ${plan?.level || transcript.level}`,
    `Persona: ${plan?.persona?.name || ''} (${plan?.persona?.gender || ''}), ${plan?.persona?.role || ''}`,
    `Goal: ${plan?.goal || ''}`,
    `Objectives: ${(plan?.objectives || []).map((objective) => `${objective.id}${(transcript.objectivesDone || []).includes(objective.id) ? ' [x]' : ''}`).join(', ')}`,
    '',
    'TRANSCRIPT',
  ];
  for (const [index, entry] of (transcript.turns || []).entries()) {
    if (entry.ok === false) continue;
    const turn = entry.turn || {};
    lines.push(
      `#${index + 1} LEARNER: ${entry.learnerText}`,
      `#${index + 1} PERSONA (de): ${turn.reply_de}`,
      `#${index + 1} PERSONA (ar): ${turn.reply_ar}`,
      `#${index + 1} UNDERSTOOD_DE: ${turn.understood_de || ''}`,
      `#${index + 1} FIX_REASON_AR: ${turn.fix_reason_ar || ''}`,
      `#${index + 1} OBJECTIVES_DONE: ${(turn.objectives_done || []).join(',') || '-'} | close=${turn.close === true} | hint=${turn.hint_de || '-'}`,
      '',
    );
  }
  return lines.join('\n');
}

export function parseJudgeJson(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!parsed?.scores || typeof parsed.scores !== 'object') return null;
    const scores = {};
    for (const dimension of DIMENSIONS) {
      const value = Number(parsed.scores[dimension]);
      if (!Number.isFinite(value) || value < 1 || value > 5) return null;
      scores[dimension] = value;
    }
    return {
      scores,
      mean: DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension], 0) / DIMENSIONS.length,
      problems: Array.isArray(parsed.problems) ? parsed.problems.slice(0, 20) : [],
      summary: String(parsed.summary || ''),
    };
  } catch {
    return null;
  }
}

export async function judgeTranscript({ provider, transcript, plan }) {
  const user = transcriptForJudge(transcript, plan);
  let raw = await provider.completeJson({
    model: JUDGE_MODEL,
    system: JUDGE_SYSTEM,
    user,
    maxTokens: 1400,
  });
  let verdict = parseJudgeJson(raw);
  // A truncated or chatty answer is a harness problem, not a transcript verdict:
  // retry once with the JSON contract alone rather than counting it as a fail.
  if (!verdict) {
    raw = await provider.completeJson({
      model: JUDGE_MODEL,
      system: `${JUDGE_SYSTEM}\n\nYour previous answer was not parseable JSON. Return ONLY the JSON object.`,
      user,
      maxTokens: 1400,
    });
    verdict = parseJudgeJson(raw);
  }
  if (!verdict) return { ok: false, reason: 'judge_unparseable', raw: String(raw).slice(0, 400) };
  const correctness = Math.min(verdict.scores.german_correct, verdict.scores.arabic_gloss);
  return {
    ok: verdict.mean >= JUDGE_PASS_MEAN && correctness >= JUDGE_MIN_CORRECTNESS,
    ...verdict,
    correctness,
    model: JUDGE_MODEL,
    rubric: RUBRIC_VERSION,
  };
}
