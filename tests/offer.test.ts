import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';
import pricingConfig from '../pricing.config.json';
import {
  ACTIVATION_HOURS,
  BEST_VALUE_AR,
  CONTINUE_FREE_AR,
  CONTINUE_FREE_EN,
  FAIR_USE_AI_PER_DAY,
  FORBIDDEN_CLAIMS_AR,
  FOUNDING_CAP,
  FREE_LESSONS_PER_MONTH,
  PLANS,
  PRICING_FOOTNOTE_AR,
  PRICING_HEADLINE_AR,
  PRICING_HEADLINE_EN,
  PRICING_RULES_AR,
  PRICING_RULES_EN,
  RECOMMENDED_PLAN,
  REFUND_DAYS,
  REFUND_TEXT,
  SOFT_PROMPT_BODY_AR,
  SOFT_PROMPT_TITLE_AR,
  SOFT_PROMPT_TITLE_EN,
  formatUsd,
  foundingLabel,
  futureLabel,
  isOwnerFilled,
  perMonthLabel,
  priceLabel,
} from '../src/lib/offers/pricing';

/**
 * The offer, as a browser test.
 *
 * Four things must be true of a screen that asks for money: the price comes
 * from the server, the promises are ones the product keeps, the limit is stated
 * rather than discovered, and every rule the page states is the same rule the
 * ledger and checkout use.
 */

const request = (country?: string) =>
  new Request('https://worker.test/pricing', {
    headers: country ? { 'CF-IPCountry': country } : {},
  });

const catalogue = async (country?: string) =>
  (await (await worker.fetch(request(country), {} as never)).json()) as any;

describe('GET /pricing', () => {
  it('prices an anonymous visitor in the standard group', async () => {
    const body = await catalogue('DE');
    expect(body.group).toBe('standard');
    expect(body.prices).toHaveLength(4);
    expect(body.unproven).toBe(true);
  });

  it('serves the same four plans everywhere — region no longer moves the price', async () => {
    const standard = await catalogue('DE');
    const special = await catalogue('EG');
    expect(special.group).toBe('special');
    expect(special.prices).toEqual(standard.prices);
    expect(standard.prices.map((row: any) => row.product)).toEqual([
      'monthly',
      'quarterly',
      'halfyear',
      'yearly',
    ]);
  });

  it('serves founding and future cents from the config, not from a page', async () => {
    const body = await catalogue('SY');
    for (const plan of pricingConfig.plans) {
      const row = body.prices.find((r: any) => r.product === plan.id);
      expect(row.amountCents).toBe(Math.round(plan.foundingUsd * 100));
      expect(row.futureCents).toBe(Math.round(plan.futureUsd * 100));
    }
  });

  it('serves the rules the paywall and the site both print', async () => {
    const body = await catalogue('IQ');
    expect(body.foundingCap).toBe(FOUNDING_CAP);
    expect(body.foundingEndsOn).toBe(pricingConfig.foundingEndsOn);
    expect(body.refundDays).toBe(REFUND_DAYS);
    expect(body.refundPlanIds).toEqual(pricingConfig.refundPlanIds);
    expect(body.activationHours).toBe(ACTIVATION_HOURS);
    expect(body.freeLessonsPerMonth).toBe(FREE_LESSONS_PER_MONTH);
  });

  it('never leaks a secret or an unkeepable claim', async () => {
    const body = JSON.stringify(await catalogue('EG'));
    expect(body).not.toMatch(/HMAC|ADMIN_SECRET|api[_-]?key/i);
    expect(body).not.toMatch(/unlimited|lifetime|guaranteed/i);
  });
});

