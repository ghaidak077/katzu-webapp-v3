import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keyboard + assistive-tech contract for the app's two overlay primitives.
 *
 * `Modal` and `BottomSheet` are plain divs: nothing moves focus into them, Tab
 * escapes into the page behind, Escape does nothing and closing drops focus on
 * `<body>`. A learner who never touches a pointer cannot use them at all.
 *
 * This keeps the existing markup on purpose. The alternative — a native
 * `<dialog>` with `showModal()` — gives focus trapping, Escape and background
 * inertness for free, but it also restyles the panel (UA margins, centring and
 * a `::backdrop` layer) on every screen that uses these components. With the
 * built-preview screenshot renderer unavailable, a wholesale visual change to
 * shared overlays could not be verified, so the semantics are added around the
 * current DOM instead: `role="dialog"` + `aria-modal` on the panel, focus moved
 * in on open, Tab cycled inside, Escape to close, and focus restored to the
 * trigger on close. The markup is otherwise untouched.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useModalDialog(
  isOpen: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
): void {
  const restoreRef = useRef<HTMLElement | null>(null);
  /**
   * Whether the trigger was showing a keyboard focus ring when the dialog opened.
   *
   * Closing a dialog restores focus to the trigger. On a pointer close that
   * programmatic focus can still match `:focus-visible`, which drew a lavender
   * pill around the reply-report button the learner had just clicked — only the
   * last one, because only the last one had been restored. Focus still returns
   * (keyboard users must not lose their place); the ring is suppressed for the
   * pointer case and comes back on the next key press.
   */
  const openedWithKeyboard = useRef(false);

  // Remember what opened the dialog and give focus back to it on close, so the
  // keyboard learner resumes where they were instead of at the top of the page.
  useEffect(() => {
    if (!isOpen) return;
    const trigger = (document.activeElement as HTMLElement | null) ?? null;
    restoreRef.current = trigger;
    openedWithKeyboard.current = trigger?.matches(':focus-visible') ?? false;
    return () => {
      const target = restoreRef.current;
      if (!target || typeof target.focus !== 'function' || !document.contains(target)) return;
      target.focus();
      if (openedWithKeyboard.current) return;

      // Pointer close: keep focus, hide the ring until the learner uses the
      // keyboard again. The attribute is scoped to this one element and is
      // cleared on the next key press or blur, so it cannot leak.
      target.setAttribute('data-pointer-focus', 'true');
      const clear = () => {
        target.removeAttribute('data-pointer-focus');
        window.removeEventListener('keydown', clear, true);
        target.removeEventListener('blur', clear);
      };
      window.addEventListener('keydown', clear, true);
      target.addEventListener('blur', clear);
    };
  }, [isOpen]);

  // Move focus inside once the panel exists. The first real control is a better
  // landing spot than the panel itself; with none, the panel takes focus so screen
  // readers announce the dialog and its label.
  useEffect(() => {
    if (!isOpen) return;
    const node = containerRef.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? node).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, containerRef]);

  // Escape closes. Tab is trapped: without this, Tab walks into the page behind
  // a surface that is supposed to be the only interactive thing on screen.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const node = containerRef.current;
      if (!node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active !== null && node.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, containerRef]);
}
