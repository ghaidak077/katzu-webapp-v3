/**
 * DETERMINISTIC HARD CHECKS — the 100% rules, no model, no judgement.
 *
 * Everything here is a promise the prompt or the route already makes. A hit is a
 * defect in the shipped chat, not a matter of taste. The rules are frozen for a
 * run: when a check fails, the fix is the prompt or the code, never this file.
 */
import './register.mjs';
import { parseRoleplayJson, roleplayWordLimit } from '../../cloudflare-roleplay.js';
import { objectivesOf } from '../../cloudflare-roleplay-plans.js';

const { checkGerman } = await import('../../src/lib/conversation/germanChecker.ts');

/** Same list the route refuses to ship (kept here so the harness cannot drift). */
const META_DE = [
  'nächste frage',
  'nächsten frage',
  'nächste aufgabe',
  'nächsten schritt',
  'schritt',
  'objective',
  'aufgabe',
];
const META_AR = ['السؤال التالي', 'السؤال القادم', 'الخطوة التالية', 'الهدف التالي', 'مهمة'];

const PRIVATE_DE = [
  'adresse',
  'telefonnummer',
  'handynummer',
  'telefon',
  'passnummer',
  'ausweisnummer',
  'kontonummer',
  'iban',
  'geburtsdatum',
  'sozialversicherungsnummer',
];
const PRIVATE_AR = ['رقم الهاتف', 'عنوانك', 'رقم بطاقتك', 'جواز سفرك', 'تاريخ ميلادك', 'رقم حسابك'];