describe('the offer copy', () => {
  it('states the four rules in Arabic first, and mirrors them in English', () => {
    expect(PRICING_RULES_AR).toHaveLength(4);
    expect(PRICING_RULES_EN).toHaveLength(4);
    for (const rule of PRICING_RULES_AR) expect(rule).toMatch(/[؀-ۿ]/);
    expect(PRICING_HEADLINE_AR).toMatch(/[؀-ۿ]/);
    expect(PRICING_HEADLINE_EN).toContain('Founding price');
  });

  it('derives every number in the rules from the config', () => {
    // Rule 1: the cap and the date, not a copied sentence.
    expect(PRICING_RULES_AR[0]).toContain(FOUNDING_CAP.toLocaleString('en-US'));
    expect(PRICING_RULES_AR[0]).toContain('2027');
    expect(PRICING_RULES_EN[0]).toContain('2027');
    // Rule 2 is the renewal promise, with no condition invented.
    expect(PRICING_RULES_AR[1]).toContain('تجديد');
    // Rule 3: the day count and the refundable plans.
    expect(PRICING_RULES_AR[2]).toContain(String(REFUND_DAYS));
    expect(PRICING_RULES_EN[2]).toContain(String(REFUND_DAYS));
    expect(PRICING_RULES_AR[2]).toContain('شهر واحد');
    // Rule 4: hours, never "within a day".
    expect(PRICING_RULES_AR[3]).toContain(String(ACTIVATION_HOURS));
    expect(PRICING_RULES_AR.join(' ')).not.toContain('24 ساعة');
  });

  it('puts the payment facts under the cards', () => {
    expect(PRICING_FOOTNOTE_AR).toContain('بطاقة');
    expect(PRICING_FOOTNOTE_AR).toContain(String(ACTIVATION_HOURS));
    expect(PRICING_FOOTNOTE_AR).toContain(String(REFUND_DAYS));
  });

  it('claims nothing it cannot keep', () => {
    const everything = JSON.stringify({
      PRICING_RULES_AR,
      PRICING_RULES_EN,
      PRICING_FOOTNOTE_AR,
      PRICING_HEADLINE_AR,
      REFUND_TEXT,
    });
    for (const claim of FORBIDDEN_CLAIMS_AR) expect(everything).not.toContain(claim);
    expect(everything).not.toMatch(/unlimited|lifetime|guaranteed|ضمان النجاح/i);
  });

  it('states a fair-use cap rather than discovering it', () => {
    expect(FAIR_USE_AI_PER_DAY).toBeGreaterThan(0);
  });

  it('has a real refund line now, not the owner placeholder', () => {
    expect(REFUND_TEXT).toContain(String(REFUND_DAYS));
    expect(REFUND_TEXT).toContain('شهر واحد');
    expect(isOwnerFilled(REFUND_TEXT)).toBe(true);
    expect(isOwnerFilled('')).toBe(false);
    expect(isOwnerFilled(null)).toBe(false);
    expect(isOwnerFilled('   ')).toBe(false);
    expect(isOwnerFilled('{{OWNER_FILL}}')).toBe(false);
  });

  it('invites with a soft prompt that always offers "continue free"', () => {
    expect(SOFT_PROMPT_TITLE_AR).toMatch(/[؀-ۿ]/);
    expect(SOFT_PROMPT_TITLE_EN).toBe('Open every level and situation');
    // The title is an invitation; the body names the free tier that stays.
    expect(SOFT_PROMPT_BODY_AR).toContain(String(FREE_LESSONS_PER_MONTH));
    expect(SOFT_PROMPT_BODY_AR).toContain(foundingLabel(PLANS[0]));
    expect(CONTINUE_FREE_AR).toMatch(/[؀-ۿ]/);
    expect(CONTINUE_FREE_EN).toBe('Continue free');
  });

  it('prices the recommended plan under the best-value badge', () => {
    expect(RECOMMENDED_PLAN.id).toBe('halfyear');
    expect(BEST_VALUE_AR).toMatch(/[؀-ۿ]/);
    expect(PLANS.filter((plan) => plan.recommended)).toHaveLength(1);
  });
});

