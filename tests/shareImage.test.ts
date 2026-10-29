import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  absoluteOgImages,
  appRobotsTxt,
  appSitemapXml,
  withAbsoluteOgUrl,
  withCanonicalUrl,
  withHreflang,
  withStructuredData,
} from '../vite.config';

/**
 * The link preview, held to its two halves: the pixels and the tags.
 *
 * `og:image` used to point at the raw 512px app icon — a square a social card
 * crops — so the first thing a stranger saw was a logo, not a sentence. It now
 * points at an Arabic card built by `npm run make:share-image`. This test checks
 * the claims the tags make about that file: it is really 1200x630, it is really
 * opaque, it exists where the tag says, and the build turns the root-relative
 * path absolute exactly when it knows an origin (never hardcoding one here).
 */

const INDEX = readFileSync('index.html', 'utf8');
const SHARE_PNG = 'public/assets/share/katzu-share-ar.png';

interface Png {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

/** Minimal PNG decoder for the truecolour images Playwright writes. */
function decodePng(path: string): Png {
  const buffer = readFileSync(path);
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${path}`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const interlace = buffer[28];
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (bitDepth !== 8 || channels === 0 || interlace !== 0) {
    throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}): ${path}`);
  }

  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, y * stride + stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, (y - 1) * stride + stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

describe('the share card is the file the tags promise', () => {
  const png = decodePng(SHARE_PNG);

  it('is exactly 1200x630', () => {
    expect(png.width).toBe(1200);
    expect(png.height).toBe(630);
  });

  it('is fully opaque — no transparency a card frame would fill', () => {
    if (png.channels === 3) {
      // RGB: there is no alpha channel to be anything but opaque.
      expect(png.pixels.length).toBe(1200 * 630 * 3);
      return;
    }
    let minAlpha = 255;
    for (let index = 3; index < png.pixels.length; index += 4) {
      if (png.pixels[index] < minAlpha) minAlpha = png.pixels[index];
    }
    expect(minAlpha).toBe(255);
  });
});

