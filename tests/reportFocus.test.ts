import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * The reply-report buttons are identical, so only a focus state can make one of
 * them look different. Closing the confirmation restored focus to the trigger,
 * and a programmatic focus after a pointer close still matched `:focus-visible`
 * in Chromium — the last button kept a lavender pill while its siblings did not.
 *
 * The fix keeps focus restoration (keyboard users must not lose their place) but
 * marks the restored element so the ring is suppressed until the next key press.
 */
describe('report-button focus is keyboard-only and consistent', () => {
  const dialog = read('src/components/ui/useModalDialog.ts');
  const css = read('src/index.css');
  const message = read('src/features/conversation/ConversationMessage.tsx');

  it('detects whether the trigger was keyboard-focused before restoring it', () => {
    expect(dialog).toContain("trigger?.matches(':focus-visible')");
    expect(dialog).toContain('openedWithKeyboard');
  });

  it('suppresses the restored ring for a pointer close', () => {
    expect(dialog).toContain("setAttribute('data-pointer-focus', 'true')");
    expect(css).toMatch(/\[data-pointer-focus\]:focus-visible\s*\{\s*outline:\s*none/);
  });

  it('brings the ring back on the next key press or blur', () => {
    expect(dialog).toContain("addEventListener('keydown', clear, true)");
    expect(dialog).toContain("addEventListener('blur', clear)");
  });

  it('renders one report-button treatment for every AI reply', () => {
    const matches = message.match(/aria-label="أبلغ عن رد سيئ"/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(message).not.toMatch(/aria-label="أبلغ عن رد سيئ"[^>]*className=\{[^}]*\}/);
  });
});
