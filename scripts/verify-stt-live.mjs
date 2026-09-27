/**
 * Live verification for the speech pipeline (`POST /ai/transcribe`).
 *
 * WHAT IT PROVES, AND WHY IT NEEDS A BROWSER
 * The app records with the browser's own `MediaRecorder` and sends the recording
 * to the worker, so the thing that can break is not our code but the *audio
 * container Chrome produces* meeting the model's decoder. Neither side can be
 * checked from a shell: the bytes only exist once a browser has recorded them.
 *
 * So this script takes a real German recording (fetched from Wikimedia Commons),
 * plays it through a `MediaStreamAudioDestinationNode`, records THAT with
 * `MediaRecorder` using the same options the app uses (`audio/webm;codecs=opus`
 * at 16 kbps), and posts the result to the deployed worker. A PASS means the
 * learner's exact audio path ended in correct German text.
 *
 * It runs against the deployed app origin on purpose: the worker's CORS allowlist
 * is strict in production, so the request has to come from an allowed origin.
 *
 * Usage:
 *   node scripts/verify-stt-live.mjs <session-token>
 *
 * The token is an ordinary 30-day app session token (`sess_…`). Minting one for a
 * throwaway account is a KV write in the `USER_PROGRESS` namespace — use a short
 * TTL and delete it afterwards, which is what the docs' verification log did.
 */
import { chromium } from 'playwright';

const APP_ORIGIN = 'https://katzu-webapp-v3.pages.dev';
const WORKER = 'https://katzu-test.ghaidakalosh008.workers.dev';
const SAMPLE = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/De-Wie_geht_es_dir%3F.oga';
const EXPECTED = ['wie', 'geht', 'es', 'dir'];

const token = process.argv[2];
if (!token) {
  console.error('usage: node scripts/verify-stt-live.mjs <session-token>');
  process.exit(2);
}

const sample = Buffer.from(await (await fetch(SAMPLE)).arrayBuffer());
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage();
  await page.goto(APP_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Record the sample exactly the way the conversation screen records a learner:
  // same container, same bitrate, same MediaRecorder options.
  const recorded = await page.evaluate(async (bytes) => {
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(Uint8Array.from(bytes).buffer);
    const destination = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(destination);

    const recorder = new MediaRecorder(destination.stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 16000,
    });
    const chunks = [];
    recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));

    recorder.start();
    source.start();
    await new Promise((resolve) => setTimeout(resolve, decoded.duration * 1000 + 500));
    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: recorder.mimeType });
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
    return { mime: recorder.mimeType.split(';')[0], bytes: blob.size, base64 };
  }, Array.from(sample));

  console.log(`recorded ${recorded.mime} — ${recorded.bytes} bytes (${Math.round(recorded.base64.length / 1024)} KB base64)`);

  const started = Date.now();
  const response = await fetch(`${WORKER}/ai/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ audio: recorded.base64, mime: recorded.mime }),
  });
  const body = await response.json().catch(() => null);
  const elapsed = Date.now() - started;

  console.log(`HTTP ${response.status} in ${elapsed} ms`);
  console.log(JSON.stringify(body));

  const text = String(body?.text || '').toLowerCase();
  const pass = response.status === 200 && EXPECTED.every((word) => text.includes(word));
  console.log(pass ? 'PASS — the recording was transcribed' : 'FAIL — transcription did not match the sample');
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
