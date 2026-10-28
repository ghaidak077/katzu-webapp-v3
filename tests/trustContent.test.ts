import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS } from '../src/lib/analytics/events';
import {
  ACTIVATION_HOURS,
  REFUND_DAYS,
  REFUND_PLAN_IDS,
  PLAN_BY_ID,
} from '../src/lib/offers/foundingPlans';
import {
  OWNER_FILL,
  SUPPORT_ADDRESS_AR,
  TRUST_CONTENT,
  outstandingOwnerFields,
  type TrustPage,
} from '../src/lib/trust/content';

/**
 * The legal text, pinned.
 *
 * Three pages, one source: `/help#privacy`, `/help#terms`, `/help#refund` are
 * rendered inline from this module, and the app links to the same anchors. The
 * sentences that must not be wrong are the ones about what leaves the device and
 * what the refund promise is — so those are checked against the same constants
 * the pricing config and the plan table use, not against typed Arabic.
 */

const PAGES: TrustPage[] = ['privacy', 'terms', 'refund'];

const body = (page: TrustPage) => TRUST_CONTENT[page].sections.map((s) => s.bodyAr).join('\n');
const section = (page: TrustPage, id: string) =>
  TRUST_CONTENT[page].sections.find((s) => s.id === id);

describe('the legal pages', () => {
  it('cover every anchor the help page publishes', () => {
    for (const page of PAGES) {
      expect(TRUST_CONTENT[page]).toBeTruthy();
      expect(TRUST_CONTENT[page].sections.length).toBeGreaterThan(0);
      expect(TRUST_CONTENT[page].titleAr).toMatch(/[؀-ۿ]/);
      expect(TRUST_CONTENT[page].updatedAr).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it('are complete: no owner placeholder is printed anywhere', () => {
    expect(outstandingOwnerFields()).toEqual([]);
    expect(JSON.stringify(TRUST_CONTENT)).not.toContain(OWNER_FILL);
  });

  it('answer privacy by category, not by event name', () => {
    for (const id of ['device', 'server', 'ai', 'analytics', 'rights']) {
      expect(section('privacy', id), `privacy#${id}`).toBeTruthy();
    }
    const all = body('privacy');
    // One sentence per category: where the data lives, not which handler fired.
    expect(all).toMatch(/IndexedDB/);
    expect(all).toMatch(/الذكاء الاصطناعي/);
    for (const name of ANALYTICS_EVENTS) expect(all).not.toContain(name);
  });

  it('states both rights the GDPR and the app actually offer', () => {
    const privacy = body('privacy');
    expect(privacy).toMatch(/تصدير/);
    expect(privacy).toMatch(/حذف/);
  });

  it('never promises an official certificate, which the product cannot give', () => {
    const all = JSON.stringify(TRUST_CONTENT);
    expect(all).not.toMatch(/يمنح(ك|كَ)? (شهادة|درجة) رسمية/);
    expect(all).toMatch(/لا تمنح أي شهادة أو درجة رسمية معتمدة/);
  });

  it('never claims unlimited AI, which the fair-use cap contradicts', () => {
    const all = JSON.stringify(TRUST_CONTENT);
    for (const banned of ['غير محدود', 'غير محدودة']) {
      expect(all, banned).not.toContain(banned);
    }
    expect(section('terms', 'fairuse')!.bodyAr).toMatch(/نوضّح أي حد قبل أن تصل إليه/);
  });

  it('builds the refund promise from the same numbers as the pricelist', () => {
    const refund = body('refund');
    expect(refund).toContain(String(REFUND_DAYS));
    expect(refund).toContain(String(ACTIVATION_HOURS));
    expect(refund).toContain(SUPPORT_ADDRESS_AR);
    for (const id of REFUND_PLAN_IDS) {
      expect(refund, `refund must name ${id}`).toContain(PLAN_BY_ID[id].nameAr);
    }
    // The one plan with no refund is named, so the limit is not a surprise.
    expect(refund).toContain(PLAN_BY_ID.monthly.nameAr);
  });

  it('says one activation code carries the duration of the plan bought', () => {
    expect(section('terms', 'codes')!.bodyAr).toMatch(/يضيف مدة الباقة/);
  });
});

describe('the strict launch check', () => {
  const run = (env: Record<string, string>) => {
    try {
      const out = execFileSync(process.execPath, ['scripts/check-launch.mjs'], {
        env: { ...process.env, ...env },
        encoding: 'utf8',
      });
      return { code: 0, out };
    } catch (error: any) {
      return { code: error.status ?? 1, out: String(error.stdout ?? '') };
    }
  };

  it('reports without failing by default', () => {
    const result = run({ LAUNCH_STRICT: '0' });
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/outstanding \{\{OWNER_FILL\}\} fields: 0/);
  });

  it('proves its own gate: the strict run fails exactly while a blocker is open', () => {
    // What the gate promises — "exit 1 iff something is still open" — is what is
    // tested, so it stays true whether or not the owner has filled the fields.
    const result = run({ LAUNCH_VERIFY: '1' });
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/gate verified/);
  });
});
