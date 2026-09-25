#!/usr/bin/env node
/**
 * Read-only quiz-content audit.
 *
 * Pulls the LIVE content from the Worker API (no admin secret needed — these
 * are the public content endpoints the app itself reads), then reproduces
 * exactly what QuizScreen generates: same topic join (scenarioToVocabTopic),
 * same pool construction, same real generator (generateQuizQuestions).
 *
 * Usage:
 *   node scripts/audit-quiz-content.mjs [--url=https://...] [--json]
 *
 * It never writes anything: it only reports.
 */

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('--url='));
const BASE = (urlArg ? urlArg.slice(6) : 'https://katzu-test.ghaidakalosh008.workers.dev').replace(/\/+$/, '');
const asJson = args.includes('--json');

const { generateQuizQuestions, isUsableTranslationAr, optionsCollide } = await import('../src/lib/utils/quizGenerator.ts');
const { scenarioToVocabTopic } = await import('../src/lib/utils/scenarioVocab.ts');

/** Deterministic rng so repeated audits are comparable. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const LEVELS = ['A1', 'A2', 'B1', 'B2'];

// --- pull live content -------------------------------------------------------
const scenariosRes = await get('/scenarios');
const scenarios = Array.isArray(scenariosRes.body) ? scenariosRes.body : scenariosRes.body?.scenarios || [];
const vocabRes = await get('/vocabulary');
const vocabulary = Array.isArray(vocabRes.body) ? vocabRes.body : [];

if (!scenarios.length) {
  console.error('No scenarios returned from the API — cannot audit.');
  process.exit(1);
}

const details = {};
for (const sc of scenarios) {
  const d = await get(`/scenarios/${encodeURIComponent(sc.id)}`);
  details[sc.id] = d.body?.starter_phrases || [];
}

// --- reproduce the quiz ------------------------------------------------------
/** A vocabulary prompt must BE the headword (with article) — never an example sentence. */
function promptIsHeadword(prompt, word, article) {
  const expected = `${article ? article + ' ' : ''}${word}`;
  return String(prompt || '').trim() === expected.trim();
}

const report = { base: BASE, scenarioCount: scenarios.length, vocabCount: vocabulary.length, scenarios: [], gaps: [], mismatches: [] };