describe('price formatting', () => {
  it('shows whole dollars without a fake cents tail', () => {
    expect(formatUsd(2900)).toBe('$29');
    expect(formatUsd(1200)).toBe('$12');
    expect(formatUsd(0)).toBe('$0');
  });

  it('shows cents only when there are any, never rounding a price away', () => {
    expect(formatUsd(1499)).toBe('$14.99');
    expect(formatUsd(2999)).toBe('$29.99');
    expect(formatUsd(9999)).toBe('$99.99');
  });

  it('labels founding, future and per-month from the table', () => {
    const monthly = PLANS[0];
    expect(foundingLabel(monthly)).toBe('$14.99');
    expect(futureLabel(monthly)).toBe('$29.99');
    expect(perMonthLabel(PLANS[3])).toBe('$8.33');
  });

  it('shows nothing rather than a free-looking offer when the amount is missing', () => {
    expect(priceLabel(null)).toBeNull();
    expect(priceLabel({})).toBeNull();
    expect(priceLabel({ amountCents: undefined as never })).toBeNull();
    expect(priceLabel({ amountCents: 2999 })).toBe('$29.99');
  });
});

/**
 * The shipped pages, not just the strings this module builds.
 *
 * The site is three pages — `/`, `/pricing`, `/help` — generated from one
 * template, and every fact is published once. So the check is on the built HTML
 * itself: the old offer is gone everywhere, a price exists only on `/pricing`,
 * the home page sells the free start instead, and no retired page or property
 * survives in a link, a canonical or the sitemap.
 */
