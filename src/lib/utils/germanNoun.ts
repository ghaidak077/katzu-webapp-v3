/**
 * German noun phrases, composed once so no screen doubles the article.
 *
 * Two shapes coexist in the vocabulary data. Most rows keep the noun bare and
 * the article in the `article` column ("Reisepass" + "der"), but some rows store
 * the article inside `german` as well ("der Reisepass") and set `article` too.
 * Writing `${article} ${german}` then renders "der der Reisepass" — a German
 * grammar error shown on the very articles the learner is studying, and, in the
 * review queue, an expected answer that marks the correct answer wrong.
 *
 * Every surface that shows, speaks or grades a noun phrase goes through here, so
 * the two shapes render identically and the rule lives in one place instead of
 * once per screen.
 */

/** A leading definite or indefinite article, with the space after it. */
const LEADING_ARTICLE = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)\s+/i;

/**
 * The bare noun: a leading article already stored inside `german` is removed, so
 * a screen that shows the article separately (a der/die/das chip) never shows it
 * twice.
 */
export function germanHeadword(german: string | null | undefined): string {
  return String(german ?? '')
    .trim()
    .replace(LEADING_ARTICLE, '')
    .trim();
}

/**
 * The full noun phrase: the article plus the bare noun, never doubled. With no
 * article column set, what is stored in `german` is returned unchanged, so a
 * phrase that legitimately carries its own article keeps it.
 */
export function germanNounPhrase(
  article: string | null | undefined,
  german: string | null | undefined,
): string {
  const base = String(german ?? '').trim();
  if (!base) return '';
  const art = String(article ?? '').trim();
  if (!art) return base;
  return `${art} ${germanHeadword(base)}`;
}
