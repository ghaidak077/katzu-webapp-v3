/**
 * Content gate for curriculum drafts.
 *
 * Curriculum is data, but a typo in curriculum data is a learner-visible defect:
 * a misspelled `topic` makes a Study screen render empty, and a stray top-level
 * key makes a loader silently insert nothing. This module is the single place
 * that knows the D1 content contract, so both the CLI
 * (`scripts/audit-curriculum.mjs`), the loader (`scripts/load-curriculum.mjs`)
 * and the test suite validate against exactly the same rules.
 *
 * Deliberately dependency-free: it is imported by Node CLIs that strip types,
 * so it must not import from `@/` aliases or pull in runtime code. The
 * scenario→topic join is injected by the caller instead, so the real
 * `scenarioToVocabTopic` stays the single source of truth.
 */

/**
 * Content levels (V21 Phase 5): A0 joins the ladder so the foundations module
 * can carry from-zero rows. Stored content keeps A1–B2 except where a module
 * deliberately authors A0; every consumer (placement generator, level specs,
 * the level filter UI) already treats A0 as the floor.
 */
export const CONTENT_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2'] as const;
export type ContentLevel = (typeof CONTENT_LEVELS)[number];

/** Column contract per D1 table. Extra or missing keys are errors, by design. */
export const CONTENT_COLUMNS = {
  scenarios: [
    'id',
    'title_de',
    'title_ar',
    'ai_persona',
    'category',
    'icon',
    'initial_message_a0',
    'initial_message_a1',
    'initial_message_a2',
    'initial_message_b1',
    'initial_message_b2',
    'banner_url',
  ],
  vocabulary: [
    'german',
    'article',
    'plural',
    'part_of_speech',
    'translation_ar',
    'translation_en',
    'example_de',
    'example_ar',
    'example_en',
    'level',
    'topic',
  ],
  starter_phrases: ['scenario_id', 'level', 'german', 'translation_en', 'translation_ar', 'sort_order'],
  grammar: ['id', 'title_ar', 'rule_de', 'rule_ar', 'level', 'explanation_ar', 'example_de', 'example_ar'],
} as const;

/**
 * Columns a draft may leave out.
 *
 * `banner_url` is the scenario's own 16:9 artwork, filled in later from the
 * content editor; a curriculum draft with no artwork must still be loadable, and
 * every scenario keeps a placeholder banner until the real one exists.
 */
export const OPTIONAL_COLUMNS: Partial<Record<keyof typeof CONTENT_COLUMNS, readonly string[]>> = {
  // `initial_message_a0` joins `banner_url` as optional: only the foundations
  // module carries from-zero openers, and older rows/modules legitimately lack them.
  scenarios: ['banner_url', 'initial_message_a0'],
};

/** Tables the loader may write. Anything else in the draft is not loadable. */
export const LOADABLE_TYPES = ['scenarios', 'vocabulary', 'starter_phrases', 'grammar'] as const;
export type LoadableType = (typeof LOADABLE_TYPES)[number];

/** Keys a draft may carry without being loadable content. */
export const NON_LOADABLE_KEYS = ['_note', 'meta', 'review', 'deferred'] as const;

/** Module size required by docs/agent/CONTENT-GATE.md and docs/CONTENT-AUTHORING-PROMPT.md. */
export const MODULE_SCENARIO_LIMITS = { min: 5, max: 8 } as const;

/** Per-scenario content standard (docs/LEARNING-ROADMAP.md, Phase 5). */
export const STANDARD = {
  minVocabPerTopic: 15,
  maxVocabPerTopic: 40,
  minPhrasesPerScenario: 6,
  maxPhrasesPerScenario: 10,
  minGrammarPerLevel: 2,
} as const;

export interface AuditIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface AuditStats {
  scenarios: number;
  vocabulary: number;
  phrases: number;
  grammar: number;
  topics: Record<string, number>;
  /** `review.status` as declared by the draft author. */
  reviewStatus: string;
}

export interface AuditReport {
  ok: boolean;
  errors: AuditIssue[];
  warnings: AuditIssue[];
  stats: AuditStats;
}

const ARABIC = /[\u0600-\u06FF]/;
const SLUG = /^[a-z0-9_]+$/;

