/**
 * `?src=` — which link brought this learner here.
 *
 * WHY THIS EXISTS ALONGSIDE `?ref=`
 * `ref` is a referral CODE: a person invited a friend, and the code buys them
 * months. `src` is a CHANNEL: which post, video or message produced the visit.
 * They answer different questions, so they are different parameters, and this
 * module deliberately stores nothing that identifies anybody — a channel is a
 * short slug the owner chose, never a name, an email or a UTM blob.
 *
 * THE RULE THAT MAKES IT USEFUL
 * A tag that only lives in the address bar is lost the moment the learner taps
 * through the demo or signs up — which is exactly where attribution is wanted.
 * So it is captured on every entry and kept for the life of the device, then
 * handed to the account at sign-in and forwarded to the sales page at purchase.
 *
 * WHAT CAN NEVER BE STORED
 * The value is `[a-z0-9_-]{1,32}` after lowercasing. Anything else — a full URL,
 * an email, an Arabic sentence, a script tag, anything longer — is dropped at the
 * door rather than trimmed, so a hostile link cannot smuggle content into a field
 * that is later rendered in the admin UI.
 */

const STORAGE_KEY = 'katzu_source_v1';

/** The whole grammar, as a pattern, so the test and the parser cannot disagree. */
export const SOURCE_PATTERN = /^[a-z0-9_-]{1,32}$/;

/**
 * The one tag, or nothing.
 *
 * Case is folded (`TikTok` → `tiktok`) because the owner will type both and mean
 * one row; everything else is a rejection, not a cleanup.
 */
export function sanitizeSource(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return SOURCE_PATTERN.test(value) ? value : null;
}

/** The tag in a query string, without touching storage. Pure. */
export function readSourceFromSearch(search: string): string | null {
  try {
    return sanitizeSource(new URLSearchParams(search || '').get('src'));
  } catch {
    return null;
  }
}

/** The tag in a full URL, without touching storage. Pure. */
export function readSourceFromUrl(url: string): string | null {
  try {
    return readSourceFromSearch(new URL(url, 'https://x.invalid').search);
  } catch {
    return null;
  }
}

/** The stored tag, if any. Never throws — storage can be denied. */
export function currentSource(): string | null {
  try {
    return sanitizeSource(globalThis.localStorage?.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Stores a tag. An invalid one clears rather than overwrites with junk. */
export function storeSource(raw: unknown): string | null {
  const value = sanitizeSource(raw);
  try {
    if (value) globalThis.localStorage?.setItem(STORAGE_KEY, value);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* storage denied: attribution is not worth breaking a page over */
  }
  return value;
}

/**
 * Remembers the tag from the current address bar, if there is one.
 *
 * Called on every route change rather than once at boot, because the tag can
 * arrive on `/demo` or on the signup link itself, and a learner who starts at
 * the demo is exactly the one whose channel we would otherwise lose.
 */
export function captureSourceFromSearch(search: string): string | null {
  const fromUrl = readSourceFromSearch(search);
  if (fromUrl) return storeSource(fromUrl);
  return currentSource();
}

/** Forgets the tag: sign-out and account deletion, where device state is wiped. */
export function clearSource(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * Whether this visit arrived on a link somebody SHARED, and which kind.
 *
 * The share link a learner sends carries their referral code in `ref`, so a
 * `ref` in the address bar at load is the receiving end of a `share_click`.
 * That is the whole measurement: without it, sharing can be counted only on the
 * sharer's device, and "does sharing bring anybody in" has no answer.
 *
 * Returns the marker, or `null` for a direct visit. The code itself is NOT
 * returned — it is a public handle, but it still identifies a person and has no
 * business in an analytics event.
 */
export function readShareMarkerFromSearch(search: string): 'referral' | null {
  try {
    const code = new URLSearchParams(search || '').get('ref');
    return typeof code === 'string' && code.trim() ? 'referral' : null;
  } catch {
    return null;
  }
}

/**
 * Adds the tag to a URL that leaves the app.
 *
 * The sales site forwards it to check-out, so a learner who was invited through
 * a channel does not lose it by buying. A malformed base URL is returned
 * unchanged rather than reassembled by string concatenation.
 */
export function withSource(url: string, source?: string | null): string {
  const tag = sanitizeSource(source) ?? currentSource();
  if (!tag) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('src', tag);
    return parsed.toString();
  } catch {
    return url;
  }
}
