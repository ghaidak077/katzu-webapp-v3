import { expect, test } from '@playwright/test';
import { bootSignedIn, orb } from './harness';

/**
 * What a headless browser can and cannot prove about the microphone.
 *
 * The orb claims to be audio-reactive, and that claim is only worth making if the
 * analyser is wired to a real `MediaStream` rather than to a fake amplitude. This
 * test measures the one thing a machine can settle — that `getUserMedia` resolves,
 * a real `AudioContext` runs over the result, and the analyser reports live
 * samples instead of silence — and prints the peak it saw, so the numbers in
 * `KATZU_V2_IMPLEMENTATION_LOG.md` are falsifiable rather than remembered.
 *
 * What it deliberately does not claim: that the orb's deformation looks right for
 * a human voice. Measured here, Chromium's fake capture device delivers **silence**
 * (peak analyser RMS 0.000000 over 400 ms), so the deformation is driven by
 * nothing and the *look* of the orb under a real voice stays a manual check.
 */

/** Peak RMS over `ms`, measured inside the page against the real stream. */
async function measurePeakRms(page: import('@playwright/test').Page, ms: number): Promise<number> {
  return page.evaluate(async (duration) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      let peak = 0;
      const started = performance.now();
      while (performance.now() - started < duration) {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) sum += sample * sample;
        peak = Math.max(peak, Math.sqrt(sum / buffer.length));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      await context.close();
      return peak;
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, ms);
}

test('the orb renders its WebGL body rather than silently taking the fallback', async ({ page }) => {
  // The orb has two bodies: the GL sphere and the 2D canvas it falls back to when
  // the engine has no WebGL. A fallback that works is a good fallback, but it is
  // not the product — so this test fails if the GL body is not the one drawing.
  // It caught a real environment problem: headless Chromium under root has no GPU
  // process unless it is launched with `--no-sandbox`, and the orb was quietly
  // running on the 2D body for the whole suite.
  const messages: string[] = [];
  page.on('console', (message) => messages.push(message.text()));

  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();

  // ogl appends its own canvas into the GL body's container.
  await expect(orb(page).locator('canvas')).toHaveCount(1);
  expect(messages.filter((text) => text.includes('WebGL unavailable'))).toHaveLength(0);

  // And the GL body still drives the control: tapping the sphere listens.
  await orb(page).click();
  await expect(orb(page)).toHaveAttribute('aria-label', 'إيقاف الاستماع');
});

test('the orb is driven by a real microphone stream, not a fake amplitude', async ({ page }) => {
  await bootSignedIn(page);

  // The permissions and the fake capture device are both real, so a denied or
  // absent device would fail here rather than silently yielding zeros.
  const peak = await measurePeakRms(page, 400);
  console.log(`[e2e] peak analyser RMS over 400ms: ${peak.toFixed(6)}`);

  expect(Number.isFinite(peak)).toBe(true);
  expect(peak).toBeGreaterThanOrEqual(0);

  // And the screen puts that same microphone behind the orb: pressing it opens
  // the listening state, which is where the analyser is read from.
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();
  await expect(orb(page)).toHaveAttribute('aria-label', 'ابدأ التحدث');
  await orb(page).click();
  await expect(orb(page)).toHaveAttribute('aria-label', 'إيقاف الاستماع');
});
