/**
 * The dictionary answer for a word the shipped glossary does not know (V30).
 *
 * Why this is its own module: `workerClient.ts` is the app's largest file and sits
 * under a 1900-line budget the gate enforces (`tests/codeBudgets.test.ts`). This
 * code is a self-contained concern — key folding, a bounded local cache, and one
 * request — so it lives here and `workerClient` keeps a three-line method.
 *
 * The AI-call story it belongs to: every word of every scenario opener is answered
 * from the bundle with no network at all (`wordGloss.ts`). This is the LAST resort,
 * for a word outside that data. The server keys its cache by lemma, so the second
 * learner who asks for an inflected form of a word pays nothing — and the device
 * mirror means the second tap on the same device does not even hit the network.
 */

export type LexemeEntry = { ar: string; pos: string; level: string; lemma: string };

export type LexemeLookupResult =
  | ({ ok: true } & LexemeEntry)
  | { ok: false; code: string; error: string };

const LEXEME_CACHE_KEY = 'katzu_lexeme_cache_v1';
const LEXEME_CACHE_LIMIT = 400;

const ARTICLES = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer)\s+/;

/** The lookup key: lowercase, article dropped, letters and hyphens only. */
export function lexemeLocalKey(word: string): string {
  return String(word || '')
    .toLowerCase()
    .replace(ARTICLES, '')
    .replace(/[^a-zäöüß\-]/g, '')
    .slice(0, 48);
}

/**
 * The stem the local cache is keyed by. Repeated stripping (max three) rather than
 * one pass, for the same asymmetric case the server has: «deutschlernens» loses
 * only `s` in one pass while «deutschlernen» loses `en`, which would be two
 * entries for one word.
 */
export function lexemeStemKey(key: string): string {
  let stem = key;
  for (let i = 0; i < 3; i += 1) {
    const next = stem.replace(/(en|es|e|s|n)$/, '');
    if (next === stem || next.length < 3) break;
    stem = next;
  }
  return stem;
}

function readStore(): Record<string, LexemeEntry> {
  try {
    const raw = localStorage.getItem(LEXEME_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readLexemeCache(word: string): LexemeEntry | null {
  const key = lexemeStemKey(lexemeLocalKey(word));
  if (!key) return null;
  const entry = readStore()[key];
  return entry && typeof entry.ar === 'string' && entry.ar.trim() ? entry : null;
}

export function writeLexemeCache(word: string, entry: LexemeEntry): void {
  const key = lexemeStemKey(lexemeLocalKey(word));
  if (!key) return;
  try {
    const store = readStore();
    store[key] = entry;
    const keys = Object.keys(store);
    if (keys.length > LEXEME_CACHE_LIMIT) {
      for (const old of keys.slice(0, keys.length - LEXEME_CACHE_LIMIT)) delete store[old];
    }
    localStorage.setItem(LEXEME_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* full or disabled storage: the server cache still answers */
  }
}

/**
 * Local cache first, then ONE server lookup (which caches fleet-wide).
 *
 * `fetchJson` is injected so this module owns no transport policy: the caller's
 * timeout, headers and 401 handling stay in `workerClient`, exactly as they are for
 * every other endpoint.
 */
export async function lookupLexeme(
  word: string,
  cefrLevel: string,
  fetchJson: (word: string, level: string) => Promise<{ status: number; body: any }>,
): Promise<LexemeLookupResult> {
  const key = lexemeLocalKey(word);
  if (!key) return { ok: false, code: 'BAD_WORD', error: 'لم نتعرف على كلمة ألمانية هنا.' };

  const cached = readLexemeCache(word);
  if (cached) return { ok: true, ...cached };

  try {
    const { status, body } = await fetchJson(key, cefrLevel);
    if (status >= 200 && status < 300 && typeof body?.ar === 'string' && body.ar.trim()) {
      const entry: LexemeEntry = {
        ar: String(body.ar).trim(),
        pos: String(body.pos || ''),
        level: String(body.level || cefrLevel),
        lemma: String(body.lemma || key),
      };
      writeLexemeCache(word, entry);
      return { ok: true, ...entry };
    }
    if (status === 429) return { ok: false, code: 'RATE_LIMITED', error: 'وصلت إلى الحد الآن. جرّب بعد دقيقة.' };
    if (status === 401) return { ok: false, code: 'UNAUTHENTICATED', error: 'سجّل الدخول من جديد ليُبحث عن الكلمة.' };
    return { ok: false, code: 'NO_ANSWER', error: 'لم نجد معنى هذه الكلمة. جرّب صيغة أخرى أو أعد المحاولة.' };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', error: 'تعذر الوصول إلى الخادم. أعد المحاولة عند عودة الاتصال.' };
  }
}