describe('the built marketing site', () => {
  function htmlFiles(dir = 'website'): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === 'assets' || entry === 'media' || entry === 'fonts') continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) out.push(...htmlFiles(path));
      else if (entry.endsWith('.html')) out.push(path);
    }
    return out;
  }

  const files = htmlFiles().map((file) => file.replace(/\\/g, '/'));

  it('ships exactly the four pages and the 404', () => {
    expect([...files].sort()).toEqual([
      'website/404.html',
      'website/affiliate.html',
      'website/help.html',
      'website/index.html',
      'website/pricing.html',
    ]);
  });

  it('carries none of the retired offer anywhere', () => {
    const retired = /\$60\b|\$42\b|KATZU26|limited[- ]time|لفترة محدودة|24 ساعة|60 دولار/;
    const offenders = files.filter((file) => retired.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps every price on the pricing page and nowhere else', () => {
    const pricing = readFileSync('website/pricing.html', 'utf8');
    for (const price of ['$14.99', '$29.99', '$49.99', '$99.99']) {
      expect(pricing, `pricing must show ${price}`).toContain(price);
    }
    // The struck price is a real published price from the same config.
    expect(pricing).toContain('$199.99');

    for (const file of ['website/index.html', 'website/help.html']) {
      const html = readFileSync(file, 'utf8');
      expect(html, `${file} must not quote a price`).not.toMatch(/\$\d/);
    }

    // /affiliate is the one other page with a figure in it: the worked example
    // ("$49.99 → $10") and the $20 minimum. Both come from the config the
    // Worker pays from, and the build refuses a price on any other page.
    const affiliate = readFileSync('website/affiliate.html', 'utf8');
    expect(affiliate).toContain('$49.99');
    expect(affiliate).toContain('$10');
    expect(affiliate).toContain('$20');
  });

  it('links only to pages that exist, on the site or the app', () => {
    const allowedSite = new Set(['/', '/pricing', '/help', '/affiliate', '/help#faq', '/help#about', '/help#privacy', '/help#terms', '/help#refund', '/help#contact', '/pricing#pay', '/affiliate#apply', '/#app', '/#rail', '/#faq']);
    const offenders: string[] = [];
    for (const file of files) {
      const html = readFileSync(file, 'utf8');
      for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
        // Fragments on the page itself are fine, and so are static assets.
        if (href.startsWith('#') || href.startsWith('/assets/')) continue;
        if (!href.startsWith('/') || href.startsWith('//')) continue;
        if (!allowedSite.has(href)) offenders.push(`${file} -> ${href}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('publishes four URLs in the sitemap and no English or trust page', () => {
    const sitemap = readFileSync('website/sitemap.xml', 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(4);
    for (const loc of locs) expect(loc).toMatch(/^https:\/\/website\.katzuai\.com\/(pricing|help|affiliate)?$/);
    const redirects = readFileSync('website/_redirects', 'utf8');
    expect(redirects).toMatch(/^\/en\/\* \/ {2}301$/m);
  });

  it('rides on one shared stylesheet and one shared background', () => {
    const css = readFileSync('website/assets/site.css', 'utf8');
    expect(css, 'one background image for every page').toContain('/assets/bg-poster.jpg');
    for (const file of ['website/index.html', 'website/pricing.html', 'website/help.html', 'website/affiliate.html']) {
      const html = readFileSync(file, 'utf8');
      expect(html, `${file} stylesheet`).toContain('/assets/site.css');
      // One H1 per page: the page has one job.
      expect([...html.matchAll(/<h1[\s>]/g)], `${file} h1 count`).toHaveLength(1);
    }
    // The home page is the design: a video background. The text pages carry the
    // same still and the same grain instead, through one shared .bgimg layer.
    for (const file of ['website/pricing.html', 'website/help.html', 'website/affiliate.html', 'website/404.html']) {
      expect(readFileSync(file, 'utf8'), `${file} background layer`).toContain('class="bgimg"');
    }
    expect(readFileSync('website/index.html', 'utf8')).not.toContain('class="bgimg"');
    // The video is a home-page-only flourish.
    expect(readFileSync('website/index.html', 'utf8')).toContain('/assets/bg.mp4');
    for (const file of ['website/pricing.html', 'website/help.html', 'website/affiliate.html']) {
      expect(readFileSync(file, 'utf8')).not.toContain('bg.mp4');
    }
  });

  it('carries the partner link and the partner reader on every page', () => {
    // The link is a footer link, never a nav item: the main nav keeps its three
    // destinations. The reader is one generated file, loaded by all five pages.
    for (const file of files) {
      const html = readFileSync(file, 'utf8');
      expect(html, `${file} footer partner link`).toContain('href="/affiliate"');
      expect(html, `${file} partner reader`).toContain('/assets/ref.js');
      const nav = html.match(/<nav id="nav"[\s\S]*?<\/nav>/)?.[0] || '';
      expect(nav, `${file} nav must not carry the partner link`).not.toContain('/affiliate');
    }
    const ref = readFileSync('website/assets/ref.js', 'utf8');
    // Syntax is checked by `node --check` in the gate; these are the guarantees
    // the file must keep: 30 days, the parent domain, the code grammar.
    expect(ref).toContain('max-age=2592000');
    expect(ref).toContain('domain=.katzuai.com');
    expect(ref).toContain('[A-Z0-9]{3,20}');
  });

  it('lets the partner reader reach the Worker its CSP names', () => {
    // A cookie that is written but whose code is never checked is half a feature:
    // the site's CSP decides whether `/assets/ref.js` may ask the Worker whether
    // the code exists. Pin the same origin in both files, so moving the Worker
    // cannot leave the check silently blocked — which would show up as a console
    // error on every page and as a dead link that still attributes for 30 days.
    const csp =
      readFileSync('website/_headers', 'utf8')
        .split(/\r?\n/)
        .find((line) => line.includes('Content-Security-Policy:')) ?? '';
    const connect = csp.match(/connect-src ([^;]+);/)?.[1] ?? '';
    const worker = readFileSync('website/assets/ref.js', 'utf8').match(/fetch\("([^"]+)"/)?.[1] ?? '';
    expect(worker, 'the reader must name one absolute Worker origin').toMatch(
      /^https:\/\/[a-z0-9.-]+\.workers\.dev$/,
    );
    expect(connect, 'connect-src must reach the Worker the reader calls').toContain(worker);
    expect(connect, 'a wildcard workers.dev host is never allowed').not.toContain('*.workers.dev');
  });
});
