import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConversationMessage } from '../src/features/conversation/ConversationMessage';
import type { ChatMessage } from '../src/types/models';

/**
 * The correction card's render rules (2026-11-13).
 *
 * There is ONE author of a correction: the model that read the learner's intended
 * meaning. The card therefore shows
 *  1. the learner's sentence and its corrected form, with the changed characters
 *     marked (a diff, not a rule name);
 *  2. the model's own short Arabic reason, direction-isolated so a Latin word in
 *     it cannot be reshaped by the RTL run.
 * It must NOT show a rule label derived from the two strings: that is the old
 * «Schreibung: ein Buchstabe zu viel» chip, which on real input turned «lebie»
 * into «lebe» — a different verb — and contradicted its own explanation.
 */
const noop = () => {};

function cardHtml(correction: Partial<ChatMessage>): string {
  const correctionMessage: ChatMessage = {
    id: 'correction',
    sender: 'KATZU',
    germanText: '',
    ...correction,
  };
  const message: ChatMessage = { id: 'm1', sender: 'USER', germanText: 'halo' };
  return renderToStaticMarkup(
    React.createElement(ConversationMessage, {
      message,
      isTranslationVisible: false,
      knownWords: new Set<string>(),
      onToggleTranslation: noop,
      onRetryTranslation: noop,
      onSpeak: noop,
      onWordClick: noop,
      showHelp: true,
      correctionMessage,
    }),
  );
}

describe('the correction card render', () => {
  it('shows the corrected sentence and the model reason, with no derived spelling label', () => {
    const html = cardHtml({
      originalMistake: 'ich lebie katze',
      correctedGerman: 'Ich liebe Katzen.',
      explanationAr: 'الكلمة تعني يحب: liebe وليس lebe، والجمع Katzen.',
      positiveNoteAr: 'قريب! بقي تصحيح واحد.',
    });
    // The diff splits the sentence into marked characters, so compare the text.
    const text = html.replace(/<[^>]+>/g, '');
    expect(text).toContain('Ich liebe Katzen');
    expect(text).toContain('liebe');
    // The deleted string-distance chip must not come back in any form.
    expect(html).not.toContain('Schreibung');
    expect(html).not.toContain('ein Buchstabe zu viel');
  });

  it('isolates Latin runs inside the model reason so RTL cannot reshape them', () => {
    const html = cardHtml({
      originalMistake: 'Ich habe gehen.',
      correctedGerman: 'Ich bin gegangen.',
      explanationAr: 'استخدم das Perfekt مع الفعل المساعد الصحيح.',
    });
    expect(html).toContain('dir="ltr">das<');
    expect(html).toContain('dir="ltr">Perfekt<');
  });

  it('renders no reason at all when the model had nothing to fix', () => {
    const html = cardHtml({
      originalMistake: 'Guten Tag.',
      correctedGerman: 'Guten Tag.',
      explanationAr: '',
      positiveNoteAr: 'أحسنت!',
    });
    expect(html).toContain('أحسنت!');
    expect(html).not.toContain('kz-ar-caption');
  });

  it('marks the characters that changed on both sides of the diff', () => {
    const html = cardHtml({
      originalMistake: 'ich lebie katze',
      correctedGerman: 'Ich liebe Katzen.',
      explanationAr: 'liebe وليس lebe.',
    });
    const marks = html.match(/<mark/g) || [];
    expect(marks.length).toBeGreaterThan(1);
    expect(html).toContain('mark');
    // Both sides of the diff carry a highlighted run.
    expect(html.split('<mark').length - 1).toBeGreaterThanOrEqual(2);
  });
});