/**
 * Mojibake and ASCII-umlaut spellings, using the same definitions the content
 * hygiene test asserts over every draft and the offline fixture (RC-3).
 */
const MOJIBAKE = /[\uFFFD\u00C3\u00C2]/;
const UMLAUT_AS_ASCII =
  /\b(fuer|ueber|koennen|koennte|moechte|moechten|haette|waere|gruen|gruesse|strasse|gross|heisst|weiss|moeglich|zurueck|spaeter|hoeren|fuehren)\b/i;

/**
 * Unmistakably English function words — none of them is a German word, so a
 * German sentence cannot trip the check by accident. Two distinct hits in one
 * field is an error (one can be a coincidence, e.g. a quoted form).
 *
 * Deliberately excludes `was`, which is German ("Was ist das?").
 */
const ENGLISH_ONLY_WORDS = [
  'is', 'are', 'were', 'the', 'and', 'of', 'question', 'answer', 'sentence',
  'means', 'translates', 'polite', 'infinitive', 'stands', 'always', 'never',
];

function englishTells(value: string): string[] {
  const lower = value.toLowerCase();
  return ENGLISH_ONLY_WORDS.filter((word) => new RegExp(`\\b${word}\\b`).test(lower));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasArabic(value: unknown): boolean {
  return typeof value === 'string' && ARABIC.test(value);
}

/**
 * Validates a grammar supplement against the same D1 column contract the modules
 * use, plus the Arabic/German language checks in both directions.
 *
 * Why this exists (V14-2 → V15): the four `g_*` rows the five original scenarios
 * point at had no home that the gate could accept. `auditCurriculum` requires
 * 5–8 scenarios, 15+ vocabulary per topic pool and 6–10 phrases per scenario, so
 * a grammar-only file could not pass it — and the loader refuses any draft the
 * audit rejects. Rather than loosen the module rules (they are the module size
 * policy), supplements get their own shape, validated by this function and run by
 * `scripts/audit-curriculum.mjs` over `docs/content/supplements/*.json`.
 *
 * The module rules are untouched by this function, and a supplement may not
 * declare module tables: a grammar row is global content, and letting a
 * "supplement" carry scenarios or vocabulary would create a second, unvalidated
 * path for the module standard.
 *
 * @param draft A parsed `docs/content/supplements/*.json` file.
 */
export function auditGrammarSupplement(draft: unknown): AuditReport {
  const errors: AuditIssue[] = [];
  const warnings: AuditIssue[] = [];
  const stats: AuditStats = { scenarios: 0, vocabulary: 0, phrases: 0, grammar: 0, topics: {}, reviewStatus: 'missing' };

  const error = (path: string, message: string) => errors.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) => warnings.push({ severity: 'warning', path, message });

  if (!isPlainObject(draft)) {
    error('$', 'supplement must be a JSON object');
    return { ok: false, errors, warnings, stats };
  }

  // --- file shape ------------------------------------------------------------
  const allowed = new Set<string>(['_note', 'meta', 'review', 'grammar']);
  for (const key of Object.keys(draft)) {
    if (allowed.has(key)) continue;
    if ((LOADABLE_TYPES as readonly string[]).includes(key)) {
      error(`$.${key}`, `a supplement carries grammar only — "${key}" belongs in a module draft (docs/content/curriculum-*.json)`);
    } else {
      error(`$.${key}`, `unknown top-level key (allowed: ${[...allowed].join(', ')})`);
    }
  }

  // --- meta / review --------------------------------------------------------
  if (!isPlainObject(draft.meta)) {
    error('$.meta', 'meta block is required');
  } else {
    for (const field of ['track', 'moduleTitleAr', 'primaryLevel', 'version', 'designedFor']) {
      if (!isNonEmptyString(draft.meta[field])) error(`$.meta.${field}`, 'required non-empty string');
    }
    if (isNonEmptyString(draft.meta.primaryLevel) && !CONTENT_LEVELS.includes(draft.meta.primaryLevel as ContentLevel)) {
      error('$.meta.primaryLevel', `must be one of ${CONTENT_LEVELS.join(', ')}`);
    }
  }

  if (!isPlainObject(draft.review)) {
    error('$.review', 'review block is required — unreviewed content must declare itself as such');
  } else {
    const status = draft.review.status;
    if (!['pending', 'approved', 'rejected'].includes(String(status))) {
      error('$.review.status', 'must be pending, approved or rejected');
    } else {
      stats.reviewStatus = String(status);
      if (status === 'approved') {
        if (!isNonEmptyString(draft.review.reviewedBy)) error('$.review.reviewedBy', 'required once review.status is approved');
        if (!isNonEmptyString(draft.review.reviewedAt)) error('$.review.reviewedAt', 'required once review.status is approved');
      }
    }
    if (!Array.isArray(draft.review.checklist) || draft.review.checklist.length === 0) {
      error('$.review.checklist', 'a review checklist is required');
    }
  }

  // --- grammar --------------------------------------------------------------
  if (!Array.isArray(draft.grammar) || draft.grammar.length === 0) {
    error('$.grammar', 'at least one grammar row is required');
    return { ok: errors.length === 0, errors, warnings, stats };
  }

  stats.grammar = draft.grammar.length;
  const seenIds = new Set<string>();
  draft.grammar.forEach((raw, i) => {
    const path = `$.grammar[${i}]`;
    if (!isPlainObject(raw)) return void error(path, 'must be an object');

    // Column contract — the same one the loader writes through, so a typo here
    // cannot become a 500 in the middle of a load (V12's failure mode).
    for (const column of CONTENT_COLUMNS.grammar) {
      if (!(column in raw)) {
        error(`${path}.${column}`, 'column missing from the D1 grammar contract');
        continue;
      }
      if (!isNonEmptyString(raw[column])) error(`${path}.${column}`, 'required non-empty string');
    }
    for (const column of Object.keys(raw)) {
      if (!(CONTENT_COLUMNS.grammar as readonly string[]).includes(column)) {
        error(`${path}.${column}`, 'not a column of the D1 grammar table');
      }
    }

    const id = String(raw.id ?? '');
    if (id && !SLUG.test(id)) error(`${path}.id`, 'must match ^[a-z0-9_]+$');
    if (seenIds.has(id)) error(`${path}.id`, `duplicate grammar id "${id}"`);
    seenIds.add(id);
    // An error here, unlike the module rule's warning: a supplement exists to
    // satisfy SCENARIO_GRAMMAR_IDS, and every id in that map is `g_`-prefixed.
    if (id && !id.startsWith('g_')) {
      error(`${path}.id`, 'supplement grammar ids must use the g_ prefix — SCENARIO_GRAMMAR_IDS points at g_* rows');
    }

    const level = String(raw.level ?? '');
    if (!CONTENT_LEVELS.includes(level as ContentLevel)) {
      error(`${path}.level`, `must be one of ${CONTENT_LEVELS.join(', ')}`);
    }

    // --- Arabic checks (one per Arabic-scoped field) -------------------------
    for (const field of ['title_ar', 'rule_ar', 'explanation_ar', 'example_ar']) {
      const value = raw[field];
      if (isNonEmptyString(value) && !hasArabic(value)) {
        error(`${path}.${field}`, 'must contain Arabic script');
      }
    }
    // Latin letters in `example_ar` mean the wrong text landed in the wrong
    // column: `example_de` holds its German. This mirrors the content-hygiene
    // test's `ARABIC_ONLY` set, which deliberately **excludes** `title_ar`,
    // `rule_ar` and `explanation_ar` — those name the German form they teach
    // (12 of the 14 approved module rows quote German inline in
    // `explanation_ar`, and 0 of their `example_ar` fields do).
    const exampleAr = raw.example_ar;
    if (isNonEmptyString(exampleAr) && /[A-Za-z]/.test(exampleAr)) {
      error(`${path}.example_ar`, 'must be Arabic only — its German belongs in example_de');
    }

    // --- German checks (the direction V14 found unchecked) -------------------
    for (const field of ['rule_de', 'example_de']) {
      const value = raw[field];
      if (!isNonEmptyString(value)) continue;
      if (hasArabic(value)) error(`${path}.${field}`, 'must be German, not Arabic');
      if (MOJIBAKE.test(value)) error(`${path}.${field}`, 'contains mojibake (mis-decoded bytes)');
      const umlaut = value.match(UMLAUT_AS_ASCII);
      if (umlaut) error(`${path}.${field}`, `umlaut written as ASCII letters ("${umlaut[0]}") — use ä/ö/ü/ß`);
      const tells = englishTells(value);
      if (tells.length >= 2) {
        error(`${path}.${field}`, `looks like English, not German (${tells.join(', ')}) — the learner reads this column as German`);
      }
    }

    // A German example with no verb is usually a fragment; a warning, not a rule.
    if (isNonEmptyString(raw.example_de) && !/[a-zA-ZäöüÄÖÜß]/.test(String(raw.example_de))) {
      warn(`${path}.example_de`, 'no German letters — check the example');
    }
  });

  return { ok: errors.length === 0, errors, warnings, stats };
}

