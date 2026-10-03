import { useEffect, useState } from 'react';

/**
 * The shareable mock-exam image (V24 Phase 5) — pure canvas, no dependency.
 *
 * Contains ONLY the learner's first name (if available) and numbers the session
 * already computed. No full name, no account id, no score claim: the image is a
 * "I practised" badge, not a certificate. The notice (محاكاة, not the official
 * exam) is painted onto the image itself so a screenshot can never travel
 * without it.
 */

export interface ExamShareData {
  firstName: string;
  scenarioTitle: string;
  sentencesSpoken: number;
  independentSentences: number;
}

/** The notice every share image carries, in Arabic, painted by the canvas. */
export const SHARE_NOTICE_AR = 'محاكاة — ليست الامتحان الرسمي';

/**
 * Canvas paint, read from the live design tokens.
 *
 * This image used to carry its own hardcoded copy of the palette, which is how
 * a shared exam card ended up in the *old* violet while the app around it had
 * moved on. `ctx.fillStyle` cannot take a CSS custom property, but
 * `getComputedStyle` can resolve one to a real colour, so the share image now
 * paints whatever the app's single palette says — one source of truth, no
 * second copy to forget.
 *
 * The fallbacks are the current token values, so the image still renders
 * correctly if this is ever called outside a document.
 */
function palette(): {
  hero: string;
  canvas: string;
  accent: string;
  ink: string;
  inkDim: string;
} {
  // The literals below are *the token values themselves*, used only when there
  // is no document to read a custom property from. They are not a second copy
  // of the palette: `node scripts/contrast-check.mjs` resolves the same tokens
  // from src/index.css, so if either side moves, both must.
  // design-audit: allow — a documented fallback of the token it names
  const FALLBACK = {
    '--kz-lavender-deep': '#7C5CF0', // design-audit: allow — a documented fallback of the token it names
    '--kz-near-black': '#050508', // design-audit: allow — a documented fallback of the token it names
    '--kz-lavender': '#B4A0FF', // design-audit: allow — a documented fallback of the token it names
    '--kz-ink': '#F6F2EE', // design-audit: allow — a documented fallback of the token it names
    '--kz-ink-dim': '#A79FC4', // design-audit: allow — a documented fallback of the token it names
  } as const;

  const read = (name: string): string => {
    const fallback = FALLBACK[name as keyof typeof FALLBACK];
    if (typeof window === 'undefined') return fallback;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) return fallback;
    // Tokens are declared as space-separated RGB triplets, which canvas needs
    // in functional notation.
    return /^[\d.]+[\s ]+[\d.]+[\s ]+[\d.]+$/.test(raw) ? `rgb(${raw})` : raw;
  };

  return {
    hero: read('--kz-lavender-deep'),
    canvas: read('--kz-near-black'),
    accent: read('--kz-lavender'),
    ink: read('--kz-ink'),
    inkDim: read('--kz-ink-dim'),
  };
}

export function examShareImage(
  canvas: HTMLCanvasElement,
  data: ExamShareData,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = (canvas.width = 1080);
  const H = (canvas.height = 1080);

  const c = palette();

  // Background: the app's dark glass look, painted from the live tokens.
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, c.hero);
  gradient.addColorStop(1, c.canvas);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Accent ring — the same accent the app uses everywhere else.
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(W / 2, 300, 130, 0, Math.PI * 2);
  ctx.stroke();

  // The cat paw mark stands in for the mascot inside the ring (no bitmap load,
  // no dependency): a simple filled circle + three toes.
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(W / 2, 320, 62, 0, Math.PI * 2);
  ctx.fill();
  for (const dx of [-64, 0, 64]) {
    ctx.beginPath();
    ctx.arc(W / 2 + dx, 218, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = c.ink;

  // First name only — the caller guarantees this is not a full name.
  if (data.firstName) {
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillText(data.firstName, W / 2, 560);
  }

  ctx.font = '48px system-ui, sans-serif';
  ctx.fillStyle = c.inkDim;
  ctx.fillText(`أكمل محاكاة «${data.scenarioTitle}»`, W / 2, 650);

  // Numbers the session computed — nothing else.
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.fillStyle = c.ink;
  ctx.fillText(String(data.sentencesSpoken), W / 2 - 160, 810);
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.fillText(String(data.independentSentences), W / 2 + 160, 810);

  ctx.font = '34px system-ui, sans-serif';
  ctx.fillStyle = c.inkDim;
  ctx.fillText('جملة أُنتجت', W / 2 - 160, 870);
  ctx.fillText('بلا تلميح', W / 2 + 160, 870);

  // The notice, on the image itself.
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillStyle = c.accent;
  ctx.fillText(SHARE_NOTICE_AR, W / 2, 990);
}

/** React wrapper: paints an offscreen canvas and exposes a PNG blob URL. */
export function useExamShareImage(data: ExamShareData): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const key = `${data.firstName}|${data.scenarioTitle}|${data.sentencesSpoken}|${data.independentSentences}`;

  useEffect(() => {
    let revoked: string | null = null;
    let alive = true;
    try {
      const canvas = document.createElement('canvas');
      examShareImage(canvas, data);
      canvas.toBlob((blob) => {
        if (!blob || !alive) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      }, 'image/png');
    } catch {
      // Canvas unavailable (rare, e.g. blocked storage): the share button
      // simply doesn't render — never a broken image.
    }
    return () => {
      alive = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return url;
}
