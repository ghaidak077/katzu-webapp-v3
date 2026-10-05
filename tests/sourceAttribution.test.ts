import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `?src=` — the channel a learner arrived through.
 *
 * The value is small and dull on purpose. What matters is that it survives the
 * three places a learner can lose it (the demo, the signup, the purchase), that
 * nothing hostile can be stored in a field the admin UI renders, and that the
 * server refuses the same values the client does — the client can be bypassed.
 */

// A localStorage stand-in: the unit suite runs in node, where storage is absent,
// and a real store is what the persistence rules are actually about.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

import {
  SOURCE_PATTERN,
  captureSourceFromSearch,
  clearSource,
  currentSource,
  readShareMarkerFromSearch,
  readSourceFromSearch,
  readSourceFromUrl,
  sanitizeSource,
  storeSource,
  withSource,
} from '../src/lib/attribution/source';
import { buildSalesUrl } from '../src/lib/utils/links';
import { sanitizeSrcTag } from '../cloudflare-admin.js';

describe('what a source tag may be', () => {
  it('accepts a short slug and folds its case', () => {
    expect(sanitizeSource('tiktok')).toBe('tiktok');
    expect(sanitizeSource('TikTok')).toBe('tiktok');
    expect(sanitizeSource('  reuters  ')).toBe('reuters');
    expect(sanitizeSource('arabic_school-2')).toBe('arabic_school-2');
    expect(sanitizeSource('a')).toBe('a');
    expect(sanitizeSource('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it('drops everything that is not the whole grammar', () => {
    // Not trimmed, not partially kept: a tag that needed cleaning was not a tag.
    const rejected = [
      '',
      '   ',
      'a'.repeat(33),
      'has space',
      'has.dot',
      'has/slash',
      'https://evil.example/x',
      'someone@example.com',
      'جامعة',
      '<script>',
      '../../etc/passwd',
      'a+b',
      'a%20b',
    ];
    for (const value of rejected) expect(sanitizeSource(value), value).toBeNull();
  });

  it('accepts ordinary words, including ones that look like type errors', () => {
    // "null" and "undefined" are valid slugs — they are words a channel could
    // genuinely be named. Rejecting them would mean the tag does not mean what
    // it says, and would make `sanitizeSource(null)` ambiguous with the string.
    expect(sanitizeSource('null')).toBe('null');
    expect(sanitizeSource('undefined')).toBe('undefined');
    expect(sanitizeSource(null)).toBeNull();
    expect(sanitizeSource(undefined)).toBeNull();
  });

  it('rejects everything that is not a string, without throwing', () => {
    for (const value of [null, undefined, 42, {}, [], true, Symbol('x')]) {
      expect(sanitizeSource(value as unknown)).toBeNull();
    }
  });

  it('states the grammar once, and the parser follows it', () => {
    for (const value of ['ok', 'a-b_c9', 'a'.repeat(32), 'has space', 'a'.repeat(33)]) {
      expect(SOURCE_PATTERN.test(value), value).toBe(sanitizeSource(value) !== null);
    }
  });
});

describe('reading a tag out of a link', () => {
  it('finds it in a query string, alone or beside others', () => {
    expect(readSourceFromSearch('?src=tiktok')).toBe('tiktok');
    expect(readSourceFromSearch('?ref=REF-1234&src=reuters')).toBe('reuters');
    expect(readSourceFromSearch('?src=reuters&ref=REF-1234')).toBe('reuters');
    expect(readSourceFromSearch('')).toBeNull();
    expect(readSourceFromSearch('?other=1')).toBeNull();
  });

  it('finds it in a full URL, absolute or relative', () => {
    expect(readSourceFromUrl('https://katzu.app/?src=tiktok')).toBe('tiktok');
    expect(readSourceFromUrl('/demo?src=tiktok')).toBe('tiktok');
    expect(readSourceFromUrl('/demo')).toBeNull();
  });

  it('refuses a malformed link rather than throwing', () => {
    expect(readSourceFromSearch('?src=%E0%A4%A')).toBeNull();
    expect(readSourceFromUrl('::::')).toBeNull();
  });
});

describe('the tag survives the journey', () => {
  it('is remembered from the demo link and still there at signup', () => {
    // The learner arrives on /demo with a tag…
    expect(captureSourceFromSearch('?src=tiktok')).toBe('tiktok');
    // …taps through to signup, where the address bar no longer has it.
    expect(captureSourceFromSearch('')).toBe('tiktok');
    expect(currentSource()).toBe('tiktok');
  });

  it('is replaced by a later, different tag', () => {
    captureSourceFromSearch('?src=tiktok');
    expect(captureSourceFromSearch('?src=reuters')).toBe('reuters');
    expect(currentSource()).toBe('reuters');
  });

  it('is not replaced by an invalid one — the first good tag stands', () => {
    captureSourceFromSearch('?src=tiktok');
    // A hostile or malformed tag must not be able to erase a real one, and it
    // must not be stored either: the function keeps returning what is already
    // known rather than the value it refused.
    expect(captureSourceFromSearch('?src=has%20space')).toBe('tiktok');
    expect(currentSource()).toBe('tiktok');
  });

  it('is forgotten on request, for sign-out and account deletion', () => {
    storeSource('tiktok');
    clearSource();
    expect(currentSource()).toBeNull();
  });

  it('does not throw when storage is denied', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
      removeItem() {
        throw new Error('denied');
      },
    });
    expect(() => storeSource('tiktok')).not.toThrow();
    expect(currentSource()).toBeNull();
  });
});

