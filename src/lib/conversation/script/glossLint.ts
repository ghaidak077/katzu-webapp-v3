import type { PersonaGender, ScenarioScript } from './types';

/**
 * Arabic gloss agreement — a lint, not a suggestion.
 *
 * A female persona saying «سعيد بمعرفتك» is the same class of bug as a German
 * line the app would itself correct. The check is deliberately small and
 * literal: per-gender first-person predicates, plus the noun–verb agreement
 * slips that actually shipped («كيف تعجبك الحي؟»).
 */

const stripDiacritics = (text: string): string =>
  text.replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/\s+/g, ' ').trim();

const END = '(?=[\\s،,.:!؟«»()]|$)';

/**
 * A first-person predicate only counts at a sentence start or after an explicit
 * «أنا»: «سعيد بمعرفتك» is the speaker, «نهارك سعيد» is a wish to the learner and
 * must not be flagged.
 */
const FIRST_PERSON = '(?:^|[.!؟،,:]\\s*|(?:أنا|إنني|أكون)\\s+)';

const MAKES = (words: string[]): Array<[string, RegExp]> =>
  words.map((word) => [word, new RegExp(`${FIRST_PERSON}${word}${END}`)] as [string, RegExp]);

/** Masculine forms a female speaker must never use about herself. */
const FEMALE_DENY = MAKES([
  'سعيد',
  'سعيداً',
  'مسرور',
  'متحمس',
  'جاهز',
  'متأكد',
  'فرحان',
  'ممنون',
  'واثق',
  'جديد',
]);

/** Feminine forms a male speaker must never use about himself. */
const MALE_DENY = MAKES([
  'سعيدة',
  'مسرورة',
  'متحمسة',
  'جاهزة',
  'متأكدة',
  'فرحانة',
  'ممنونة',
  'واثقة',
  'جديدة',
]);

/** Noun–verb agreement slips that have shipped. */
const AGREEMENT: Array<[string, RegExp]> = [
  ['تعجبك الحي', /تعجبك\s+الحي/],
  ['تعجبك المكان', /تعجبك\s+المكان/],
  ['تعجبك الشارع', /تعجبك\s+الشارع/],
  ['تعجبك السوق', /تعجبك\s+السوق/],
  ['تعجبك المطعم', /تعجبك\s+المطعم/],
  ['يعجبك المدينة', /يعجبك\s+المدينة/],
  ['يعجبك الشقة', /يعجبك\s+الشقة/],
];

export interface GlossIssue {
  where: string;
  ar: string;
  reason: string;
}

export function lintGloss(ar: string, gender: PersonaGender): string[] {
  const text = stripDiacritics(ar);
  const reasons: string[] = [];
  const deny = gender === 'female' ? FEMALE_DENY : MALE_DENY;
  for (const [reason, pattern] of deny) {
    if (pattern.test(text)) reasons.push(reason);
  }
  for (const [reason, pattern] of AGREEMENT) {
    if (pattern.test(text)) reasons.push(reason);
  }
  return reasons;
}

/** Every Arabic line in a script, with the gender its speaker must agree with. */
export function lintScript(script: ScenarioScript): GlossIssue[] {
  const gender = script.persona.gender;
  const issues: GlossIssue[] = [];
  const check = (where: string, ar: string) => {
    const reasons = lintGloss(ar, gender);
    if (reasons.length > 0) issues.push({ where: `${script.scenarioId}/${where}`, ar, reason: reasons.join(', ') });
  };
  script.steps.forEach((step, index) => {
    step.asks.forEach((line, i) => check(`step${index}.${step.id}.ask${i}`, line.ar));
    step.reasks.forEach((line, i) => check(`step${index}.${step.id}.reask${i}`, line.ar));
    step.reactions.forEach((line, i) => check(`step${index}.${step.id}.reaction${i}`, line.ar));
    step.hints.forEach((line, i) => check(`step${index}.${step.id}.hint${i}`, line.ar));
  });
  return issues;
}
