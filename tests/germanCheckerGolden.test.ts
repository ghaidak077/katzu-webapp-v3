import { describe, it, expect } from 'vitest';
import { checkGerman } from '@/lib/conversation/germanChecker';

/**
 * Golden correction set.
 *
 * WHY: the reported defect was a card that showed a fragment, missed a
 * capitalisation-only error, or used a different rule name each turn. These
 * cases pin the complete corrected sentence and the category of every error the
 * learner is taught, for the three levels the product ships first. Every case is
 * a sentence a real A0–A2 learner can type into the practice chat.
 */

interface Golden {
  input: string;
  corrected: string;
  categories: Array<'meaning' | 'grammar' | 'spelling' | 'capitalisation'>;
}

const A0: Golden[] = [
  { input: 'hallo', corrected: 'Hallo.', categories: ['capitalisation'] },
  { input: 'ich bin Ali', corrected: 'Ich bin Ali.', categories: ['capitalisation'] },
  { input: 'ich heiße ghaidak', corrected: 'Ich heiße Ghaidak.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'hallo ich bin Ali', corrected: 'Hallo, ich bin Ali.', categories: ['grammar', 'capitalisation'] },
  { input: 'ich komme aus syrien', corrected: 'Ich komme aus Syrien.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich wohne in berlin', corrected: 'Ich wohne in Berlin.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'das ist ein hund', corrected: 'Das ist ein Hund.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich habe eine katze', corrected: 'Ich habe eine Katze.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'der hund ist groß', corrected: 'Der Hund ist groß.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'guten morgen', corrected: 'Guten Morgen.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich trinke wasser', corrected: 'Ich trinke Wasser.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'danke schön', corrected: 'Danke schön.', categories: ['capitalisation'] },
  { input: 'ich bin müde', corrected: 'Ich bin müde.', categories: ['capitalisation'] },
  { input: 'wo ist der bahnhof', corrected: 'Wo ist der Bahnhof?', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich möchte einen kaffee', corrected: 'Ich möchte einen Kaffee.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich heiße sara', corrected: 'Ich heiße Sara.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'das ist mein freund', corrected: 'Das ist mein Freund.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich lerne deutsch', corrected: 'Ich lerne Deutsch.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'tschüss', corrected: 'Tschüss.', categories: ['capitalisation'] },
  { input: 'hallo frau meier', corrected: 'Hallo Frau Meier.', categories: ['capitalisation', 'capitalisation', 'capitalisation'] },
  { input: 'ich bin aus der schweiz', corrected: 'Ich bin aus der Schweiz.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'mein vater ist arzt', corrected: 'Mein Vater ist Arzt.', categories: ['capitalisation', 'capitalisation', 'capitalisation'] },
  { input: 'ich habe hunger', corrected: 'Ich habe Hunger.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'heute ist montag', corrected: 'Heute ist Montag.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich brauche ein termin', corrected: 'Ich brauche einen Termin.', categories: ['grammar', 'capitalisation', 'capitalisation'] },
  { input: 'ich habe der hund', corrected: 'Ich habe den Hund.', categories: ['grammar', 'capitalisation', 'capitalisation'] },
  { input: 'ich habe die hund', corrected: 'Ich habe den Hund.', categories: ['grammar', 'capitalisation', 'capitalisation'] },
  { input: 'ich leibe katze', corrected: 'Ich liebe eine Katze.', categories: ['grammar', 'spelling', 'capitalisation', 'capitalisation'] },
  { input: 'ich trinke kaffee', corrected: 'Ich trinke Kaffee.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'das ist eine tasche', corrected: 'Das ist eine Tasche.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich gehe ins kino', corrected: 'Ich gehe ins Kino.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'der apfel ist rot', corrected: 'Der Apfel ist rot.', categories: ['capitalisation', 'capitalisation'] },
];

const A1: Golden[] = [
  ...A0,
  { input: 'Heute ich gehe ins Kino', corrected: 'Heute gehe ich ins Kino.', categories: ['grammar'] },
  { input: 'Ich habe ein Gift für dich', corrected: 'Ich habe ein Geschenk für dich.', categories: ['meaning'] },
  { input: 'Ich bekomme 20 Jahre alt', corrected: 'Ich werde 20 Jahre alt.', categories: ['meaning'] },
  { input: 'hallo Frau Meier ich heiße ghaidak', corrected: 'Hallo Frau Meier, ich heiße Ghaidak.', categories: ['grammar', 'capitalisation', 'capitalisation'] },
  { input: 'ich heisse ghaidak', corrected: 'Ich heiße Ghaidak.', categories: ['spelling', 'capitalisation', 'capitalisation'] },
  { input: 'ich brauche einen termin', corrected: 'Ich brauche einen Termin.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich kaufe ein apfel', corrected: 'Ich kaufe einen Apfel.', categories: ['grammar', 'capitalisation', 'capitalisation'] },
  { input: 'ich habe ein hund', corrected: 'Ich habe einen Hund.', categories: ['grammar', 'capitalisation', 'capitalisation'] },
  { input: 'ich liebe mein katze', corrected: 'Ich liebe meine Katze.', categories: ['grammar', 'capitalisation', 'capitalisation'] },
  { input: 'wir trinken ein tee', corrected: 'Wir trinken einen Tee.', categories: ['grammar', 'capitalisation', 'capitalisation'] },
  { input: 'er hat ein buch', corrected: 'Er hat ein Buch.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich möchte ein wasser', corrected: 'Ich möchte ein Wasser.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'die katze ist klein', corrected: 'Die Katze ist klein.', categories: ['capitalisation', 'capitalisation'] },
  { input: 'ich suche ein wohnung', corrected: 'Ich suche eine Wohnung.', categories: ['grammar', 'capitalisation', 'capitalisation'] },
];

const A2: Golden[] = [
  ...A1,
  { input: 'Ich habe mit der Hund gespielt', corrected: 'Ich habe mit dem Hund gespielt.', categories: ['grammar'] },
  { input: 'Ich gehe zu der Arzt', corrected: 'Ich gehe zu dem Arzt.', categories: ['grammar'] },
  { input: 'Ich fahre nach der Schweiz', corrected: 'Ich fahre nach der Schweiz.', categories: [] },
  { input: 'Ich habe gestern ein Film gesehen', corrected: 'Ich habe gestern einen Film gesehen.', categories: ['grammar'] },
  { input: 'Ich brauche ein neue Wohnung', corrected: 'Ich brauche eine neue Wohnung.', categories: ['grammar'] },
  { input: 'Ich wohne seit ein Jahr hier', corrected: 'Ich wohne seit einem Jahr hier.', categories: ['grammar'] },
  { input: 'Ich lerne seit ein Monat Deutsch', corrected: 'Ich lerne seit einem Monat Deutsch.', categories: ['grammar'] },
  { input: 'Ich habe die Termin vergessen', corrected: 'Ich habe den Termin vergessen.', categories: ['grammar'] },
  { input: 'Das ist der Auto von mein Vater', corrected: 'Das ist das Auto von meinem Vater.', categories: ['grammar', 'grammar'] },
  { input: 'Ich trinke lieber tee', corrected: 'Ich trinke lieber Tee.', categories: ['capitalisation'] },
  { input: 'Ich möchte ein termin machen', corrected: 'Ich möchte einen Termin machen.', categories: ['grammar', 'capitalisation'] },
  { input: 'Ich habe kein zeit', corrected: 'Ich habe keine Zeit.', categories: ['grammar', 'capitalisation'] },
];

describe.each([
  ['A0', A0],
  ['A1', A1],
  ['A2', A2],
] as const)('%s golden corrections', (level, cases) => {
  it('covers at least 30 learner inputs', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(cases)('«$input» is corrected to «$corrected»', (sample) => {
    const result = checkGerman(sample.input, level);
    // Terminal punctuation is never added to the learner's sentence and never
    // mentioned: a missing «.» / «?» is not a correction and not a note.
    const endsWithMark = /[.!?]\s*$/.test(sample.input);
    const expectedCorrected = endsWithMark ? sample.corrected : sample.corrected.replace(/[.!?]+$/, '');
    expect(result.corrected).toBe(expectedCorrected);
    expect('softNoteAr' in result).toBe(false);
    expect(result.ok).toBe(sample.categories.length === 0);
    expect(result.errors.map((error) => error.category)).toEqual(sample.categories);
  });
});

describe('local checks never touch the network', () => {
  it('corrects a batch with the global fetch replaced by a thrower', () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error('checkGerman must not fetch');
    }) as typeof fetch;
    try {
      for (const sample of A1) checkGerman(sample.input, 'A1');
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toBe(0);
  });
});

describe('praise never accompanies a wrong sentence', () => {
  it('returns ok=true only when there is no error to fix', () => {
    for (const sample of A2) {
      expect(checkGerman(sample.input, 'A2').ok, sample.input).toBe(sample.categories.length === 0);
    }
  });
});

/**
 * Pronouns are not nouns.
 *
 * Reported defect: the name-after-«heißen» rule read the «du» in
 * «Wie heißt du nochmal?» as a person's name and capitalised it, so a correct
 * question came back "corrected". The noun rule had the same shape: pronouns
 * after an article or sentence-initial were one keystroke away from «Du».
 * Formal «Sie/Ihnen/Ihr» must stay capitalised; informal du/dir/dich/dein never.
 */
describe('pronoun and formal-address goldens', () => {
  const cases: Array<{ input: string; corrected: string; categories: string[]; soft: boolean }> = [
    { input: 'Wie heißt du nochmal, bitte?', corrected: 'Wie heißt du nochmal, bitte?', categories: [], soft: false },
    { input: 'Wie heißt du nochmal?', corrected: 'Wie heißt du nochmal?', categories: [], soft: false },
    { input: 'Wie heißt du?', corrected: 'Wie heißt du?', categories: [], soft: false },
    { input: 'Wie heißt du', corrected: 'Wie heißt du', categories: [], soft: true },
    { input: 'Wie geht es dir?', corrected: 'Wie geht es dir?', categories: [], soft: false },
    { input: 'wie geht es dir', corrected: 'Wie geht es dir', categories: ['capitalisation'], soft: true },
    { input: 'ich danke dir', corrected: 'Ich danke dir', categories: ['capitalisation'], soft: true },
    { input: 'ich sehe dich', corrected: 'Ich sehe dich', categories: ['capitalisation'], soft: true },
    { input: 'Ich liebe dich', corrected: 'Ich liebe dich', categories: [], soft: true },
    { input: 'Ich habe dich gesehen', corrected: 'Ich habe dich gesehen', categories: [], soft: true },
    { input: 'Ich gebe dir das Buch', corrected: 'Ich gebe dir das Buch', categories: [], soft: true },
    { input: 'das ist dein hund', corrected: 'Das ist dein Hund', categories: ['capitalisation', 'capitalisation'], soft: true },
    { input: 'ich habe deine katze', corrected: 'Ich habe deine Katze', categories: ['capitalisation', 'capitalisation'], soft: true },
    { input: 'Gib mir bitte dein Buch', corrected: 'Gib mir bitte dein Buch', categories: [], soft: true },
    { input: 'Du bist nett', corrected: 'Du bist nett', categories: [], soft: true },
    { input: 'Wie heißen Sie?', corrected: 'Wie heißen Sie?', categories: [], soft: false },
    { input: 'können Sie mir helfen', corrected: 'Können Sie mir helfen', categories: ['capitalisation'], soft: true },
    { input: 'ich danke Ihnen', corrected: 'Ich danke Ihnen', categories: ['capitalisation'], soft: true },
    { input: 'Ich habe Ihr Buch', corrected: 'Ich habe Ihr Buch', categories: [], soft: true },
    { input: 'Ich möchte mit Ihnen sprechen', corrected: 'Ich möchte mit Ihnen sprechen', categories: [], soft: true },
    { input: 'Ist das dein Koffer?', corrected: 'Ist das dein Koffer?', categories: [], soft: false },
  ];

  it('covers at least 20 pronoun cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases)('«$input» stays natural German', (sample) => {
    const result = checkGerman(sample.input, 'A1');
    expect(result.corrected).toBe(sample.corrected);
    expect(result.errors.map((error) => error.category)).toEqual(sample.categories);
    expect('softNoteAr' in result).toBe(false);
  });
});

describe('terminal punctuation is never added, never flagged', () => {
  it.each([
    ['Ich heiße Ghaidak', 'Ich heiße Ghaidak'],
    ['Ich heiße ghaidak', 'Ich heiße Ghaidak'],
    ['Wo ist der Bahnhof', 'Wo ist der Bahnhof'],
    ['Wie heißt du', 'Wie heißt du'],
  ])('«%s» is not given a mark it did not have', (input, expected) => {
    const result = checkGerman(input, 'A1');
    expect(result.corrected).toBe(expected);
    expect(result.corrected).not.toMatch(/[.!?]$/);
    expect('softNoteAr' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain('ملاحظة اختيارية');
  });

  it('emits no note even when the learner already punctuated', () => {
    for (const input of ['Ich heiße Ghaidak.', 'Wie heißt du?', 'Danke!']) {
      const result = checkGerman(input, 'A1');
      expect('softNoteAr' in result).toBe(false);
    }
  });

  it('never counts punctuation as a correction in the note count', () => {
    const result = checkGerman('Ich heiße ghaidak', 'A1');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].category).toBe('capitalisation');
  });
});
