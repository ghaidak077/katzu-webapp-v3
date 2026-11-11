/**
 * Level-spec enforcement twin (V21 Phase 1) — the worker-side mirror of
 * `src/lib/levels/levelSpec.ts` (the worker is plain JS and cannot import TS).
 *
 * `tests/levelParity.test.ts` imports BOTH modules and asserts the shared
 * fields are equal, so the two tables cannot drift silently.
 *
 * What the worker does with it (docs/agent/LEVEL-SPEC.md rule 2): after the
 * model answers `/ai/turn`, `validateGermanAgainstLevel` checks the reply's
 * German against the level's caps (sentence word cap, tense markers, allowed
 * connectors). One violation -> ONE repair call; still violating -> a
 * deterministic per-level fallback line. The learner never reads off-spec
 * German, and the normal turn is still exactly one model call.
 */

export const LEVEL_SPECS = {
  A0: {
    maxWordsPerSentence: 6,
    tenseGroups: ['praesens'],
    allowedConnectors: ['und', 'oder', 'aber'],
    maxCorrectionsPerTurn: 1,
  },
  A1: {
    maxWordsPerSentence: 8,
    tenseGroups: ['praesens', 'perfekt'],
    allowedConnectors: ['und', 'oder', 'aber', 'denn', 'dann'],
    maxCorrectionsPerTurn: 1,
  },
  A2: {
    maxWordsPerSentence: 10,
    tenseGroups: ['praesens', 'perfekt', 'praeteritum'],
    allowedConnectors: ['und', 'oder', 'aber', 'denn', 'dann', 'weil', 'dass', 'wenn', 'deshalb'],
    maxCorrectionsPerTurn: 2,
  },
  B1: {
    maxWordsPerSentence: 12,
    tenseGroups: ['praesens', 'perfekt', 'praeteritum', 'futur', 'konjunktiv_ii'],
    allowedConnectors: ['und', 'oder', 'aber', 'denn', 'dann', 'weil', 'dass', 'wenn', 'deshalb', 'obwohl', 'damit', 'bevor', 'nachdem', 'während'],
    maxCorrectionsPerTurn: 3,
  },
  B2: {
    maxWordsPerSentence: 15,
    tenseGroups: ['praesens', 'perfekt', 'praeteritum', 'futur', 'konjunktiv_ii'],
    allowedConnectors: ['*'],
    maxCorrectionsPerTurn: 3,
  },
};

/**
 * Deterministic fallback lines, one per level. Chosen so they are safe for any
 * persona register (no second-person pronoun, no question), inside the tense
 * and length budget of their level, and honest about being a placeholder.
 * The Arabic travels with the German so the learner's bubble never shows a
 * translation of a sentence that is not on screen.
 */
export const FALLBACK_LINES = {
  A0: { de: 'Ich verstehe. Wir üben weiter.', ar: 'فهمت. نكمل التدريب.' },
  A1: { de: 'Ich verstehe. Sprechen wir weiter.', ar: 'فهمت. لنتابع الحديث.' },
  A2: { de: 'Das ist gut. Machen wir mit der Übung weiter.', ar: 'كان ذلك جيداً. لنكمل التمرين.' },
  B1: { de: 'Das war ein guter Versuch. Fahren wir mit dem Gespräch fort.', ar: 'كانت محاولة جيدة. لنكمل الحوار.' },
  B2: { de: 'Das war ein langer Satz, aber die Übung geht weiter.', ar: 'كانت جملة طويلة، لكن التمرين يستمر.' },
};

/**
 * Tense markers per group: frequent, distinctive forms only (a floor, not a
 * CEFR examiner — see LEVEL-SPEC.md "Known determinism limits").
 *
 * Deliberate choices:
 * - The Perfekt group is PARTICIPLE-shaped, not auxiliary-shaped: plain
 *   present auxiliaries (ist, bin, hat) are legal at every level that allows
 *   Präsens, so they must never be violation markers.
 * - "möchte" is the polite present-tense form taught from A1; it is NOT
 *   treated as Konjunktiv II.
 * - "könnte" is ambiguous (Präteritum of können AND Konjunktiv II) and is
 *   allowed wherever Präteritum is allowed.
 * - Futur needs an infinitive-looking neighbour ("ich werde kommen"), so
 *   "das wird teuer" (real Präsens of werden) is not flagged.
 */
