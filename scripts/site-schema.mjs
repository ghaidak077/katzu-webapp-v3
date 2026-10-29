/**
 * The machine-readable description of the site — one builder per schema type.
 *
 * WHY THIS IS SEPARATE FROM THE COPY
 * `site-content.mjs` owns the sentences a visitor reads; this file owns the
 * sentences a crawler reads. Keeping them apart means a page can never drift
 * from its structured data by accident: the guide builder feeds the same
 * `title`, `description`, FAQ pairs and dates into both the HTML and the JSON-LD.
 *
 * WHAT IS DELIBERATELY ABSENT
 * No `aggregateRating`, no `review`, no `award`, no user count. The repository
 * cannot prove any of them, and a rating invented for a rich result is a lie
 * that outlives the page. `sameAs` is absent for the same reason: there is no
 * verified Katzu profile to point at yet (the TODO lives in
 * `docs/agent/OWNER-CHECKLIST.md`).
 *
 * Every price and duration below is read from `pricing.config.json` through
 * `site-pricing.mjs`. Nothing here types a number by hand.
 */

import { APP, PLANS, SITE, SUPPORT, FREE_LESSONS_PER_MONTH } from './site-pricing.mjs';

/** The founder, as the owner states him. Used for the Organization only. */
export const FOUNDER = 'Ghaidak Alloush';

/**
 * Marks the end of the founding price. A fixed calendar date, not "forever":
 * `priceValidUntil` is what stops a rich result quoting a price that has ended.
 */
export const PRICE_VALID_UNTIL = '2027-01-31';

const LOGO = `${SITE}/assets/logo/logo-512.png`;

export const ORG_ID = `${SITE}/#organization`;
export const WEBSITE_ID = `${SITE}/#website`;

/** Organization: the publisher named on every Article and on the home page. */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Katzu',
    alternateName: ['كاتزو'],
    url: `${SITE}/`,
    logo: {
      '@type': 'ImageObject',
      url: LOGO,
      width: 512,
      height: 512,
    },
    founder: {
      '@type': 'Person',
      name: FOUNDER,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: SUPPORT,
      availableLanguage: ['ar', 'de', 'en'],
    },
  };
}

/** WebSite: the site itself, in the language it is written in. */
export function webSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'كاتزو',
    alternateName: 'Katzu',
    url: `${SITE}/`,
    inLanguage: 'ar',
    publisher: { '@id': ORG_ID },
  };
}

/**
 * SoftwareApplication: the product. `offers` is the pricing table, plan for
 * plan, so a search result can never quote a plan the site does not sell.
 */
export function softwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Katzu',
    alternateName: 'كاتزو',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    url: `${APP}/welcome`,
    inLanguage: ['ar', 'de'],
    description:
      'تطبيق تدريب على الألمانية المنطوقة للناطقين بالعربية: موقف يومي، وجملة تنطقها، وتصحيح بالعربية.',
    publisher: { '@id': ORG_ID },
    offers: [
      // The free tier is a fact about the product: the same three-lesson total
      // the copy states, read from the same config.
      {
        '@type': 'Offer',
        name: 'الباقة المجانية',
        price: '0',
        priceCurrency: 'USD',
        description: `${FREE_LESSONS_PER_MONTH} دروس مجانية في المجموع`,
        url: `${APP}/welcome`,
      },
      ...PLANS.map((plan) => ({
        '@type': 'Offer',
        name: plan.nameAr,
        price: (plan.cents / 100).toFixed(2),
        priceCurrency: 'USD',
        priceValidUntil: PRICE_VALID_UNTIL,
        availability: 'https://schema.org/InStock',
        url: `${SITE}/pricing#pay`,
      })),
    ],
  };
}

/** One BreadcrumbList from `[path, label]` pairs, in reading order. */
export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([path, name], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: `${SITE}${path}`,
    })),
  };
}

/**
 * FAQPage from the pairs the page actually prints. The caller passes the same
 * array it renders, so the markup and the schema cannot disagree; tags are
 * stripped because schema.org answers are plain text.
 */
export function faqPageJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a.replace(/<[^>]+>/g, ''),
      },
    })),
  };
}

/** Article for one guide. Dates come from the caller: the guide's own build date. */
export function articleJsonLd({ path, headline, description, published, modified }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    inLanguage: 'ar',
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${path}` },
    datePublished: published,
    dateModified: modified,
    author: { '@type': 'Organization', name: 'Katzu', url: `${SITE}/` },
    publisher: { '@id': ORG_ID },
    image: LOGO,
  };
}