for (const sc of scenarios) {
  const topic = scenarioToVocabTopic(sc);
  const phrases = details[sc.id] || [];
  const topicVocab = topic ? vocabulary.filter((v) => v.topic === topic) : [];

  // what QuizScreen actually feeds the generator
  const questions = generateQuizQuestions(topicVocab, phrases, mulberry32(42), 1000);
  // and the default deck the user really sees
  const defaultDeck = generateQuizQuestions(topicVocab, phrases, mulberry32(42), 4);

  const byLevel = {};
  for (const lvl of LEVELS) {
    byLevel[lvl] = {
      vocab: topicVocab.filter((v) => v.level === lvl).length,
      phrases: phrases.filter((p) => p.level === lvl).length,
    };
  }

  const entry = {
    id: sc.id,
    title: sc.title_ar || sc.title_de || sc.id,
    category: sc.category,
    topic,
    pool: { vocab: topicVocab.length, phrases: phrases.length },
    byLevel,
    questionsGenerated: questions.length,
    defaultDeckSize: defaultDeck.length,
    questions: [],
  };

  if (questions.length === 0) {
    report.gaps.push({
      kind: 'scenario_level_no_quiz',
      scenario: sc.id,
      topic,
      reason: topicVocab.length === 0 && phrases.length === 0 ? 'no content for this scenario at all' : 'fewer than 4 usable options available',
    });
  }

  for (const lvl of LEVELS) {
    if (byLevel[lvl].vocab === 0 && byLevel[lvl].phrases === 0) {
      report.gaps.push({ kind: 'scenario_level_no_content', scenario: sc.id, level: lvl, topic });
    }
  }

  for (const q of questions) {
    // Which D1 row produced this question? The correct option is its translation.
    const correct = q.options[q.correctIndex];
    const isVocab = q.kind === 'vocab';
    const sourceWord = isVocab
      ? topicVocab.find((v) => `${v.article ? v.article + ' ' : ''}${v.german}` === q.germanPrompt)
      : phrases.find((p) => p.german === q.germanPrompt);
    const promptIsWord = isVocab ? promptIsHeadword(q.germanPrompt, sourceWord?.german, sourceWord?.article) : true;
    // Any option that could also be a correct translation of the same prompt.
    const colliding = q.options.filter((o, i) => i !== q.correctIndex && optionsCollide(o, correct));
    const collapsed =
      q.options.length < 4 ||
      new Set(q.options).size !== q.options.length ||
      q.correctIndex < 0 ||
      q.options[q.correctIndex] !== sourceWord?.translation_ar;
    const sourceLevel = q.sourceLevel;

    const record = {
      type: q.kind,
      prompt: q.germanPrompt,
      exampleSentence: q.exampleSentence || null,
      correct,
      options: q.options,
      sourceWord: sourceWord ? sourceWord.german : null,
      sourceLevel,
      promptIsHeadword: promptIsWord,
      collidingOptions: colliding,
      collapsedOptions: collapsed,
    };
    entry.questions.push(record);

    if (!promptIsWord) {
      report.mismatches.push({
        kind: 'prompt_is_not_the_headword',
        scenario: sc.id,
        level: sourceLevel || '?',
        prompt: q.germanPrompt,
        targetWord: sourceWord?.german || null,
        markedCorrectAnswer: correct,
      });
    }
    if (colliding.length) {
      report.mismatches.push({
        kind: 'ambiguous_option_also_means_the_answer',
        scenario: sc.id,
        level: sourceLevel || '?',
        prompt: q.germanPrompt,
        markedCorrectAnswer: correct,
        collidingOptions: colliding,
      });
    }
    if (collapsed) {
      report.mismatches.push({ kind: 'collapsed_or_wrong_options', scenario: sc.id, prompt: q.germanPrompt, options: q.options, correct, expectedCorrect: sourceWord?.translation_ar || null });
    }
  }

  report.scenarios.push(entry);
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// --- human-readable report ---------------------------------------------------
console.log(`BASE ${BASE}`);
console.log(`scenarios=${report.scenarioCount} vocabulary=${report.vocabCount}`);
console.log('');
for (const s of report.scenarios) {
  console.log(`### ${s.id}  (${s.title})  category=${s.category} topic=${s.topic}`);
  console.log(`    pool: vocab=${s.pool.vocab} phrases=${s.pool.phrases}  → questions=${s.questionsGenerated} (default deck ${s.defaultDeckSize})`);
  console.log(`    by level: ${LEVELS.map((l) => `${l}:v${s.byLevel[l].vocab}/p${s.byLevel[l].phrases}`).join('  ')}`);
  for (const q of s.questions) {
    const flag = q.collidingOptions && q.collidingOptions.length
      ? `  <<< AMBIGUOUS OPTION(S): ${q.collidingOptions.join(' / ')}`
      : '';
    console.log(`    [${q.type}${q.sourceLevel ? ' ' + q.sourceLevel : ''}] Q: ${q.prompt}`);
    if (q.exampleSentence) console.log(`        example: ${q.exampleSentence}`);
    console.log(`        correct: ${q.correct}   (source word: ${q.sourceWord ?? '—'})`);
    console.log(`        options: ${q.options.map((o, i) => (i === q.correctIndex ? `*${o}*` : o)).join(' | ')}${flag}`);
  }
  console.log('');
}
console.log('=== MISMATCHES ===');
for (const m of report.mismatches) console.log(JSON.stringify(m));
console.log(`total mismatches: ${report.mismatches.length}`);
console.log('=== COVERAGE GAPS ===');
for (const g of report.gaps) console.log(JSON.stringify(g));
console.log(`total gaps: ${report.gaps.length}`);
