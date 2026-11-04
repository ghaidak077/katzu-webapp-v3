import { describe, expect, it } from 'vitest';
import { appLlmsTxt, robotsTxt as siteRobotsTxt, sitemapXml } from '../scripts/site-seo.mjs';
import {
  ORG_ID,
  articleJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from '../scripts/site-schema.mjs';

/**
 * The two hosts are one brand.
 *
 * The failure these pin is not a broken tag but a split identity: the marketing
 * site said the Organization lived on `website.katzuai.com`, the app said
 * nothing, and each robots file named only its own sitemap. A crawler that
 * arrived at either host saw half a site and a brand with no home. These are
 * pure builders, so the contract can be checked without a deploy.
 */
describe('the marketing site robots file', () => {
  it('names both hosts so either entry point finds every public page', () => {
    const robots = siteRobotsTxt();
    expect(robots).toContain('Sitemap: https://website.katzuai.com/sitemap.xml');
    expect(robots).toContain('Sitemap: https://katzuai.com/sitemap.xml');
    expect(robots.match(/^Sitemap:/gm)).toHaveLength(2);
  });

  it('still keeps the private paths closed on every named crawler', () => {
    const robots = siteRobotsTxt();
    for (const path of ['/admin/', '/api/', '/private/']) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
  });
});

describe('the sitemap', () => {
  it('lists the home page and every guide once', () => {
    const xml = sitemapXml();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toContain('https://website.katzuai.com/');
    expect(new Set(locs).size).toBe(locs.length);
    expect(locs.length).toBeGreaterThan(10);
  });
});

describe('the brand entity', () => {
  it('anchors the Organization on the apex, not on the content subdomain', () => {
    expect(ORG_ID).toBe('https://katzuai.com/#organization');
    expect(organizationJsonLd()).toMatchObject({
      '@type': 'Organization',
      '@id': ORG_ID,
      url: 'https://katzuai.com/',
      name: 'Katzu',
    });
  });

  it('makes every publisher reference point at that one id', () => {
    expect(webSiteJsonLd().publisher).toEqual({ '@id': ORG_ID });
    expect(softwareApplicationJsonLd().publisher).toEqual({ '@id': ORG_ID });
    const article = articleJsonLd({
      path: '/guides/a1-visa',
      headline: 'الفيزا',
      description: 'دليل',
      published: '2026-10-29',
      modified: '2026-10-29',
    });
    expect(article.publisher).toEqual({ '@id': ORG_ID });
    expect(article.author).toEqual({ '@id': ORG_ID });
  });
});

describe('the apex llms.txt', () => {
  it('states what the host is and points at the full content file', () => {
    const text = appLlmsTxt();
    expect(text).toContain('# كاتزو (Katzu)');
    expect(text).toContain('https://katzuai.com/welcome');
    expect(text).toContain('https://website.katzuai.com/llms.txt');
    expect(text).toContain('https://website.katzuai.com/guides');
  });
});
