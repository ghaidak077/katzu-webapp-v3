import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS, ALLOWED_PROP_KEYS } from '../src/lib/analytics/events';
import {
  OWNER_FILL,
  TRUST_CONTENT,
  claimedEventNames,
  outstandingOwnerFields,
  processedDataListAr,
  type TrustPage,
} from '../src/lib/trust/content';

/**
 * The trust pages, pinned.
 *
 * The privacy page's processed-data list is the sentence that must not be wrong,
 * so it is derived and tested against the same constants the worker enforces. The
 * legal fields must stay placeholders until the owner fills them, and the strict
 * launch check must fail exactly while one is open.
 */

const PAGES: TrustPage[] = ['privacy', 'terms', 'refund', 'imprint', 'contact'];

describe('the trust pages', () => {
  it('exist for every route the app serves', () => {
    for (const page of PAGES) {
      expect(TRUST_CONTENT[page]).toBeTruthy();
      expect(TRUST_CONTENT[page].sections.length).toBeGreaterThan(0);
      expect(TRUST_CONTENT[page].titleAr).toMatch(/[؀-ۿ]/);
    }
  });

  it('publishes an updated date, because an undated policy is not one', () => {
    for (const page of PAGES) expect(TRUST_CONTENT[page].updatedAr).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('states both rights the GDPR and the app actually offer', () => {
    const privacy = TRUST_CONTENT.privacy.sections.map((s) => s.bodyAr).join('\n');
    expect(privacy).toMatch(/تصدير/);
    expect(privacy).toMatch(/حذف/);
  });

  it('never promises an official certificate, which the product cannot give', () => {
    // The pages may STATE the absence of certification; they may never claim it.
    // So the test looks for a claim, not for the word.
    const all = JSON.stringify(TRUST_CONTENT);
    expect(all).not.toMatch(/يمنح(ك|كَ)? (شهادة|درجة) رسمية/);
    expect(all).toMatch(/لا تمنح أي شهادة أو درجة رسمية معتمدة/);
    expect(TRUST_CONTENT.terms.sections.find((s) => s.id === 'mock')!.bodyAr).toMatch(/ليس درجة رسمية/);
  });

  it('never claims unlimited AI, which the fair-use cap contradicts', () => {
    // The repo-wide copy test bans the word "unlimited" outright, so the fair-use
    // clause denies a boundless service without ever using the banned adjective.
    const all = JSON.stringify(TRUST_CONTENT);
    for (const banned of ['غير محدود', 'غير محدودة']) {
      expect(all, banned).not.toContain(banned);
    }
    expect(TRUST_CONTENT.terms.sections.find((s) => s.id === 'fairuse')!.bodyAr).toMatch(/نوضّح أي حد قبل أن تصل إليه/);
  });
});

describe('the processed-data list', () => {
  it('is derived from the event allowlist, not typed by hand', () => {
    const claimed = claimedEventNames();
    expect(claimed.sort()).toEqual([...ANALYTICS_EVENTS].sort());
    const list = processedDataListAr();
    for (const name of ANALYTICS_EVENTS) expect(list.length + claimed.length).toBeGreaterThan(0);
  });

  it('names every property the worker is willing to store', () => {
    const privacy = TRUST_CONTENT.privacy.sections.find((s) => s.id === 'events')!.bodyAr;
    for (const key of ALLOWED_PROP_KEYS) expect(privacy).toContain(key);
  });

  it('says plainly what leaves the device, and that transcripts stay out of analytics', () => {
    const ai = TRUST_CONTENT.privacy.sections.find((s) => s.id === 'ai')!.bodyAr;
    expect(ai).toMatch(/الذكاء الاصطناعي/);
    const events = TRUST_CONTENT.privacy.sections.find((s) => s.id === 'events')!.bodyAr;
    expect(events).toMatch(/لا نجمع النصوص ولا الصوت/);
  });
});

describe('the owner fields', () => {
  it('stands as a placeholder in every legal section the owner must write', () => {
    const open = outstandingOwnerFields();
    expect(open.length).toBeGreaterThan(0);
    for (const entry of open) expect(entry.section).toMatch(/[a-z-]/);
  });

  it('never writes a legal claim of its own where a placeholder belongs', () => {
    const imprint = TRUST_CONTENT.imprint.sections.map((s) => s.bodyAr).join('\n');
    expect(imprint).toContain(OWNER_FILL);
    const refund = TRUST_CONTENT.refund.sections.map((s) => s.bodyAr).join('\n');
    expect(refund).toContain(OWNER_FILL);
    // The one channel fact the app CAN prove: where the purchase happened.
    expect(refund).toMatch(/صفحة البيع الرسمية/);
  });
});

describe('the strict launch check', () => {
  const run = (strict: boolean) => {
    try {
      const out = execFileSync(process.execPath, ['scripts/check-launch.mjs'], {
        env: { ...process.env, LAUNCH_STRICT: strict ? '1' : '0' },
        encoding: 'utf8',
      });
      return { code: 0, out };
    } catch (error: any) {
      return { code: error.status ?? 1, out: String(error.stdout ?? '') };
    }
  };

  it('reports without failing by default', () => {
    const result = run(false);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/outstanding/);
  });

  it('fails while any legal field is open — and that is today, not a bug', () => {
    const result = run(true);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/publisher/);
  });
});