import { describe, expect, it } from 'vitest';
import {
  TURN_NATIVE_LANGUAGES,
  TURN_TARGET_LANGUAGES,
  buildTurnSystemInstruction,
  resolveTurnLanguages,
} from '../cloudflare-ai-chat.js';

/**
 * The turn's language contract.
 *
 * Two things must stay true together, and they pull in opposite directions:
 *
 *   1. an ordinary Arabic/German turn must send exactly the prompt v11 sent —
 *      it is cached, costed and replayed, so a stray extra space is a behaviour
 *      change; and
 *   2. the same builder must be able to speak to an English or Indonesian
 *      learner and practise Dutch, from tables rather than from string surgery.
 *
 * These tests pin both: the byte-identical default, and the parameterised paths.
 */

function prompt(extra: Record<string, unknown> = {}): string {
  const built = buildTurnSystemInstruction({
    level: 'A1',
    scenarioTitle: 'Café bestellen',
    scenarioId: 'cafe_order',
    persona: 'friendly barista',
    scenarioCategory: 'daily',
    sarcasmLevel: 2,
    isFinalTurn: false,
    turnIndex: 1,
    learnerAskedRepeat: false,
    ...extra,
  });
  return built.parts.map((part: { text: string }) => part.text).join('');
}

describe('the language tables', () => {
  it('defines Dutch but does not ship it yet', () => {
    expect(TURN_TARGET_LANGUAGES.de.shipped).toBe(true);
    expect(TURN_TARGET_LANGUAGES.nl.shipped).toBe(false);
    expect(TURN_TARGET_LANGUAGES.nl.name).toBe('Dutch');
  });

  it('gives every native language the prose the prompt needs', () => {
    for (const code of ['ar', 'en', 'id'] as const) {
      const entry = TURN_NATIVE_LANGUAGES[code];
      expect(entry.code).toBe(code);
      expect(entry.name.trim().length).toBeGreaterThan(0);
      expect(entry.uppercase).toBe(entry.uppercase.toUpperCase());
      expect(entry.chipNote.length).toBeGreaterThan(10);
      expect(entry.example).toContain('e.g.');
    }
    expect(TURN_NATIVE_LANGUAGES.ar.name).toBe('Modern Standard Arabic');
    expect(TURN_NATIVE_LANGUAGES.ar.greetingRule).toContain('السلام عليكم');
    expect(TURN_NATIVE_LANGUAGES.en.greetingRule).toBe('');
  });
});

describe('resolving the pair from a request body', () => {
  it('defaults to the shipped pair', () => {
    expect(resolveTurnLanguages(null)).toEqual({ targetLang: 'de', nativeLang: 'ar' });
    expect(resolveTurnLanguages({})).toEqual({ targetLang: 'de', nativeLang: 'ar' });
  });

  it('accepts every shipped native language', () => {
    expect(resolveTurnLanguages({ native_lang: 'en' }).nativeLang).toBe('en');
    expect(resolveTurnLanguages({ native_lang: 'ID' }).nativeLang).toBe('id');
  });

  it('refuses an unshipped course, so a Dutch label can never sit over German content', () => {
    expect(resolveTurnLanguages({ target_lang: 'nl' }).targetLang).toBe('de');
    expect(resolveTurnLanguages({ target_lang: 'de' }).targetLang).toBe('de');
  });

  it('is total: junk, wrong types and misses all resolve to the default pair', () => {
    expect(resolveTurnLanguages({ target_lang: 'fr', native_lang: 'de' })).toEqual({
      targetLang: 'de',
      nativeLang: 'ar',
    });
    expect(resolveTurnLanguages({ target_lang: 42, native_lang: {} })).toEqual({
      targetLang: 'de',
      nativeLang: 'ar',
    });
  });
});

describe('the assembled prompt', () => {
  it('is the Arabic/German prompt when nothing is asked for', () => {
    const text = prompt();
    expect(text).toContain('You are the in-character native German roleplay counterpart');
    expect(text).toContain('its accurate, idiomatic Modern Standard Arabic translation.');
    expect(text).toContain('Never translate secular German greetings as السلام عليكم.');
    expect(text).toContain('a witty, warm Arabic-speaking German grammar coach');
    expect(text).toContain('a SHORT ARABIC label of 3-7 words naming the rule');
    expect(text).toContain('Never English — it is shown to an Arabic speaker as a chip');
    expect(text).toContain('one or two short Arabic sentences explaining the fix.');
  });

  it('speaks Indonesian to an Indonesian learner while still practising German', () => {
    const text = prompt({ nativeLang: 'id' });
    expect(text).toContain('in-character native German roleplay counterpart');
    expect(text).toContain('idiomatic Indonesian translation');
    expect(text).toContain('a SHORT INDONESIAN label of 3-7 words naming the rule');
    expect(text).toContain('Indonesian-speaking German grammar coach');
    expect(text).toContain('one playful Indonesian line about German grammar');
    // The Arabic-only greeting rule must never reach a non-Arabic learner.
    expect(text).not.toContain('السلام عليكم');
    expect(text).not.toContain('Modern Standard Arabic');
  });

  it('speaks English to an English learner', () => {
    const text = prompt({ nativeLang: 'en' });
    expect(text).toContain('idiomatic English translation');
    expect(text).toContain('English-speaking German grammar coach');
    expect(text).toContain('Never Arabic — it is shown to an English-speaking learner as a chip');
    expect(text).toContain('English sentences explaining the fix');
  });

  it('can practise Dutch through the same builder, for the day its content ships', () => {
    const text = prompt({ targetLang: 'nl', nativeLang: 'en' });
    expect(text).toContain('in-character native Dutch roleplay counterpart');
    expect(text).toContain('real spoken Dutch');
    expect(text).toContain('your natural Dutch reply');
    expect(text).toContain('roasts Dutch grammar');
    // Field names stay `reply_de` / `reply_ar` by contract with the shipped bundle.
    expect(text).toContain('reply_de:');
    expect(text).toContain('reply_ar:');
  });

  it('still carries the shared rules in every language', () => {
    for (const nativeLang of ['ar', 'en', 'id'] as const) {
      const text = prompt({ nativeLang });
      expect(text).toContain('IDENTITY LIMITS');
      expect(text).toContain('Return:');
      expect(text).toContain('Respond strictly as JSON');
    }
  });
});
