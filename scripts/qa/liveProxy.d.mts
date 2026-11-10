/**
 * Types for `liveProxy.mjs`, used only by `e2e/chatQaLive.spec.ts`.
 *
 * The proxy is plain ESM on purpose (it runs under `node scripts/qa/run.mjs`
 * conventions), so the browser suite declares the little it needs instead of
 * type-checking a Worker module through the app's tsconfig.
 */
export interface LiveProxyTurn {
  reply_de: string;
  reply_ar: string;
  understood_de?: string;
  fix_reason_ar?: string;
  hint_de?: string;
  objectives_done: string[];
  objectives_total: number;
  close: boolean;
  learnerText: string;
  ms: number;
}

export interface LiveProxyState {
  requests: number;
  failures: number;
  failNext: number;
  turns: LiveProxyTurn[];
  usd: () => number;
}

export interface LiveProxyResult {
  status: number;
  body: Record<string, unknown>;
  ms: number;
}

export interface LiveProxy {
  handle: (body: unknown) => Promise<LiveProxyResult>;
  state: LiveProxyState;
  provider: { ledger: Record<string, unknown> };
}

export function createLiveProxy(options: { key: string; maxUsd?: number; pacingMs?: number; pace429Ms?: number }): LiveProxy;