/**
 * Validates a parsed curriculum draft against the D1 contract and the
 * per-scenario content standard.
 *
 * @param resolveTopic The real `scenarioToVocabTopic` from
 *   `src/lib/utils/scenarioVocab.ts`. Injected so this module stays importable
 *   by type-stripping Node and so the join is never reimplemented.
 */
export function auditCurriculum(
  draft: unknown,
  resolveTopic: (scenario: { id: string; category: string }) => string,
): AuditReport {
  const errors: AuditIssue[] = [];
  const warnings: AuditIssue[] = [];
  const stats: AuditStats = { scenarios: 0, vocabulary: 0, phrases: 0, grammar: 0, topics: {}, reviewStatus: 'missing' };

  const error = (path: string, message: string) => errors.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) => warnings.push({ severity: 'warning', path, message });

  if (!isPlainObject(draft)) {
    error('$', 'draft must be a JSON object');
    return { ok: false, errors, warnings, stats };
  }

  // --- Unknown top-level keys -------------------------------------------------
  // A misspelled `vocabularies` would make a loader insert nothing and report
  // success. Refusing unknown keys turns a silent content hole into a failure.
  const allowed = new Set<string>([...NON_LOADABLE_KEYS, ...LOADABLE_TYPES]);
  for (const key of Object.keys(draft)) {
    if (!allowed.has(key)) error(`$.${key}`, `unknown top-level key (allowed: ${[...allowed].join(', ')})`);
  }

  // --- meta / review ---------------------------------------------------------
  if (!isPlainObject(draft.meta)) {
    error('$.meta', 'meta block is required');
  } else {
    for (const field of ['track', 'moduleTitleAr', 'primaryLevel', 'version', 'designedFor']) {
      if (!isNonEmptyString(draft.meta[field])) error(`$.meta.${field}`, 'required non-empty string');
    }
    if (isNonEmptyString(draft.meta.primaryLevel) && !CONTENT_LEVELS.includes(draft.meta.primaryLevel as ContentLevel)) {
      error('$.meta.primaryLevel', `must be one of ${CONTENT_LEVELS.join(', ')}`);
    }
  }

  if (!isPlainObject(draft.review)) {
    error('$.review', 'review block is required — unreviewed content must declare itself as such');
  } else {
    const status = draft.review.status;
    if (!['pending', 'approved', 'rejected'].includes(String(status))) {
      error('$.review.status', 'must be pending, approved or rejected');
    } else {
      stats.reviewStatus = String(status);
      // Approval metadata must be attributable and dated; the policy defines
      // the permitted AI self-review attribution format.
      if (status === 'approved') {
        if (!isNonEmptyString(draft.review.reviewedBy)) error('$.review.reviewedBy', 'required once review.status is approved');
        if (!isNonEmptyString(draft.review.reviewedAt)) error('$.review.reviewedAt', 'required once review.status is approved');
      }
    }
    if (!Array.isArray(draft.review.checklist) || draft.review.checklist.length === 0) {
      error('$.review.checklist', 'a review checklist is required');
    }
  }

  // --- scenarios -------------------------------------------------------------
  const scenarioTopics = new Map<string, string>();
  if (!Array.isArray(draft.scenarios)) {
    error('$.scenarios', 'must be an array containing 5–8 scenarios');
  } else {
    stats.scenarios = draft.scenarios.length;
    if (draft.scenarios.length < MODULE_SCENARIO_LIMITS.min || draft.scenarios.length > MODULE_SCENARIO_LIMITS.max) {
      error('$.scenarios', `module must contain ${MODULE_SCENARIO_LIMITS.min}–${MODULE_SCENARIO_LIMITS.max} scenarios; got ${draft.scenarios.length}`);
    }
    if (draft.scenarios.length === 0) error('$.scenarios', 'at least one scenario is required');
    const seenIds = new Set<string>();
    draft.scenarios.forEach((raw, i) => {
      const path = `$.scenarios[${i}]`;
      if (!isPlainObject(raw)) return void error(path, 'must be an object');
      const optional = OPTIONAL_COLUMNS.scenarios ?? [];
      for (const column of CONTENT_COLUMNS.scenarios) {
        if (optional.includes(column)) continue;
        if (!isNonEmptyString(raw[column])) error(`${path}.${column}`, 'required non-empty string');
      }
      if (isNonEmptyString(raw.banner_url) && !/^https?:\/\//.test(String(raw.banner_url))) {
        warn(`${path}.banner_url`, 'expected an https URL — the app renders it in an <img>');
      }
      const id = String(raw.id ?? '');
      if (id && !SLUG.test(id)) error(`${path}.id`, 'must match ^[a-z0-9_]+$');
      if (seenIds.has(id)) error(`${path}.id`, `duplicate scenario id "${id}"`);
      seenIds.add(id);
      if (isNonEmptyString(raw.title_ar) && !hasArabic(raw.title_ar)) {
        error(`${path}.title_ar`, 'must contain Arabic script');
      }
      if (isNonEmptyString(raw.ai_persona) && !/\bkatze\b/i.test(raw.ai_persona)) {
        warn(`${path}.ai_persona`, 'existing personas follow the "<Rolle> katze" convention');
      }
      // The join that decides whether Study/Quiz find this scenario's words.
      if (isNonEmptyString(raw.category)) {
        const topic = resolveTopic({ id, category: String(raw.category) });
        if (!isNonEmptyString(topic)) {
          error(
            `${path}.category`,
            `category "${raw.category}" resolves to no vocabulary topic — Study would render an empty word list. ` +
              'Add the category to SCENARIO_CATEGORY_TO_TOPIC (src/lib/utils/scenarioVocab.ts) or use an existing one.',
          );
        } else {
          scenarioTopics.set(id, topic);
        }
      }
    });
  }

  // --- vocabulary ------------------------------------------------------------
  if (!Array.isArray(draft.vocabulary) || draft.vocabulary.length === 0) {
    error('$.vocabulary', 'at least one vocabulary row is required');
  } else {
    stats.vocabulary = draft.vocabulary.length;
    const seen = new Set<string>();
    draft.vocabulary.forEach((raw, i) => {
      const path = `$.vocabulary[${i}]`;
      if (!isPlainObject(raw)) return void error(path, 'must be an object');
      for (const column of CONTENT_COLUMNS.vocabulary) {
        if (!(column in raw)) {
          error(`${path}.${column}`, 'column missing from the D1 vocabulary contract');
          continue;
        }
        // `plural` is null for nouns without one, and `article` is empty for
        // every non-noun — both are legitimate, so they are validated in their
        // own rules below instead of the generic non-empty check.
        if (column === 'plural' || column === 'article') continue;
        if (!isNonEmptyString(raw[column])) error(`${path}.${column}`, 'required non-empty string');
      }
      if ('article' in raw && !['', null, 'der', 'die', 'das'].includes(raw.article as string | null)) {
        error(`${path}.article`, 'must be der, die, das, or empty for a non-noun');
      }
      for (const column of Object.keys(raw)) {
        if (!(CONTENT_COLUMNS.vocabulary as readonly string[]).includes(column)) {
          error(`${path}.${column}`, 'not a column of the D1 vocabulary table');
        }
      }
      const level = String(raw.level ?? '');
      if (level && !CONTENT_LEVELS.includes(level as ContentLevel)) {
        error(`${path}.level`, `must be one of ${CONTENT_LEVELS.join(', ')}`);
      }
      if (isNonEmptyString(raw.translation_ar) && !hasArabic(raw.translation_ar)) {
        error(`${path}.translation_ar`, 'must contain Arabic script');
      }
      if (isNonEmptyString(raw.example_ar) && !hasArabic(raw.example_ar)) {
        error(`${path}.example_ar`, 'must contain Arabic script');
      }
      if (isNonEmptyString(raw.translation_ar) && raw.translation_ar.trim() === String(raw.translation_en ?? '').trim()) {
        warn(`${path}.translation_ar`, 'identical to translation_en — the Arabic gloss was probably not authored');
      }
      // A noun without an article teaches the wrong habit (see the app's
      // der/die/das colour system), so it is an error rather than a warning.
      if (raw.part_of_speech === 'Noun' && !isNonEmptyString(raw.article)) {
        error(`${path}.article`, 'German nouns must declare der/die/das');
      }
      if (raw.part_of_speech === 'Noun' && raw.plural === null) {
        warn(`${path}.plural`, 'no plural recorded — set it, or confirm the noun has none');
      }
      const topic = String(raw.topic ?? '');
      if (topic) stats.topics[topic] = (stats.topics[topic] ?? 0) + 1;
      const key = `${topic}|${level}|${String(raw.german ?? '')}`;
      if (seen.has(key)) {
        // Neither `vocabulary` has a unique key, so a duplicate headword means a
        // duplicate row in D1 and two identical options in one quiz item.
        error(`${path}`, `duplicate headword for ${key} — D1 has no unique key, so this would insert twice`);
      }
      seen.add(key);
    });

    // Every vocab topic must belong to a scenario in this draft, otherwise the
    // rows load into a pool nothing reads.
    const declaredTopics = new Set(scenarioTopics.values());
    for (const topic of Object.keys(stats.topics)) {
      if (!declaredTopics.has(topic)) {
        error(`$.vocabulary`, `topic "${topic}" matches no scenario in this draft — those rows would be unreachable`);
      }
    }
  }

  // --- starter phrases ------------------------------------------------------
  if (!Array.isArray(draft.starter_phrases) || draft.starter_phrases.length === 0) {
    error('$.starter_phrases', 'at least one starter phrase is required');
  } else {
    stats.phrases = draft.starter_phrases.length;
    const byScenario = new Map<string, number[]>();
    draft.starter_phrases.forEach((raw, i) => {
      const path = `$.starter_phrases[${i}]`;
      if (!isPlainObject(raw)) return void error(path, 'must be an object');
      for (const column of CONTENT_COLUMNS.starter_phrases) {
        if (!(column in raw)) error(`${path}.${column}`, 'column missing from the D1 starter_phrases contract');
      }
      for (const column of Object.keys(raw)) {
        if (!(CONTENT_COLUMNS.starter_phrases as readonly string[]).includes(column)) {
          error(`${path}.${column}`, 'not a column of the D1 starter_phrases table');
        }
      }
      const level = String(raw.level ?? '');
      if (!CONTENT_LEVELS.includes(level as ContentLevel)) {
        error(`${path}.level`, `must be one of ${CONTENT_LEVELS.join(', ')}`);
      }
      if (isNonEmptyString(raw.translation_ar) && !hasArabic(raw.translation_ar)) {
        error(`${path}.translation_ar`, 'must contain Arabic script');
      }
      const scenarioId = String(raw.scenario_id ?? '');
      if (scenarioId && !scenarioTopics.has(scenarioId)) {
        error(`${path}.scenario_id`, `"${scenarioId}" is not a scenario in this draft — those phrases would be invisible`);
      }
      if (!Number.isInteger(raw.sort_order)) {
        error(`${path}.sort_order`, 'must be an integer');
      } else {
        byScenario.set(scenarioId, [...(byScenario.get(scenarioId) ?? []), raw.sort_order as number]);
      }
    });
    for (const [scenarioId, orders] of byScenario) {
      const sorted = [...orders].sort((a, b) => a - b);
      const contiguous = sorted.every((value, index) => value === index + 1);
      if (!contiguous) error(`$.starter_phrases[${scenarioId}]`, `sort_order must be contiguous from 1, got ${sorted.join(', ')}`);
      if (orders.length < STANDARD.minPhrasesPerScenario || orders.length > STANDARD.maxPhrasesPerScenario) {
        error(
          `$.starter_phrases[${scenarioId}]`,
          `scenario has ${orders.length} phrases; the standard is ${STANDARD.minPhrasesPerScenario}–${STANDARD.maxPhrasesPerScenario}`,
        );
      }
    }
    for (const scenarioId of scenarioTopics.keys()) {
      if (!byScenario.has(scenarioId)) error(`$.starter_phrases`, `scenario "${scenarioId}" has no starter phrases`);
    }
  }

  // --- per-scenario vocabulary standard -------------------------------------
  // Measured on the *topic pool*, because that is what StudyScreen and
  // QuizScreen actually read (they filter by topic, not by scenario).
  for (const [scenarioId, topic] of scenarioTopics) {
    const pool = stats.topics[topic] ?? 0;
    if (pool < STANDARD.minVocabPerTopic) {
      error(`$.vocabulary[topic=${topic}]`, `scenario "${scenarioId}" reads a pool of ${pool} words; the standard is at least ${STANDARD.minVocabPerTopic}`);
    } else if (pool > STANDARD.maxVocabPerTopic) {
      warn(`$.vocabulary[topic=${topic}]`, `pool of ${pool} words is above ${STANDARD.maxVocabPerTopic} — consider splitting the topic`);
    }
  }

  // --- grammar --------------------------------------------------------------
  if (!Array.isArray(draft.grammar) || draft.grammar.length === 0) {
    error('$.grammar', 'at least one grammar point is required');
  } else {
    stats.grammar = draft.grammar.length;
    const seenIds = new Set<string>();
    const perLevel = new Map<string, number>();
    draft.grammar.forEach((raw, i) => {
      const path = `$.grammar[${i}]`;
      if (!isPlainObject(raw)) return void error(path, 'must be an object');
      for (const column of CONTENT_COLUMNS.grammar) {
        if (!isNonEmptyString(raw[column])) error(`${path}.${column}`, 'required non-empty string');
      }
      for (const column of Object.keys(raw)) {
        if (!(CONTENT_COLUMNS.grammar as readonly string[]).includes(column)) {
          error(`${path}.${column}`, 'not a column of the D1 grammar table');
        }
      }
      const id = String(raw.id ?? '');
      if (id && !SLUG.test(id)) error(`${path}.id`, 'must match ^[a-z0-9_]+$');
      if (seenIds.has(id)) error(`${path}.id`, `duplicate grammar id "${id}"`);
      seenIds.add(id);
      if (id && !id.startsWith('g_')) warn(`${path}.id`, 'existing grammar ids use the g_ prefix');
      const level = String(raw.level ?? '');
      if (!CONTENT_LEVELS.includes(level as ContentLevel)) {
        error(`${path}.level`, `must be one of ${CONTENT_LEVELS.join(', ')}`);
      } else {
        perLevel.set(level, (perLevel.get(level) ?? 0) + 1);
      }
      for (const field of ['title_ar', 'rule_ar', 'explanation_ar', 'example_ar']) {
        if (isNonEmptyString(raw[field]) && !hasArabic(raw[field])) {
          error(`${path}.${field}`, 'must contain Arabic script');
        }
      }
    });
    // grammar has no scenario_id, so it is global: every level the module
    // teaches needs its own points or the scenario has no rule to explain.
    for (const level of new Set(scenarioTopics.size ? CONTENT_LEVELS : [])) {
      const count = perLevel.get(level) ?? 0;
      const usedByDraft = Array.isArray(draft.vocabulary)
        ? draft.vocabulary.some((row) => isPlainObject(row) && row.level === level)
        : false;
      if (usedByDraft && count < STANDARD.minGrammarPerLevel) {
        error(`$.grammar[level=${level}]`, `the module teaches ${level} but ships only ${count} grammar point(s); the standard is ${STANDARD.minGrammarPerLevel}`);
      }
    }
  }

  // --- deferred (authored but not loadable) ---------------------------------
  if ('deferred' in draft) {
    if (!isPlainObject(draft.deferred)) {
      error('$.deferred', 'must be an object');
    } else {
      if (!Array.isArray(draft.deferred.requiresSchema) || draft.deferred.requiresSchema.length === 0) {
        error('$.deferred.requiresSchema', 'must list the tables the deferred content needs');
      }
      // A loadable table name must never appear under `deferred`, or content
      // silently stops being loadable while looking present.
      for (const type of LOADABLE_TYPES) {
        if (type in draft.deferred) {
          error(`$.deferred.${type}`, `"${type}" is a loadable D1 table — move it to the top level, not into deferred`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}
