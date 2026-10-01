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

export function examShareImage(
  canvas: HTMLCanvasElement,
  data: ExamShareData,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = (canvas.width = 1080);
  const H = (canvas.height = 1080);

  // Background: the app's dark glass look, painted, not imported.
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, '#1b1230');
  gradient.addColorStop(1, '#0e0a1c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Accent ring — the same purple the app uses as its primary.
  ctx.strokeStyle = '#8b6fe8';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(W / 2, 300, 130, 0, Math.PI * 2);
  ctx.stroke();

  // The cat paw mark stands in for the mascot inside the ring (no bitmap load,
  // no dependency): a simple filled circle + three toes.
  ctx.fillStyle = '#8b6fe8';
  ctx.beginPath();
  ctx.arc(W / 2, 320, 62, 0, Math.PI * 2);
  ctx.fill();
  for (const dx of [-64, 0, 64]) {
    ctx.beginPath();
    ctx.arc(W / 2 + dx, 218, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4f1fb';

  // First name only — the caller guarantees this is not a full name.
  if (data.firstName) {
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillText(data.firstName, W / 2, 560);
  }

  ctx.font = '48px system-ui, sans-serif';
  ctx.fillStyle = '#cfc6ea';
  ctx.fillText(`أكمل محاكاة «${data.scenarioTitle}»`, W / 2, 650);

  // Numbers the session computed — nothing else.
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(data.sentencesSpoken), W / 2 - 160, 810);
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.fillText(String(data.independentSentences), W / 2 + 160, 810);

  ctx.font = '34px system-ui, sans-serif';
  ctx.fillStyle = '#cfc6ea';
  ctx.fillText('جملة أُنتجت', W / 2 - 160, 870);
  ctx.fillText('بلا تلميح', W / 2 + 160, 870);

  // The notice, on the image itself.
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillStyle = '#8b6fe8';
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
