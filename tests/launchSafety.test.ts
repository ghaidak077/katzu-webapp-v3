import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AI_SERVICE_MESSAGE_AR,
  DAILY_SPEND_CAP_MESSAGE_AR,
  QUOTA_MESSAGE_AR,
  classifyTurnError,
} from '../src/lib/conversation/stateMachine';

/**
 * The two things on the first-user path that were silently wrong.
 *
 * Both are "the learner is told something untrue" defects, which is why they are
 * pinned here rather than left to a browser test: neither has a visual that a
 * screenshot would catch.
 */

describe('the daily spend cap reaches the learner', () => {
  it('shows the honest Arabic message the Worker already wrote', () => {
    const error = classifyTurnError({ code: 'DAILY_SPEND_CAP' });
    expect(error.messageAr).toBe(DAILY_SPEND_CAP_MESSAGE_AR);
    // Arabic, and about the service — the Worker sends exactly this sentence.
    expect(error.messageAr).toMatch(/[؀-ۿ]/);
  });

  it('does NOT blame the learner for an operator decision', () => {
    const { messageAr } = classifyTurnError({ code: 'DAILY_SPEND_CAP' });
    // The generic AI-service line reads as "your turn did not work", which
    // invites exactly the wrong action: trying again, into a closed door.
    expect(messageAr).not.toBe(AI_SERVICE_MESSAGE_AR);
    // And it must not claim their allowance is gone — the cap says nothing
    // about anybody's account.
    expect(messageAr).not.toBe(QUOTA_MESSAGE_AR);
    expect(messageAr).not.toMatch(/جلساتك|اشتراك|Pro/);
  })

  it('is retryable, because it lifts on its own', () => {
    // Not retryable would strand the learner on a dead screen with a sentence
    // they can see and cannot act on.
    expect(classifyTurnError({ code: 'DAILY_SPEND_CAP' }).retryable).toBe(true);
  });

  it('is not classified as a quota wall', () => {
    // The order of the checks matters: `/quota/i` on a raw message can otherwise
    // sweep this into the free-wall branch and tell them their three free
    // conversations ran out when nothing of the sort happened.
    expect(classifyTurnError({ code: 'DAILY_SPEND_CAP' }).kind).not.toBe('quota');
  });

  it('still classifies the real free wall as a quota wall', () => {
    // The guard against over-correcting the line above.
    expect(classifyTurnError({ code: 'FREE_QUOTA_EXHAUSTED' }).kind).toBe('quota');
    expect(classifyTurnError({ code: 'FREE_QUOTA_EXHAUSTED' }).retryable).toBe(false);
  });
});

describe('the spend cap is enforced above the free tier, not beside it', () => {
  const WORKER = readFileSync('cloudflare-unified-worker.js', 'utf8');

  it('is checked before the per-account entitlements', () => {
    // This is what makes a free learner's session count against the bill: the
    // cap runs on the way in, ahead of the trial ledger, so nothing reaches a
    // model without passing it.
    const gate = WORKER.slice(WORKER.indexOf('const spend = await checkDailySpendCap(env);') - 400);
    const capAt = gate.indexOf('checkDailySpendCap(env)');
    const ledgerAt = gate.search(/trial|checkEntitlement|freeSessions|quota/i);
    expect(capAt).toBeGreaterThan(-1);
    // The first entitlement-ish token after the cap call must come later.
    expect(ledgerAt === -1 || ledgerAt > capAt).toBe(true);
  });

  it('returns a message, not a bare status', () => {
    expect(WORKER).toMatch(/code: "DAILY_SPEND_CAP"[\s\S]{0,120}message: DAILY_SPEND_CAP_MESSAGE/);
  });

  it('treats an absent cap as unlimited and a zero cap as a full stop', () => {
    // The two settings the owner will actually reach for: one is "no limit",
    // the other is "stop now, without a deploy".
    expect(WORKER).toMatch(/raw === undefined \|\| raw === null \|\| String\(raw\)\.trim\(\) === ""\) return \{ allowed: true, cap: null \}/);
    expect(WORKER).toMatch(/if \(cap === 0\) return \{ allowed: false, cap, count: 0 \}/);
  });

  it('fails open on a broken database, so an accounting error cannot freeze learners', () => {
    expect(WORKER).toMatch(/D1 hiccup: never freeze learners on an accounting error/);
  });
});