export const TENSE_MARKERS = {
  perfekt: [
    'gewesen', 'gehabt', 'gemacht', 'gesagt', 'gekommen', 'gegangen', 'gefunden',
    'gekauft', 'gegessen', 'getrunken', 'gearbeitet', 'gelernt', 'gefahren',
    'verstanden', 'gefragt', 'gewollt', 'bekommen', 'angekommen', 'verloren',
  ],
  praeteritum: [
    'war', 'warst', 'waren', 'wart', 'hatte', 'hattest', 'hatten',
    'konnte', 'konnten', 'wollte', 'wollten', 'musste', 'mussten',
    'durfte', 'durften', 'sollte', 'sollten', 'wusste', 'gaben', 'kam', 'ging',
  ],
  konjunktiv_ii: [
    'wäre', 'wären', 'hätte', 'hättest', 'hätten', 'würde', 'würdest',
    'würden', 'würdet', 'könnte', 'könnten', 'bräuchte', 'käme', 'ginge',
  ],
};

const countWords = (sentence) => sentence.trim().split(/\s+/).filter(Boolean).length;

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validates one model reply against a level spec.
 * Returns { ok: true } or { ok: false, reason: string }.
 * Pure and deterministic — unit-tested in tests/levelSpecEnforcement.test.ts;
 * parity of the tables themselves is pinned in tests/levelParity.test.ts.
 */
export function validateGermanAgainstLevel(replyDe, level) {
  const text = String(replyDe || '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  const spec = LEVEL_SPECS[level] || LEVEL_SPECS.A1;
  const lower = ` ${text.toLowerCase()} `;
  const sentences = splitSentences(text);

  const tooLong = sentences.find((s) => countWords(s) > spec.maxWordsPerSentence);
  if (tooLong) {
    return { ok: false, reason: `sentence_too_long(${countWords(tooLong)}>${spec.maxWordsPerSentence})` };
  }

  const allowed = new Set(spec.tenseGroups);
  const forbiddenGroups = ['perfekt', 'praeteritum', 'konjunktiv_ii'].filter((g) => !allowed.has(g));
  for (const group of forbiddenGroups) {
    for (const marker of TENSE_MARKERS[group]) {
      if (marker === 'könnte' || marker === 'könnten') {
        // Ambiguous with Präteritum: allowed wherever Präteritum is allowed.
        if (allowed.has('praeteritum')) continue;
      }
      const re = new RegExp(`(^|[\\s,.!?])${marker}([\\s,.!?]|$)`, 'i');
      if (re.test(lower)) return { ok: false, reason: `tense_${group}_marker:${marker}` };
    }
  }
  if (!allowed.has('futur')) {
    const futurRe = /(^|[\s,.!?])(werde|wirst|wird|werden|werdet)\s+\p{L}+en\b/iu;
    if (futurRe.test(text)) return { ok: false, reason: 'tense_futur_marker' };
  }

  if (!spec.allowedConnectors.includes('*')) {
    const allowedConnectors = new Set(spec.allowedConnectors.map((c) => c.toLowerCase()));
    for (const connector of ['weil', 'dass', 'obwohl', 'damit', 'bevor', 'nachdem', 'während', 'deshalb']) {
      if (allowedConnectors.has(connector)) continue;
      const re = new RegExp(`(^|[\\s,])${connector}([\\s,]|$)`, 'i');
      if (re.test(lower)) return { ok: false, reason: `connector_${connector}_not_allowed` };
    }
  }

  return { ok: true };
}

/** The deterministic line (German + its Arabic) served when the model will not obey the caps. */
export function levelFallbackLine(level) {
  return FALLBACK_LINES[level] || FALLBACK_LINES.A1;
}

/** How many learner mistakes may be corrected in one turn at this level. */
export function correctionBudgetFor(level) {
  return (LEVEL_SPECS[level] || LEVEL_SPECS.A1).maxCorrectionsPerTurn;
}

/** Compact prompt line mirroring the client's `levelConstraintLine`. */
export function levelConstraintLine(level) {
  const spec = LEVEL_SPECS[level] || LEVEL_SPECS.A1;
  const tenseNames = {
    A0: 'present tense only',
    A1: 'present and perfect (Perfekt) tense only',
    A2: 'present, perfect and simple past (Präteritum) only',
  };
  const tenses = tenseNames[level] || 'any tense';
  const connectors = spec.allowedConnectors.includes('*')
    ? 'any connectors'
    : `connectors limited to: ${spec.allowedConnectors.join(', ')}`;
  return `LEVEL CAPS — write German at CEFR ${level}: at most ${spec.maxWordsPerSentence} words per sentence; ${tenses}; ${connectors}.`;
}