describe('recognising the receiving end of a share', () => {
  it('sees a shared link by the referral code it carries', () => {
    // `share_click` is counted on the sharer's device; `share_landed` is this.
    // Only the pair measures whether sharing brings anybody in.
    expect(readShareMarkerFromSearch('?ref=REF-ABCD1234')).toBe('referral');
    expect(readShareMarkerFromSearch('?src=reel&ref=REF-ABCD1234')).toBe('referral');
  });

  it('sees a direct visit as nothing', () => {
    expect(readShareMarkerFromSearch('?src=reel')).toBeNull();
    expect(readShareMarkerFromSearch('')).toBeNull();
    expect(readShareMarkerFromSearch('?ref=')).toBeNull();
    expect(readShareMarkerFromSearch('?ref=%20%20')).toBeNull();
  });

  it('never hands back the code itself', () => {
    // A referral code is a public handle, but it identifies a person, and the
    // only value this may produce is the word "referral".
    const marker = readShareMarkerFromSearch('?ref=REF-SECRET-1234');
    expect(marker).toBe('referral');
    expect(String(marker)).not.toContain('SECRET');
  });

  it('does not throw on a malformed query string, and still leaks nothing', () => {
    // A malformed code is still a non-empty one, and this function never parses
    // it — it only asks "was there a ref?". The answer stays the bare word.
    expect(readShareMarkerFromSearch('?ref=%E0%A4%A')).toBe('referral');
    expect(readShareMarkerFromSearch('?ref=' + 'x'.repeat(10_000))).toBe('referral');
  });
});

describe('the tag leaves with the learner', () => {
  it('is attached to a URL going out', () => {
    expect(withSource('https://katzu-sales.pages.dev', 'tiktok')).toContain('src=tiktok');
    expect(withSource('https://katzu-sales.pages.dev/checkout', 'tiktok')).toContain('/checkout?src=tiktok');
  });

  it('falls back to the stored tag when none is passed', () => {
    storeSource('tiktok');
    expect(withSource('https://katzu-sales.pages.dev')).toContain('src=tiktok');
  });

  it('leaves a URL alone when there is nothing to add', () => {
    expect(withSource('https://katzu-sales.pages.dev')).toBe('https://katzu-sales.pages.dev');
    expect(withSource('https://katzu-sales.pages.dev', 'has space')).toBe('https://katzu-sales.pages.dev');
  });

  it('returns a malformed URL unchanged rather than rebuilding it', () => {
    expect(withSource('not a url', 'tiktok')).toBe('not a url');
  });

  it('travels to the sales page WITH a referral code, not instead of one', () => {
    const url = new URL(buildSalesUrl('ref-abcd1234', 'tiktok'));
    expect(url.searchParams.get('ref')).toBe('REF-ABCD1234');
    expect(url.searchParams.get('src')).toBe('tiktok');
  });

  it('carries the stored tag into the sales link when the caller passes none', () => {
    storeSource('tiktok');
    expect(new URL(buildSalesUrl()).searchParams.get('src')).toBe('tiktok');
  });

  it('carries a referral code alone when there is no channel', () => {
    const url = new URL(buildSalesUrl('ref-abcd1234'));
    expect(url.searchParams.get('ref')).toBe('REF-ABCD1234');
    expect(url.searchParams.get('src')).toBeNull();
  });
});

describe('the server refuses the same values', () => {
  it('applies the identical grammar', () => {
    expect(sanitizeSrcTag('tiktok')).toBe('tiktok');
    expect(sanitizeSrcTag('TikTok')).toBe('tiktok');
    for (const value of ['', 'a'.repeat(33), 'has space', 'https://evil.example', 'جامعة', '<script>']) {
      expect(sanitizeSrcTag(value), value).toBeNull();
    }
    expect(sanitizeSrcTag(null)).toBeNull();
    expect(sanitizeSrcTag(42)).toBeNull();
  });

  it('agrees with the client on every value in the table above', () => {
    // The client can be bypassed by anyone holding a link, so the two rules are
    // asserted equal rather than each asserted separately.
    for (const value of ['tiktok', 'TikTok', 'a-b_c9', 'a'.repeat(32), 'a'.repeat(33), 'has space', 'جامعة']) {
      expect(sanitizeSrcTag(value)).toBe(sanitizeSource(value));
    }
  });

  it('never returns a value containing anything but the alphabet of a slug', () => {
    for (const value of ['a b', 'a"b', "a'b", 'a<b', 'a&b', 'a;b', 'a\nb', 'a\\b']) {
      expect(sanitizeSrcTag(value)).toBeNull();
    }
  });
});
