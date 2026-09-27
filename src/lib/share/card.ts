import type { CapabilityState } from '@/types/models';

/**
 * The shareable progress card.
 *
 * A learner's progress is theirs, and the version they post is the one friends
 * and family see. So the card is built from an allowlist of things that are
 * true and harmless:
 *
 *   - a first name or nickname (never the email, never the full account name),
 *   - one capability they actually reached (INDEPENDENT or RETAINED, recorded
 *     by the app — not "fluent", not a CEFR claim the app never measured),
 *   - the date and a measured independent performance figure, only when the app
 *     has one,
 *   - Katzu branding and, optionally, the app URL.
 *
 * Never: email, private mistakes or their corrections, conversation text,
 * immigration/medical/financial detail, or any unverified level claim.
 */

export interface ShareCardInput {
  displayName?: string | null;
  capabilityState: CapabilityState;
  /** Arabic title of the scenario the achievement refers to. */
  scenarioTitleAr?: string | null;
  /** Measured independent accuracy (0-100), or null when not measured. */
  independentAccuracy?: number | null;
  streakDays?: number;
  /** Real activity date; defaults to now at build time. */
  dateMs?: number;
  appUrl?: string;
}

export interface ShareCard {
  name: string;
  headlineAr: string;
  linesAr: string[];
  dateLabel: string;
  /** Katzu's brand line, always present. */
  brandAr: string;
  url?: string;
}

const MAX_NAME_LENGTH = 24;
const DEFAULT_NAME = 'متعلّم كاتزو';

/** Arabic-Indic-safe date label; Intl handles the locale, we never hand-format. */
function dateLabel(dateMs: number): string {
  try {
    return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dateMs));
  } catch {
    return '';
  }
}

/**
 * Display name to first-name/nickname only. Anything email-shaped is rejected
 * outright rather than trimmed: a share image is the last place an address
 * should surface, and a "trim" that leaves the local part is still a leak.
 */
export function sanitizeDisplayName(name: string | null | undefined): string {
  const raw = String(name || '').trim();
  if (!raw) return DEFAULT_NAME;
  if (raw.includes('@')) {
    // Google display names are not emails, but a login email pasted into the
    // field must never become a card title.
    const beforeAt = raw.split('@')[0].trim();
    return sanitizeDisplayName(beforeAt);
  }
  const first = raw.split(/\s+/)[0] || raw;
  const cleaned = first.replace(/[^\p{L}\p{N}._-]/gu, '').trim();
  if (!cleaned) return DEFAULT_NAME;
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

/**
 * Builds the card, or returns null when there is nothing real to celebrate.
 * "No card" is the honest answer for a learner who has only opened a lesson.
 */
export function buildShareCard(input: ShareCardInput): ShareCard | null {
  const state = input?.capabilityState;
  const hasCapability = (state === 'INDEPENDENT' || state === 'RETAINED') && !!input.scenarioTitleAr;
  const hasStreak = (input?.streakDays || 0) >= 7;
  if (!hasCapability && !hasStreak) return null;

  const dateMs = Number(input.dateMs) || Date.now();
  const lines: string[] = [];

  if (hasCapability) {
    lines.push(
      state === 'RETAINED'
        ? `أصبحت أتعامل مع «${input.scenarioTitleAr}» بالألمانية بثقة، وثبّتناها بالمراجعة.`
        : `أصبحت أستطيع التعامل مع «${input.scenarioTitleAr}» بالألمانية بدون مساعدة.`,
    );
  }
  if (typeof input.independentAccuracy === 'number' && Number.isFinite(input.independentAccuracy)) {
    lines.push(`أداء مستقل: ${Math.round(input.independentAccuracy)}٪`);
  }
  if (hasStreak) lines.push(`${input.streakDays} أيام متتالية في كاتزو`);

  const name = sanitizeDisplayName(input.displayName);
  const headlineAr = hasCapability ? `اليوم في كاتزو` : `تقدّمي في كاتزو`;

  return {
    name,
    headlineAr,
    linesAr: lines,
    dateLabel: dateLabel(dateMs),
    brandAr: 'Katzu — تدرّب على الألمانية في مواقف حقيقية',
    url: input.appUrl || undefined,
  };
}

/** The plain-text version used by Web Share and the clipboard fallback. */
export function buildShareText(card: ShareCard): string {
  const parts = [`${card.headlineAr}: ${card.name}`, ...card.linesAr, card.dateLabel, card.brandAr];
  if (card.url) parts.push(card.url);
  return parts.filter(Boolean).join('\n');
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
/** A CEFR claim the app did not measure for this card. */
const CEFR_CLAIM_RE = /\b(A1|A2|B1|B2|C1|C2)\b|مستوى\s*[A-C][12]/i;

/**
 * Last-line defence before anything is shared: rejects an address, an
 * unmeasured level claim, or a body long enough to be a transcript. Used by the
 * UI and unit-tested, so a future edit to the copy cannot quietly widen it.
 */
export function isShareTextSafe(text: string): boolean {
  const value = String(text || '');
  if (!value.trim()) return false;
  if (EMAIL_RE.test(value)) return false;
  if (CEFR_CLAIM_RE.test(value)) return false;
  // 400 characters is far more than a progress card and close to a short
  // conversation — a card is not the place for learner text.
  if (value.length > 400) return false;
  return true;
}
