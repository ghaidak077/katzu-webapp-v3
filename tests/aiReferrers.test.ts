import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_REFERRERS, aiReferrerScript } from '../scripts/site-referrer.mjs';
import { WORKER } from '../scripts/site-pricing.mjs';
import { AI_REFERRERS as APP_REFERRERS, aiReferrerSource } from '../src/lib/analytics/referrer';

/**
 * The AI-referrer table exists twice on purpose: the site is a static build with
 * no TypeScript, the app is a bundle with no build-time .mjs import. Two copies
 * of a rule drift, so this test pins them — the same arrangement that pins the
 * worker's analytics allowlist to its client twin.
 */

const EXPECTED = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'claude'];

describe('the AI referrer table', () => {
  it('is the same list on the site and in the app', () => {
    expect([...AI_REFERRERS].map((entry) => entry.source).sort()).toEqual([...EXPECTED].sort());
    expect(APP_REFERRERS).toEqual(AI_REFERRERS);
  });

  it('matches the five assistants, with and without a subdomain or www', () => {
    expect(aiReferrerSource('https://chatgpt.com/')).toBe('chatgpt');
    expect(aiReferrerSource('https://www.chatgpt.com/c/abc')).toBe('chatgpt');
    expect(aiReferrerSource('https://chat.openai.com/')).toBe('chatgpt');
    expect(aiReferrerSource('https://www.perplexity.ai/search?q=katzu')).toBe('perplexity');
    expect(aiReferrerSource('https://gemini.google.com/app')).toBe('gemini');
    expect(aiReferrerSource('https://copilot.microsoft.com/chats/x')).toBe('copilot');
    expect(aiReferrerSource('https://claude.ai/chat/x')).toBe('claude');
  });

  it('never matches a lookalike host or a non-referrer', () => {
    expect(aiReferrerSource('')).toBeNull();
    expect(aiReferrerSource('not a url')).toBeNull();
    expect(aiReferrerSource('https://notchatgpt.com/')).toBeNull();
    expect(aiReferrerSource('https://chatgpt.com.evil.test/')).toBeNull();
    expect(aiReferrerSource('https://website.katzuai.com/guides')).toBeNull();
    expect(aiReferrerSource('https://www.google.com/')).toBeNull();
  });
});

describe('the site script the build emits', () => {
  const script = aiReferrerScript('https://worker.example');

  it('carries the five hosts and the worker endpoint as data, not as prose', () => {
    for (const host of ['chatgpt.com', 'perplexity.ai', 'gemini.google.com', 'copilot.microsoft.com', 'claude.ai']) {
      expect(script).toContain(host);
    }
    expect(script).toContain('https://worker.example');
    expect(script).toContain('/analytics/events');
  });

  it('stores nothing on the device and sends only the source word', () => {
    expect(script).not.toContain('localStorage');
    expect(script).not.toContain('sessionStorage');
    expect(script).not.toContain('document.cookie');
    expect(script).toContain("props: { source: source }");
    // The event name and property key are ones the worker already accepts.
    expect(script).toContain('landing_viewed');
  });

  it('is served to every built page, beside the partner-link reader', () => {
    const home = readFileSync('website/index.html', 'utf8');
    expect(home).toContain('<script src="/assets/ai-ref.js" defer></script>');
    for (const page of ['website/guides.html', 'website/guides/a1-visa.html', 'website/help.html', 'website/404.html']) {
      expect(readFileSync(page, 'utf8'), page).toContain('/assets/ai-ref.js');
    }
    expect(readFileSync('website/assets/ai-ref.js', 'utf8')).toBe(aiReferrerScript(WORKER));
  });
});
