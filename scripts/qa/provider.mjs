/**
 * PROVIDER + COST LEDGER for the QA harness.
 *
 * The actor call goes through the same `callProvider` the worker uses, with the
 * same Gemini-shaped payload and the same OpenAI conversion as `eval:chat`, so a
 * green run means this model + this prompt + this parser agree.
 *
 * Money: every call is priced with the router's own `estimateTurnCostUsd`.
 * `QA_MAX_USD` (default 5) is enforced before the call, and the run aborts the
 * moment the ledger crosses it instead of spending silently.
 *
 * Key: `GROQ_API_KEY`, or `--from-kv` to read the production pool entry without
 * ever printing it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { callProvider, estimateTurnCostUsd } from '../../cloudflare-ai-router.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ACTOR_MODEL = process.env.ROLEPLAY_MODEL || 'openai/gpt-oss-120b';
/** Different model family from the actor, same provider — the judge must not
 * grade its own family's habits. (llama-3.3 is not served on this account;
 * qwen is, and is a genuinely different family.) */
export const JUDGE_MODEL = process.env.QA_JUDGE_MODEL || 'qwen/qwen3.8-27b';

const GROQ = 'https://api.groq.com/openai/v1';

function entryFor(model) {
  return { provider: 'groq', model, format: 'openai', baseUrl: GROQ, tier: 'flagship' };
}

/** Gemini-shaped payload → OpenAI chat messages, exactly as the worker does it. */
export function toOpenAiMessages(payload) {
  const messages = [];
  const sys = payload?.systemInstruction?.parts?.map((part) => part?.text || '').join('');
  if (sys) messages.push({ role: 'system', content: sys });
  for (const item of payload?.contents || []) {
    const content = (item?.parts || []).map((part) => part?.text || '').join('');
    if (content) messages.push({ role: item.role === 'model' ? 'assistant' : 'user', content });
  }
  return messages;
}

const estimateTokens = (value) => Math.ceil(String(value ?? '').length / 4);

/** Read the first enabled groq key from the production KV pool. Never printed. */
export function loadKeyFromKv() {
  const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
  const block = toml
    .split(/^\[\[/m)
    .find((part) => /kv_namespaces/.test(part.split('\n')[0]) && /binding\s*=\s*"USER_PROGRESS"/.test(part));
  const namespaceId = (block && block.match(/\bid\s*=\s*"([^"]+)"/) || [])[1] || '';
  if (!namespaceId) throw new Error('could not find the USER_PROGRESS namespace id');
  const res = spawnSync(
    'npx',
    ['wrangler', 'kv', 'key', 'get', 'ai-provider-config', '--namespace-id', namespaceId, '--remote'],
    { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (res.status !== 0) throw new Error(`wrangler kv read failed (${res.status}) — no key printed on purpose`);
  const config = JSON.parse(res.stdout);
  const entry = (config.custom || []).find(
    (candidate) => candidate && candidate.enabled && candidate.provider === 'groq' && Array.isArray(candidate.keys) && candidate.keys[0],
  );
  if (!entry) throw new Error('the production pool has no enabled groq key');
  return { key: entry.keys[0], model: entry.model || ACTOR_MODEL, source: 'production KV pool' };
}

export function loadKey({ fromKv = false } = {}) {
  if (process.env.GROQ_API_KEY) return { key: process.env.GROQ_API_KEY, model: ACTOR_MODEL, source: 'GROQ_API_KEY' };
  if (fromKv) return loadKeyFromKv();
  return { key: '', model: ACTOR_MODEL, source: 'none' };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createProvider({ key, maxUsd = 5, pace429Ms = 65_000, pacingMs = 0, log = () => {} } = {}) {
  const ledger = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    usd: 0,
    retries429: 0,
    byModel: {},
  };

  function record(model, inputTokens, outputTokens) {
    const usd = estimateTurnCostUsd({ tier: 'flagship', inputTokens, outputTokens });
    ledger.calls += 1;
    ledger.inputTokens += inputTokens;
    ledger.outputTokens += outputTokens;
    ledger.usd += usd;
    const row = ledger.byModel[model] || { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
    row.calls += 1;
    row.inputTokens += inputTokens;
    row.outputTokens += outputTokens;
    row.usd += usd;
    ledger.byModel[model] = row;
    return usd;
  }

  function budgetLeft() {
    return Math.max(0, maxUsd - ledger.usd);
  }

  function guard() {
    if (ledger.usd >= maxUsd) {
      const error = new Error(`qa_budget_exceeded: $${ledger.usd.toFixed(4)} >= QA_MAX_USD $${maxUsd}`);
      error.code = 'QA_BUDGET';
      throw error;
    }
  }

  async function callWithRateLimit(entry, payload, extra = {}) {
    guard();
    if (pacingMs > 0) await sleep(pacingMs);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await callProvider(entry, payload, key, { toMessages: toOpenAiMessages, ...extra });
      } catch (error) {
        const text = String(error?.message || error);
        // A daily token wall (TPD) does not clear in 65 seconds. Retrying it three
        // times burns ~4 minutes per turn and still fails the session, which then
        // looks like product evidence when it is only quota. Stop the whole run.
        if (/tokens per day|\bTPD\b/i.test(text)) {
          const quota = new Error(`qa_daily_quota: ${text.slice(0, 240)}`);
          quota.code = 'QA_DAILY_QUOTA';
          throw quota;
        }
        const rateLimited = /429|rate.?limit|too many requests|tokens per minute/i.test(text);
        if (!rateLimited || attempt === 2) throw error;
        ledger.retries429 += 1;
        log(`429 from ${entry.model}; waiting ${Math.round(pace429Ms / 1000)}s`);
        await sleep(pace429Ms);
      }
    }
    throw new Error('unreachable');
  }

  /** The `callAiRouter` seam `runRoleplayTurn` expects. */
  async function actorRouter(payload) {
    const entry = entryFor(ACTOR_MODEL);
    const promptText = toOpenAiMessages(payload).map((message) => message.content).join('\n');
    const raw = await callWithRateLimit(entry, payload, { timeoutMs: 15_000 });
    record(entry.model, estimateTokens(promptText), estimateTokens(raw));
    return raw;
  }

  /** One plain JSON completion (the judge). */
  async function completeJson({ model = JUDGE_MODEL, system, user, maxTokens = 1200, temperature = 0.1 }) {
    const entry = entryFor(model);
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: maxTokens },
    };
    const raw = await callWithRateLimit(entry, payload, { timeoutMs: 30_000 });
    record(entry.model, estimateTokens(system) + estimateTokens(user), estimateTokens(raw));
    return raw;
  }

  /** One plain text completion (the optional model learner). */
  async function completeText({ model = ACTOR_MODEL, system, user, maxTokens = 120, temperature = 0.7 }) {
    const entry = entryFor(model);
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
    const raw = await callWithRateLimit(entry, payload, { timeoutMs: 20_000 });
    record(entry.model, estimateTokens(system) + estimateTokens(user), estimateTokens(raw));
    return String(raw || '').trim().replace(/^["']|["']$/g, '');
  }

  return { actorRouter, completeJson, completeText, ledger, budgetLeft };
}