describe('translation failure is visible and bounded', () => {
  const CLIENT = readFileSync('src/lib/api/workerClient.ts', 'utf8');

  it('retries a bounded number of times and then gives up', () => {
    // `translateTextReliable` exists precisely because the first call can leave
    // before the session token is in the store. Bounded is the point: an
    // unbounded retry is an unbounded bill and an endless spinner.
    expect(CLIENT).toMatch(/async translateTextReliable\(/);
    expect(CLIENT).toMatch(/for \(let attempt = 0; attempt <= delays\.length; attempt\+\+\)/);
    expect(CLIENT).toMatch(/return '';/);
  });

  it('has its own short timeout, not the 30s AI one', () => {
    expect(CLIENT).toMatch(/const TRANSLATE_TIMEOUT_MS = 12000;/);
  });

  it('ends in a state the UI can render as an honest message', () => {
    // Both callers set `translationState: 'unavailable'` rather than leaving a
    // blank bubble, so the learner sees Arabic and a way back.
    const live = readFileSync('src/features/conversation/useLiveConversation.ts', 'utf8');
    const story = readFileSync('src/features/journey/StorySetupScreen.tsx', 'utf8');
    expect(live).toMatch(/translationState: 'unavailable' as const/);
    expect(story).toMatch(/setTranslationState\('unavailable'\)/);
    // And the state is actually rendered, not just stored.
    const message = readFileSync('src/features/conversation/ConversationMessage.tsx', 'utf8');
    expect(message).toMatch(/translationState === 'unavailable'/);
  });
});

describe('the Trail placeholder line is gone', () => {
  const BANNER = readFileSync('src/components/glass/ScenarioBanner.tsx', 'utf8');

  it('shows no developer-facing note about missing artwork', () => {
    // The sentence told the learner a picture "will be added here" — addressed
    // to the developer, in the slot where their first impression is formed.
    expect(BANNER).not.toMatch(/ستُضاف هنا|ستضاف هنا/);
    expect(BANNER).not.toMatch(/صورة هذا الموقف/);
  });

  it('still renders the real scene lighting when there is no artwork', () => {
    // Removing the note must not remove the design: the procedural light is a
    // deliberate treatment, not a stand-in for a missing file.
    expect(BANNER).toMatch(/sceneBackdropLayers\(scene\)\.image/);
    expect(BANNER).toMatch(/scene\.artUrl \?/);
  });
});

describe('the reading skill is honest and has no dead tap target', () => {
  const LANDING = readFileSync('src/features/marketing/LandingScreen.tsx', 'utf8');

  it('labels an unfinished skill «قريباً» rather than shipping it', () => {
    expect(LANDING).toMatch(/'متاح الآن' : 'قريباً'/);
  });

  it('does not make the coming-soon card look tappable', () => {
    // The card is a `<div>`, not a `<button>`: a control that looks pressable
    // and does nothing is worse than an honest static label. The section that
    // follows it is a plain section for the same reason.
    const section = LANDING.slice(
      LANDING.indexOf('function SkillsSection'),
      LANDING.indexOf('</section>', LANDING.indexOf('function SkillsSection')),
    );
    const card = section.slice(section.indexOf('{SKILLS.map'));
    expect(card).toMatch(/<div key=\{label\}/);
    expect(card).not.toMatch(/<button/);
    expect(card).not.toMatch(/onClick/);
    expect(card).not.toMatch(/cursor-pointer/);
  });

  it('explains the coming-soon work instead of teasing it', () => {
    // «نُطلقها فقط عندما تكون جاهزة وقابلة للقياس» — the promise is a condition,
    // not a date, which is the only honest shape for this one.
    expect(LANDING).toMatch(/نُطلقها فقط عندما تكون جاهزة وقابلة للقياس/);
  });
});

describe('the operator cap is configured, and a free session counts against it', () => {
  const CONFIG = readFileSync('wrangler.toml', 'utf8');
  const WORKER = readFileSync('cloudflare-unified-worker.js', 'utf8');

  it('sets AI_DAILY_SPEND_CAP as a plain [vars] entry, at 292', () => {
    // A value the operator can read and change with one deploy: the ceiling is
    // worth reviewing, and worthless as a mystery. Any present value, including
    // 0, is enforced; absent means unlimited (pinned in the block above).
    expect(CONFIG).toMatch(/^\s*AI_DAILY_SPEND_CAP = "292"$/m);
    // Never a secret. The cap is a number to tune, and the repo forbids writing
    // secret values to git (`scripts/scan-secrets.mjs`).
    expect(CONFIG).not.toMatch(/AI_DAILY_SPEND_CAP[^\n]*secret/i);
  });

  it('counts every AI call in one global counter, the free tier included', () => {
    // The cap runs on the way into the AI routes BEFORE any trial-ledger read —
    // the ordering is pinned above — and the counter it rolls is a single id for
    // the whole service, so a free learner's conversation moves the same number a
    // Pro learner's does. That is the point: the bill is not a paid-users-only
    // bill, and "free" here means free to the learner, not free to run.
    expect(WORKER).toMatch(/counterId = "global-ai-spend"/);
    expect(WORKER).toMatch(/UPDATE rate_limit_counters SET count = count \+ 1 WHERE counter_id = \?/);
    // Incremented before the comparison, so the cap admits exactly `cap` calls
    // and blocks the next — an off-by-one would overspend by one call a day.
    const fn = WORKER.slice(WORKER.indexOf('async function checkDailySpendCap'));
    expect(fn.indexOf('count = count + 1')).toBeLessThan(fn.indexOf('count > cap'));
  });
});