const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-zÄÖÜäöüß]/;

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[äàâ]/g, 'a')
    .replace(/[öó]/g, 'o')
    .replace(/[üú]/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function overlap(a, b) {
  const left = new Set(normalize(a).split(' ').filter(Boolean));
  const right = new Set(normalize(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function countName(text, name) {
  if (!name) return 0;
  const clean = String(name).split(/\s+/).pop();
  if (!clean || clean.length < 2) return 0;
  return (String(text).match(new RegExp(`\\b${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []).length;
}

/** A learner name, if they introduced one ("ich bin Sami", "ich heiße ..."). */
export function learnerNameFrom(texts) {
  for (const text of texts) {
    const match = String(text || '').match(/\b(?:ich bin|ich hei(?:ß|ss)e|mein name ist)\s+([A-ZÄÖÜ][a-zäöüß]{2,})/);
    if (match) return match[1];
  }
  return '';
}

/**
 * Run every hard rule over one transcript.
 * @param {{turns: Array<{turn: any, raw: string, learnerText: string}>}} transcript
 */
export function runChecks(transcript, { plan, profileId = '' } = {}) {
  const allTurns = transcript?.turns || [];
  const providerFailures = allTurns.filter((entry) => entry.ok === false);
  const turns = allTurns.filter((entry) => entry.ok !== false);
  const total = objectivesOf(plan).length;
  const learnerName = learnerNameFrom(turns.map((entry) => entry.learnerText));
  const personaName = plan?.persona?.name || '';
  const gender = plan?.persona?.gender || '';
  const results = [];
  const add = (rule, ok, detail = '') => results.push({ rule, ok: Boolean(ok), detail });

  let previousDone = [];
  let previousQuestions = [];
  let sawClose = false;

  add('turns_recorded', turns.length > 0, `${turns.length} turn(s)`);
  add(
    'no_provider_error_turn',
    providerFailures.length === 0,
    providerFailures.length ? `${providerFailures.length} failed: ${String(providerFailures[0]?.reason || '').slice(0, 120)}` : 'none',
  );

  for (const [index, entry] of turns.entries()) {
    const turn = entry.turn || {};
    const replyDe = String(turn.reply_de || '');
    const replyAr = String(turn.reply_ar || '');
    const where = `turn ${index + 1}`;

    // 1. Valid JSON: the app's prompt asks for one object and nothing else.
    let strict = null;
    try {
      strict = JSON.parse(String(entry.raw || '').trim());
    } catch {
      strict = null;
    }
    add('json_valid', Boolean(strict) && typeof strict === 'object', `${where}: ${strict ? 'object' : 'not one bare JSON object'}`);
    add('json_parses_app_path', Boolean(parseRoleplayJson(entry.raw)), `${where}`);

    // 2. At most one question, none on close.
    const marks = (replyDe.match(/\?/g) || []).length;
    add('question_limit', turn.close === true ? marks === 0 : marks <= 1, `${where}: ${marks} '?' close=${turn.close === true}`);

    // 3. No meta vocabulary in either language.
    const metaHit = [...META_DE, ...META_AR].find(
      (phrase) => replyDe.toLowerCase().includes(phrase) || replyAr.toLowerCase().includes(phrase),
    );
    add('no_meta_words', !metaHit, `${where}: ${metaHit || 'clean'}`);

    // 4. No learner-visible private-data request.
    const privateHit = [...PRIVATE_DE, ...PRIVATE_AR].find(
      (word) => (replyDe.toLowerCase().includes(word) || replyAr.includes(word)) && replyDe.includes('?'),
    );
    add('no_private_data_request', !privateHit, `${where}: ${privateHit || 'clean'}`);

    // 5. No already-asked question, and no question the transcript answered.
    const asked = (replyDe.match(/[^?.!]*\?/g) || []).map((part) => part.trim());
    const repeated = asked.find(
      (question) =>
        previousQuestions.some((prior) => overlap(prior, question) >= 0.8) ||
        turns.slice(0, index).some((prior) => overlap(prior.learnerText, question) >= 0.75),
    );
    add('no_repeated_question', !repeated, `${where}: ${repeated || 'fresh'}`);
    previousQuestions.push(...asked);

    // 6. The learner's name and the persona's name at most once per reply.
    add('name_at_most_once', countName(replyDe, learnerName) <= 1 && countName(replyDe, personaName) <= 1, `${where}`);

    // 7. Objectives only grow, are all real ids, and never exceed the plan.
    const done = Array.isArray(turn.objectives_done) ? turn.objectives_done : [];
    const known = new Set(objectivesOf(plan).map((objective) => objective.id));
    const unknown = done.filter((id) => !known.has(id));
    const monotonic = previousDone.every((id) => done.includes(id));
    add(
      'objectives_monotonic',
      monotonic && unknown.length === 0 && done.length <= total,
      `${where}: ${done.length}/${total}${unknown.length ? ` unknown=${unknown.join(',')}` : ''}`,
    );
    add('header_done_total', Number(turn.objectives_total) === total, `${where}: ${turn.objectives_total}/${total}`);
    previousDone = done;

    // 8. Close only when everything is done (the shaper enforces it; this proves it).
    add('close_only_when_done', turn.close === false || done.length === total, `${where}: close=${turn.close === true} done=${done.length}/${total}`);
    if (turn.close === true) sawClose = true;
    if (turn.close === true && index < turns.length - 1) {
      add('no_turns_after_close', false, `turn ${index + 2} came after close`);
    }

    // 9. Arabic is present, natural script, and matches the persona's gender.
    add('arabic_present', ARABIC.test(replyAr) && replyAr !== replyDe, `${where}`);
    const femaleOnly = ['سعيدة', 'متأكدة', 'مستعدة', 'جاهزة', 'مسرورة', 'آسفة', 'مشغولة'];
    const maleOnly = ['سعيد', 'متأكد', 'مستعد', 'جاهز', 'مسرور', 'آسف', 'مشغول'];
    const wrongGender =
      gender === 'female'
        ? maleOnly.some((word) => replyAr.includes(word))
        : gender === 'male'
          ? femaleOnly.some((word) => replyAr.includes(word))
          : false;
    add('arabic_gender_lint', !wrongGender, `${where}: persona=${gender}`);

    // 10. German is already correct: the local corrector finds nothing to change.
    const checked = checkGerman(replyDe).corrected;
    add('german_zero_corrections', checked === replyDe.trim(), `${where}: ${checked === replyDe.trim() ? 'clean' : checked.slice(0, 120)}`);

    // 11. The hint is German, clean, and not an Arabic duplicate of the reply.
    if (turn.hint_de) {
      add('hint_is_german', LATIN.test(turn.hint_de) && !ARABIC.test(turn.hint_de), `${where}`);
      add('hint_zero_corrections', checkGerman(turn.hint_de).corrected === turn.hint_de.trim(), `${where}`);
    }

    // 12. Reply is short enough for the level's word cap (roleqplayWordLimit is
    // checked by the prompt; this is the observable version).
    const wordLimit = roleplayWordLimit(plan?.level || 'A1');
    const wordCount = (replyDe.match(/[A-Za-zÄÖÜäöüß]+/g) || []).length;
    add('reply_within_word_limit', wordCount <= wordLimit + 6, `${where}: ${wordCount}/${wordLimit}`);

    // 13. No correction card on a correct sentence (zero changes) and no
    // correction card at all when the learner copied a correct hint.
    if (entry.expectedNoCorrection) {
      const corrected = checkGerman(entry.learnerText);
      add(
        'no_correction_when_learner_copied_hint',
        corrected.corrected === String(entry.learnerText).trim(),
        `${where}: ${corrected.corrected === String(entry.learnerText).trim() ? 'clean' : corrected.corrected.slice(0, 80)}`,
      );
    }
  }

  // Objective completion is a promise for a learner who plays along; a hostile
  // or silent learner only has to be ended gracefully, not walked to the goal.
  const cooperative = ['cooperative', 'copies_hint', 'strong_learner'].includes(profileId);
  if (total > 0 && cooperative) {
    add('objective_completion', previousDone.length === total, `done=${previousDone.length}/${total} close=${sawClose}`);
  }
  if (total > 0) {
    add('graceful_end', turns.length < 12 && (sawClose || turns.length <= 10), `${turns.length} turn(s) close=${sawClose}`);
  }
  return results;
}

export function hardFailures(results) {
  return results.filter((result) => !result.ok);
}

export function checksByRule(results) {
  const map = new Map();
  for (const result of results) {
    const row = map.get(result.rule) || { rule: result.rule, pass: 0, fail: 0, details: [] };
    if (result.ok) row.pass += 1;
    else {
      row.fail += 1;
      if (row.details.length < 3) row.details.push(result.detail);
    }
    map.set(result.rule, row);
  }
  return [...map.values()];
}
