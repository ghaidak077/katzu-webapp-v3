import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConversationMessage } from '../src/features/conversation/ConversationMessage';
import type { ChatMessage } from '../src/types/models';

/**
 * The correction card's render rules (V41):
 *  1. a Latin letter inside an Arabic explanation is direction-isolated, so
 *     «حرف l مضعّف» paints `l` and not «ا» (measured bug);
 *  2. the model's own Arabic quote is hidden while the derived chip is present,
 *     because it can contradict that chip;
 *  3. when there is no chip, the model's quote is still shown.
 */
const noop = () => {};

function cardHtml(correction: Partial<ChatMessage>, explanationAr?: string, grammarRule?: string): string {
  const correctionMessage: ChatMessage = {
    id: 'correction',
    sender: 'KATZU',
    germanText: '',
    ...correction,
    ...(explanationAr ? { explanationAr } : {}),
    ...(grammarRule !== undefined ? { grammarRule } : {}),
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
  it('isolates the Latin letter in «حرف l مضعّف» so RTL cannot reshape it', () => {
    const html = cardHtml({ originalMistake: 'halo', correctedGerman: 'hallo' });
    // The explanation names the doubled letter the chip names.
    expect(html).toContain('مضعّف');
    expect(html).toContain('<bdi dir="ltr">l</bdi>');
    // The bare, unisolated letter must not appear in the Arabic run.
    expect(html).not.toMatch(/حرف l /);
  });

  it('hides the model quote when the derived chip is present', () => {
    const html = cardHtml({
      originalMistake: 'halo',
      correctedGerman: 'hallo',
      // The measured contradiction: the model called it a letter rule while the
      // chip already says «Schreibung: Doppel-l».
      roastComment: 'حرف l مضعّف',
    });
    expect(html).toContain('Schreibung: Doppel-l');
    expect(html).not.toContain('«حرف l مضعّف»');
  });

  it('keeps the model quote when there is no chip to contradict', () => {
    const html = cardHtml(
      {
        originalMistake: 'Ich habe gehen.',
        correctedGerman: 'Ich bin gegangen.',
        roastComment: 'زمن الفعل غير صحيح',
      },
      'استخدم الفعل المساعد الصحيح.',
      '',
    );
    expect(html).not.toContain('Schreibung:');
    expect(html).toContain('«زمن الفعل غير صحيح»');
  });

  it('isolates a Latin run in a fallback explanation too', () => {
    const html = cardHtml(
      {
        originalMistake: 'Ich habe gehen.',
        correctedGerman: 'Ich bin gegangen.',
      },
      'الجملة فيها das Perfekt مكتوبة خطأ.',
      '',
    );
    expect(html).toContain('<bdi dir="ltr">das</bdi>');
    expect(html).toContain('<bdi dir="ltr">Perfekt</bdi>');
  });
});
