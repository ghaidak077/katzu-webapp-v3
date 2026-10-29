import { track } from './client';

/**
 * Which AI assistant opened the app — the app half of the same question.
 *
 * The marketing site counts a reader who arrives at a guide from a chat answer
 * (`scripts/site-referrer.mjs`); this counts the reader who arrives at the app
 * itself. Both speak the existing `landing_viewed` event with its existing
 * allowlisted `source` property, so nothing new is collected and the worker's
 * contract is unchanged.
 *
 * Only the hostname is read, only to match it against a fixed list, and only the
 * word `chatgpt` / `perplexity` / `gemini` / `copilot` / `claude` is ever sent. An
 * unmatched referrer is not stored — a link from a private forum, a mail client
 * or an internal page must not become a data point.
 *
 * No storage is involved: `document.referrer` is the browser's own value for this
 * navigation. A reload or an in-app navigation reads as absent and no event is
 * sent, which is the honest count of "arrived from an assistant".
 *
 * Kept in lockstep with `AI_REFERRERS` by `tests/aiReferrers.test.ts`.
 */
export const AI_REFERRERS: ReadonlyArray<{ source: string; hosts: readonly string[] }> = [
  { source: 'chatgpt', hosts: ['chatgpt.com', 'chat.openai.com'] },
  { source: 'perplexity', hosts: ['perplexity.ai'] },
  { source: 'gemini', hosts: ['gemini.google.com'] },
  { source: 'copilot', hosts: ['copilot.microsoft.com'] },
  { source: 'claude', hosts: ['claude.ai'] },
];

/**
 * The assistant behind a referrer, or null. Equality or a dot boundary only: a
 * lookalike (`notchatgpt.com`, `chatgpt.com.evil.test`) must not match.
 */
export function aiReferrerSource(referrer: string): string | null {
  let host = '';
  try {
    host = new URL(String(referrer || '')).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!host) return null;
  for (const { source, hosts } of AI_REFERRERS) {
    for (const candidate of hosts) {
      if (host === candidate || host.endsWith(`.${candidate}`)) return source;
    }
  }
  return null;
}

/**
 * Fires once at boot, and only when the app was opened from an assistant.
 * Called from `main.tsx` after the analytics lifecycle is installed.
 */
export function trackAiReferralLanding(): void {
  if (typeof document === 'undefined') return;
  const source = aiReferrerSource(document.referrer);
  if (!source) return;
  track('landing_viewed', { source });
}
