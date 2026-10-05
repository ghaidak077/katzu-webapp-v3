/**
 * The share card, as text and a link.
 *
 * WHAT IS SHARED
 * The learner's own result and a link that credits them. Not a certificate, not
 * an exam score, not a badge implying certification — the mock's number is a
 * practice estimate and the share says so in the same words the result screen
 * uses, so a screenshot of the share cannot claim more than the app does.
 *
 * WHAT IS NEVER SHARED
 * No email, no account id, no transcript, no mistakes. The link carries a referral
 * code, which is a stable public handle that resolves to a payout and nothing
 * else — and it can be removed from the link without losing the share.
 */

export interface ShareInput {
  /** The app's own origin, e.g. `https://katzu-webapp-v3.pages.dev`. */
  appUrl: string;
  /** The learner's stable referral code, `REF-XXXXXXXX`, when they have one. */
  referralCode?: string | null;
  /** The practice estimate, or null when there was too little to estimate. */
  estimate?: number | null;
  /** One line about what the estimate is, in Arabic. */
  headlineAr?: string;
  level?: string;
}

/** The link a share points at, with the referral code as the only parameter. */
export function buildShareLink({ appUrl, referralCode }: ShareInput): string {
  const base = String(appUrl || '').trim().replace(/\/+$/, '');
  const code = String(referralCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  // A code that does not look like a referral code is dropped rather than put in
  // a URL: a wrong `?ref=` cannot earn anything, and a crafted one would put an
  // arbitrary string on someone's share.
  if (!base) return '';
  if (!/^REF-[A-Z2-9]{8}$/.test(code)) return `${base}/mock`;
  return `${base}/mock?ref=${code}`;
}

/**
 * The Arabic share text.
 *
 * Short enough for a chat app and honest enough for a screenshot: the estimate is
 * named a practice estimate in the same sentence it appears in.
 */
export function buildShareText({ estimate, headlineAr, level }: ShareInput): string {
  const band = level ? ` (${level})` : '';
  if (typeof estimate === 'number' && Number.isFinite(estimate)) {
    return (
      `تدربت على German Sprechen${band} — تقدير تدريبي ${estimate} من 100. ` +
      'هذا تقدير من التدريب في التطبيق، وليس درجة رسمية. Katzu.'
    );
  }
  return String(headlineAr || 'تدربت على المحادثة الألمانية مع Katzu');
}
