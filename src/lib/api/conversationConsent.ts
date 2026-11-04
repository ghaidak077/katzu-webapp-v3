import { logNetwork } from '../utils/diagnostics';

/**
 * Conversation-review consent (`/consent/conversation`).
 *
 * WHY NOT IN workerClient: that file sits at its size budget (`tests/codeBudgets.test.ts`),
 * and this is a two-endpoint concern with no transport of its own — it borrows the
 * client's base URL and session token through the small interface below.
 */
type ConsentClient = {
  getBaseUrl(): string;
  getEffectiveAuthToken(explicitToken?: string): Promise<string>;
};

const CONSENT_TIMEOUT_MS = 15000;

export const CONSENT_REPORT_PATH = '/consent/conversation/report';

async function consentFetch(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), CONSENT_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: 'Bearer ' + token },
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/** The Settings toggle's state: `available` is the operator's master switch,
 * `granted` is this account's own opt-in. Null on network/auth failure, so the
 * UI can stay neutral rather than showing a consent the server never had. */
export async function getConversationConsent(
  client: ConsentClient,
  idToken?: string,
): Promise<{ available: boolean; granted: boolean } | null> {
  const baseUrl = client.getBaseUrl();
  if (!baseUrl) return null;
  const token = await client.getEffectiveAuthToken(idToken);
  if (!token) return null;
  try {
    const res = await consentFetch(baseUrl, token, '/consent/conversation', { method: 'GET' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.ok !== true) return null;
    return { available: data.available === true, granted: data.granted === true };
  } catch (e) {
    logNetwork('consent/get', `Consent status failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Opt in or out of conversation review. Withdrawal deletes the turns already
 * stored for this account, so the UI only reports success when the server
 * confirms it — an opt-out that silently failed would leave the text behind. */
export async function setConversationConsent(
  client: ConsentClient,
  granted: boolean,
  idToken?: string,
): Promise<{ ok: boolean; granted: boolean; deletedTurns?: number; error?: string }> {
  const token = await client.getEffectiveAuthToken(idToken);
  if (!token) return { ok: false, granted: !granted, error: 'unauthenticated' };
  try {
    const res = await consentFetch(client.getBaseUrl(), token, '/consent/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ granted }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok === true) {
      return {
        ok: true,
        granted: data.granted === true,
        deletedTurns: typeof data.deleted_turns === 'number' ? data.deleted_turns : undefined,
      };
    }
    return { ok: false, granted: !granted, error: typeof data?.error === 'string' ? data.error : 'failed' };
  } catch (e) {
    logNetwork('consent/set', `Consent write failed: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, granted: !granted, error: 'network' };
  }
}

/**
 * Report one bad reply.
 *
 * This is deliberately its own consent decision, not a use of the global
 * conversation-review grant: the learner tapped "report this reply" while
 * looking at it, so exactly this exchange may be stored even when the Settings
 * toggle is off. The server redacts it with the same 90-day retention; the
 * client never sends a user id, and never sends more than the two strings the
 * learner was looking at.
 */
export interface ReportExchangeInput {
  learnerText: string;
  replyText: string;
  scenarioId?: string;
  cefrLevel?: string;
  turnIndex?: number;
}

export async function reportConversationExchange(
  client: ConsentClient,
  exchange: ReportExchangeInput,
  idToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await client.getEffectiveAuthToken(idToken);
  if (!token) return { ok: false, error: 'unauthenticated' };
  const baseUrl = client.getBaseUrl();
  if (!baseUrl) return { ok: false, error: 'network' };
  try {
    const res = await consentFetch(baseUrl, token, CONSENT_REPORT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        learner_text: exchange.learnerText,
        reply_text: exchange.replyText,
        scenario_id: exchange.scenarioId,
        cefr_level: exchange.cefrLevel,
        turn_index: exchange.turnIndex,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok === true) return { ok: true };
    return { ok: false, error: typeof data?.error === 'string' ? data.error : 'failed' };
  } catch (e) {
    logNetwork('consent/report', `Reply report failed: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, error: 'network' };
  }
}
