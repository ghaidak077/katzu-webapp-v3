#!/usr/bin/env node
/**
 * Coarena Model API smoke — one round trip, one feedback, no key material printed.
 *
 * WHY THIS EXISTS
 * Coarena is an OpenAI-compatible gateway (owner request, 2026-11-17). The
 * worker calls it through the normal router once `COARENA_API_KEYS` is set, but
 * a failed turn there is a 503 the learner sees, not a diagnosis. This script
 * is the operator's pre-flight: it asks the same endpoint the pool will, names
 * the model the pool names, and proves the key can answer before a deploy.
 *
 * USAGE
 *   COARENA_API_KEY=... node scripts/coarena-smoke.mjs
 *   node scripts/coarena-smoke.mjs --model gemini-3-8-flash
 *
 * Reads the key from COARENA_API_KEY (or the worker's list form
 * COARENA_API_KEYS, first entry) from the process environment only. It is never
 * printed, logged, or written. The feedback call rates the reply it just got,
 * which is the documented `{"request_id": "…", "rating": "up"}` shape.
 *
 * Free-tier note: only GPT-6 Luna, Gemini 3.8 Flash and DeepSeek V4.1 Flash
 * answer without credits; any other id is a 402 by design. The exit status is
 * non-zero on any failure so it can gate a run.
 */

const BASE = 'https://coarena.ai/api/v1';
const DEFAULT_MODEL = 'gemini-3-8-flash';

function readKey() {
  const raw = process.env.COARENA_API_KEY || process.env.COARENA_API_KEYS || '';
  const key = String(raw).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)[0] || '';
  return key;
}

function parseModel(argv) {
  const at = argv.indexOf('--model');
  const value = at !== -1 ? argv[at + 1] : process.env.COARENA_MODEL;
  return String(value || DEFAULT_MODEL).trim();
}

async function jsonCall(path, key, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep the raw text */ }
  return { status: res.status, ok: res.ok, data, text };
}

async function main() {
  const key = readKey();
  if (!key) {
    console.error('COARENA_API_KEY (or COARENA_API_KEYS) is not set.');
    process.exit(2);
  }
  const model = parseModel(process.argv.slice(2));

  const models = await jsonCall('/models', key);
  if (!models.ok) {
    console.error(`models: HTTP ${models.status} ${models.text.slice(0, 200)}`);
    process.exit(1);
  }
  const ids = Array.isArray(models.data?.data) ? models.data.data.map((m) => m?.id).filter(Boolean) : [];
  console.log(`models: ${ids.length} available, ${ids.includes(model) ? `${model} listed` : `${model} NOT listed`}`);

  const started = Date.now();
  const chat = await jsonCall('/chat/completions', key, {
    method: 'POST',
    body: {
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      // Gemini 3.8 Flash returns an EMPTY completion at 16 tokens (measured
      // 2026-11-18) while answering in ~1.7 s at 200; the router's own floor is
      // ~700, so this smoke must not test a budget production never uses.
      max_tokens: 200,
      temperature: 0,
    },
  });
  if (!chat.ok) {
    console.error(`chat: HTTP ${chat.status} ${chat.text.slice(0, 300)}`);
    process.exit(1);
  }
  const reply = chat.data?.choices?.[0]?.message?.content ?? '';
  const requestId = chat.data?.id || '';
  console.log(`chat: ${Date.now() - started} ms, model=${chat.data?.model || model}, reply=${JSON.stringify(reply.slice(0, 60))}`);

  // Rating is part of the documented flow, not an optional extra: it is how the
  // gateway learns which replies were useful. A feedback failure does not fail
  // the smoke (the chat already proved the key), it is reported.
  if (!requestId) {
    console.log('feedback: skipped (no request id in the reply)');
    return;
  }
  const fb = await jsonCall('/feedback', key, {
    method: 'POST',
    body: { request_id: requestId, rating: 'up' },
  });
  console.log(`feedback: HTTP ${fb.status}${fb.ok ? ` rating=${fb.data?.rating ?? 'saved'}` : ` ${fb.text.slice(0, 200)}`}`);
}

main().catch((err) => {
  console.error(`coarena smoke failed: ${err?.message || err}`);
  process.exit(1);
});
