/**
 * The real-model `/ai/turn` handler for the live UI suite.
 *
 * `e2e/chatQaLive.spec.ts` routes the app's `/ai/turn` request into this module
 * instead of the canned mock. Everything else about the request is real: the
 * browser sends the payload the app builds, and this runs the Worker's own
 * `runRoleplayTurn` — same prompt, same parser, same shaper, same reply checks —
 * against the same model the Worker uses. So a UI green means the screen can
 * render what the production model actually returns, not what a fixture hopes.
 *
 * It is test tooling only: no route in the app or the Worker imports it, and it
 * is never reachable from a deployment (`scripts/qa/` is not bundled).
 */
import { planForScenario } from '../../cloudflare-roleplay-plans.js';
import { runRoleplayTurn } from '../../cloudflare-roleplay.js';
import { createProvider } from './provider.mjs';

/**
 * @param {{ key: string, maxUsd?: number, pacingMs?: number, pace429Ms?: number }} options
 */
export function createLiveProxy({ key, maxUsd = 2, pacingMs = 0, pace429Ms = 4_000 } = {}) {
  const provider = createProvider({ key, maxUsd, pacingMs, pace429Ms });
  const state = {
    /** /ai/turn requests seen, successful or not. */
    requests: 0,
    /** Turns that produced no usable reply (the 502 path). */
    failures: 0,
    /** Fail the next N requests on purpose (the offline/retry scenario). */
    failNext: 0,
    /** Every shaped turn plus its wall-clock latency, in order. */
    turns: [],
    /** Total spend estimated with the router's own pricing. */
    usd: () => provider.ledger.usd,
  };

  /**
   * @param {any} body the parsed request body the app posted
   * @returns {Promise<{ status: number, body: any, ms: number }>}
   */
  async function handle(body) {
    state.requests += 1;
    if (state.failNext > 0) {
      state.failNext -= 1;
      state.failures += 1;
      return {
        status: 500,
        body: { error: 'injected_failure', code: 'INJECTED_FAILURE', message: 'تعذر الاتصال. جملتك محفوظة.' },
        ms: 0,
      };
    }
    const plan = planForScenario(String(body?.scenario_id || ''));
    if (!plan) {
      return { status: 400, body: { error: 'unknown_scenario', code: 'UNKNOWN_SCENARIO' }, ms: 0 };
    }
    const history = Array.isArray(body?.history)
      ? body.history
          .filter((entry) => entry && typeof entry.text === 'string' && entry.text.trim())
          .map((entry) => ({ role: entry.role === 'user' ? 'user' : 'model', text: entry.text }))
      : [];
    const started = Date.now();
    const outcome = await runRoleplayTurn({
      env: {},
      plan,
      level: String(body?.cefr_level || plan.level || 'A1'),
      learnerText: String(body?.user_message || ''),
      history,
      objectivesDone: Array.isArray(body?.objectives_done) ? body.objectives_done : [],
      callAiRouter: provider.actorRouter,
    });
    const ms = Date.now() - started;
    if (!outcome.ok) {
      state.failures += 1;
      return {
        status: 502,
        body: {
          error: 'ai_empty_reply',
          code: 'AI_EMPTY_REPLY',
          message: 'تعذر توليد رد واضح. جملتك محفوظة — أعد المحاولة.',
        },
        ms,
      };
    }
    state.turns.push({ ...outcome.turn, learnerText: String(body?.user_message || ''), ms });
    return { status: 200, body: { ...outcome.turn, provider: 'groq' }, ms };
  }

  return { handle, state, provider };
}
