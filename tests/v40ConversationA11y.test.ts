import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * V40 — the accessibility findings the redesign's own measurement turned up, pinned.
 *
 * Two of these were invisible to every gate the project runs, which is why they
 * are written down here rather than left to the reviewer:
 *
 *  1. **The action slot had two controls, one of them invisible.** The send plane
 *     and the microphone cross-fade in the same 56px slot, and the half that was
 *     not showing was hidden with `opacity-0 pointer-events-none` only. Measured on
 *     the built bundle with an empty field: `disabled=true`, so Tab could not reach
 *     it, but it was still in the accessibility tree — a screen reader walked past
 *     the field into an invisible "أرسل جملتك" and then into the microphone. With
 *     text typed it was the reverse: the microphone stayed announced behind the
 *     send button.
 *
 *     The obvious fix, the `inert` attribute, does not work here and this is the
 *     reason it is not in the source: React 18.3 does not pass `inert` through to
 *     the DOM at all. Measured on the built bundle with the attribute set —
 *     `inertAttr=false`, and no error anywhere. A type declaration would have made
 *     the build green while the defect stayed exactly as it was, so the three
 *     channels are covered explicitly instead: `aria-hidden` for the a11y tree,
 *     `disabled` + `tabIndex={-1}` for the tab order, `pointer-events-none` for
 *     hit-testing.
 *
 *  2. **The viewport meta blocked pinch-zoom.** `maximum-scale=1.0,
 *     user-scalable=no` is a WCAG 1.4.4 failure, and axe reported it as the only
 *     violation left on the live conversation screen (moderate, so the existing
 *     critical/serious gate never saw it). It was there to stop a double-tap from
 *     zooming mid-drill, so the fix keeps that behaviour where it belongs —
 *     `touch-action: manipulation` on the controls — and gives zoom back.
 *
 * The unit runner has no DOM (`environment: 'node'`), so, like
 * `interfaceContracts.test.ts`, these read the real source and assert the
 * structural rule. The behaviour itself is asserted in the browser by
 * `e2e/conversationA11y.spec.ts`; this file is what stops the source drifting back
 * between runs of that suite.
 */

describe('V40 — the conversation action slot shows one control at a time', () => {
  const dock = read('src/features/conversation/ConversationDock.tsx');

  it('hides the half that is not showing from assistive tech, in both directions', () => {
    // The microphone's wrapper while there is text to send…
    expect(dock).toContain('aria-hidden={hasText || undefined}');
    // …and the send plane's wrapper while the field is empty.
    expect(dock).toContain('aria-hidden={!hasText || undefined}');
  });

  it('does not rely on opacity alone to hide a control', () => {
    // The two opacity classes are the cross-fade; they must always travel with the
    // hidden marker, never stand on their own.
    const hidden = dock.match(/pointer-events-none opacity-0/g) ?? [];
    expect(hidden.length).toBe(2);
    expect(dock).not.toContain("'opacity-0'");
  });

  it('does not reach for `inert`, which React 18 silently drops', () => {
    // Measured: `<div inert={true}>` renders with no `inert` attribute at all under
    // React 18.3, and no warning. An attribute that is silently absent is worse
    // than no attribute, because it reads as handled.
    expect(dock).not.toMatch(/\binert=/);
  });

  it('keeps the send button out of the tab order while it is hidden', () => {
    expect(dock).toContain('tabIndex={hasText ? 0 : -1}');
  });

  it('states the orb\'s disabled state in the tab order, not only in the pointer', () => {
    // A disabled <button> still accepts a programmatic `focus()` in Chromium, and
    // in the dock the orb is disabled exactly when it is not the action on screen.
    const orbSource = read('src/components/voice/KatzuOrb.tsx');
    expect(orbSource).toContain('tabIndex={disabled ? -1 : 0}');
  });

  it('keeps the hint sheet a sibling of the glass dock', () => {
    // V40 defect: a `position: fixed` sheet nested inside a `backdrop-filter`
    // surface is positioned against that surface, not the viewport, so it rendered
    // inside the dock's own box. The sheet must close before the dock element does.
    const dockElementCloses = dock.indexOf('</FloatingControl>');
    const sheetOpens = dock.indexOf('<BottomSheet');
    expect(dockElementCloses).toBeGreaterThan(-1);
    expect(sheetOpens).toBeGreaterThan(dockElementCloses);
  });
});

describe('V40 — the viewport allows zoom', () => {
  const html = read('index.html');
  const css = read('src/index.css');

  // Read the tag's own content, not the file: the comment above it quotes the old
  // value to explain why it went, and a whole-file search would read that prose as
  // the defect coming back.
  const viewportContent = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1];

  it('no longer forbids scaling', () => {
    expect(viewportContent).toBeDefined();
    expect(viewportContent).not.toContain('user-scalable');
    expect(viewportContent).not.toContain('maximum-scale');
  });

  it('keeps the safe-area insets real on a notched phone', () => {
    // The bottom bar pads itself with `env(safe-area-inset-bottom)`; without
    // `viewport-fit=cover` that resolves to 0 and the bar sits under the home
    // indicator on every notched iPhone.
    expect(viewportContent).toContain('viewport-fit=cover');
  });

  it('suppresses double-tap zoom on the controls instead of on the document', () => {
    // The one behaviour `user-scalable=no` was really providing, kept where it is
    // wanted: a second tap on a control, not a two-finger pinch.
    expect(css).toMatch(/button,[\s\S]{0,80}?touch-action: manipulation/);
    // The transcript still scrolls and still pinches.
    expect(css).toMatch(/\[data-testid='conversation-transcript'\]\s*\{\s*touch-action: pan-x pan-y pinch-zoom/);
    // A pinch at the end of the chat must not bounce the whole page.
    expect(css).toContain('overscroll-behavior: none');
  });

  it('gives the conversation root a 100vh fallback before 100dvh', () => {
    // An engine without `dvh` (Safari < 15.4) drops a `100dvh`-only height to auto,
    // which would collapse the whole screen — a worse bug than the one `dvh` fixes.
    // The fallback must come first in the declaration list to be overridden by the
    // engines that do understand `dvh`.
    expect(css).toMatch(/\.kz-viewport-pin\s*\{\s*height: 100vh;\s*height: 100dvh;/);
    expect(read('src/features/conversation/LiveConversationScreen.tsx')).toContain('kz-viewport-pin');
  });
});