describe('the Open Graph tags point at it', () => {
  // The landing screen updates `og:url` at runtime and it silently did nothing,
  // because no HTML ever contained the tag. The build now injects it when it knows
  // the origin, and leaves the document untouched when it does not — a relative
  // `og:url` is invalid for a crawler that does not run JavaScript.
  it('injects an absolute og:url only when the build knows its origin', () => {
    const html = '<html><head><title>t</title></head><body></body></html>';
    const withOrigin = withAbsoluteOgUrl(html, 'https://katzu.example/');
    expect(withOrigin).toContain('<meta property="og:url" content="https://katzu.example/" />');
    // Idempotent: a second pass must not add a second tag.
    expect(withAbsoluteOgUrl(withOrigin, 'https://katzu.example')).toBe(withOrigin);
    // No origin → byte-for-byte unchanged, and no host is ever hardcoded.
    expect(withAbsoluteOgUrl(html, '')).toBe(html);
  });

  it('injects the canonical link and WebSite data only when it knows the origin', () => {
    const html = '<html><head><title>t</title></head><body></body></html>';
    const canonical = withCanonicalUrl(html, 'https://katzu.example/');
    expect(canonical).toContain('<link rel="canonical" href="https://katzu.example/" />');
    expect(withCanonicalUrl(canonical, 'https://katzu.example')).toBe(canonical);
    expect(withCanonicalUrl(html, '')).toBe(html);
    // A bare host is a typo, not an origin; never emit an invalid canonical URL.
    expect(withCanonicalUrl(html, 'katzu.example')).toBe(html);

    const structured = withStructuredData(html, 'https://katzu.example/');
    const match = structured.match(/<script type="application\/ld\+json">(.*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(JSON.parse(match![1])).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Katzu',
      url: 'https://katzu.example/',
      inLanguage: 'ar',
    });
    expect(withStructuredData(structured, 'https://katzu.example')).toBe(structured);
    expect(withStructuredData(html, '')).toBe(html);
  });

  it('names the share card on both og:image and twitter:image', () => {
    expect(INDEX).toMatch(/property="og:image" content="\/assets\/share\/katzu-share-ar\.png"/);
    expect(INDEX).toMatch(/name="twitter:image" content="\/assets\/share\/katzu-share-ar\.png"/);
  });

  it('declares the real dimensions and an alt for the crawler', () => {
    expect(INDEX).toContain('property="og:image:width" content="1200"');
    expect(INDEX).toContain('property="og:image:height" content="630"');
    expect(INDEX).toMatch(/og:image:alt" content="[^"]+"/);
  });

  it('ships the file it references', () => {
    expect(existsSync(SHARE_PNG)).toBe(true);
  });
});

describe('absoluteOgImages', () => {
  const sample = [
    '<meta property="og:image" content="/assets/share/katzu-share-ar.png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta name="twitter:image" content="/assets/share/katzu-share-ar.png" />',
    '<meta name="twitter:card" content="summary_large_image" />',
  ].join('\n');

  it('makes only the image tags absolute when an origin is known', () => {
    const out = absoluteOgImages(sample, 'https://app.example/');
    expect(out).toContain('property="og:image" content="https://app.example/assets/share/katzu-share-ar.png"');
    expect(out).toContain('name="twitter:image" content="https://app.example/assets/share/katzu-share-ar.png"');
    // Everything else is byte-for-byte: no host is added to the width or the card.
    expect(out).toContain('<meta property="og:image:width" content="1200" />');
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('leaves the markup untouched when no origin is configured', () => {
    expect(absoluteOgImages(sample, '')).toBe(sample);
    expect(absoluteOgImages(sample, '   ')).toBe(sample);
  });

  it('does not double-write an origin that is already absolute', () => {
    // The replacement is idempotent because it only matches a root-relative path.
    const once = absoluteOgImages(sample, 'https://app.example');
    expect(absoluteOgImages(once, 'https://app.example')).toBe(once);
  });
});

describe('the crawler files the app build emits', () => {
  /**
   * These were never emitted before: the app shipped no robots.txt and no
   * sitemap.xml, so the only host a crawler could read files from was the
   * marketing site. The builders are pure so this contract is testable without
   * running a build.
   */
  it('names the ten crawlers and closes only the private paths', () => {
    const robots = appRobotsTxt('https://katzuai.example/');
    for (const agent of [
      'Googlebot',
      'bingbot',
      'GPTBot',
      'OAI-SearchBot',
      'ChatGPT-User',
      'ClaudeBot',
      'Claude-SearchBot',
      'PerplexityBot',
      'Applebot',
      'Google-Extended',
    ]) {
      expect(robots).toContain(`User-agent: ${agent}\nAllow: /`);
    }
    expect(robots).toContain('User-agent: *\nAllow: /');
    for (const path of ['/admin/', '/api/', '/private/']) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
    expect(robots).toContain('Sitemap: https://katzuai.example/sitemap.xml');
    // No dead host may survive in a generated file.
    expect(robots).not.toContain('katzu.app');
  });

  it('omits a sitemap line and a sitemap when the origin is unknown', () => {
    expect(appRobotsTxt('')).not.toContain('Sitemap:');
    expect(appRobotsTxt('katzu.app')).not.toContain('Sitemap:');
    expect(appSitemapXml('')).toBeNull();
    expect(appSitemapXml('katzu.example')).toBeNull();
  });

  it('lists the shell root, once, and nothing that is not a page', () => {
    const sitemap = appSitemapXml('https://katzuai.example/');
    expect(sitemap).not.toBeNull();
    const locs = [...sitemap!.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual(['https://katzuai.example/']);
    // A lastmod on every deploy would claim a change that did not happen.
    expect(sitemap).not.toContain('<lastmod>');
  });

  it('declares one language pair on the shell, and only when it knows the origin', () => {
    const html = '<html><head><title>t</title></head><body></body></html>';
    const out = withHreflang(html, 'https://katzuai.example/');
    expect(out).toContain('<link rel="alternate" hreflang="ar" href="https://katzuai.example/" />');
    expect(out).toContain('<link rel="alternate" hreflang="x-default" href="https://katzuai.example/" />');
    // Never a second pair, and never a pair pointing at a host it cannot resolve.
    expect(withHreflang(out, 'https://katzuai.example')).toBe(out);
    expect(withHreflang(html, '')).toBe(html);
    expect(withHreflang(html, 'katzu.app')).toBe(html);
  });
});
