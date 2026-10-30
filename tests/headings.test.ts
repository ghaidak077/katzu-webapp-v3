import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A heading must still read as words when a search engine strips its tags.
 *
 * WHY THIS EXISTS
 * The home H1 was two block-level spans with no whitespace between them
 * (`...تُتعلَّم</span></span><span>بالتحدّث...`), so an SEO checker that extracts text by removing tags read
 * it as one fused word — «تُتعلَّمبالتحدّث» — and reported the page's most important string as broken. The
 * block layout looked perfect in a browser, which is exactly why nobody noticed: only the extracted text
 * was wrong. The same happens with `<br>` (and any tag run) that has a letter on both sides and no
 * whitespace, so the rule below is about the markup, not about this one heading.
 *
 * THE RULE
 * Split the heading into tags and text; for every run of tags, if the last character before it and the
 * first character after it are both letters or digits, the extraction fuses them. Whitespace on either side
 * (a newline between two block spans is invisible and costs nothing) is the fix.
 *
 * Checks the built pages and their markdown twins: the markdown is derived from each page's `<main>`, so a
 * fused heading would reach an assistant that never sees the HTML.
 */
const root = join(__dirname, '..');

const builtPages = (dir = 'website'): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return ['assets', 'functions'].includes(entry.name) ? [] : builtPages(rel);
    return /\.(html|md)$/.test(entry.name) ? [rel] : [];
  });

/** As a text extractor sees it: the tags go, the text between them stays. */
const extract = (markup: string): string => markup.replace(/<[^>]*>/g, '');

const READABLE = /[\p{L}\p{N}]/u;

function fusedJoins(inner: string): string[] {
  const parts = inner.split(/(<[^>]*>)/).filter((part) => part !== '');
  const joins: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (!parts[i].startsWith('<')) continue;
    const before = parts[i - 1];
    if (before === undefined || before.startsWith('<')) continue; // nothing to its left
    let k = i + 1;
    while (k < parts.length && parts[k].startsWith('<')) k += 1; // the whole tag run
    const after = parts[k];
    if (after === undefined) continue;
    const tail = before.slice(-1);
    const head = after.slice(0, 1);
    if (READABLE.test(tail) && READABLE.test(head) && !/\s/.test(tail) && !/\s/.test(head)) {
      joins.push(`${before.slice(-20)}\u2022${after.slice(0, 20)}`);
    }
  }
  return joins;
}

const headingsOf = (file: string): Array<{ label: string; inner: string }> => {
  const text = readFileSync(join(root, file), 'utf8');
  if (file.endsWith('.md')) {
    return text
      .split('\n')
      .filter((line) => /^#{1,6} /.test(line))
      .map((line, i) => ({ label: `md heading ${i + 1}`, inner: line.replace(/^#{1,6} /, '') }));
  }
  return [...text.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match, i) => ({
    label: `${match[1]} #${i + 1}`,
    inner: match[2],
  }));
};

describe('headings survive tag-stripping text extraction', () => {
  it('no heading or markdown heading fuses two words at a tag boundary', () => {
    const files = builtPages();
    const offenders: string[] = [];
    let headings = 0;

    for (const file of files) {
      for (const { label, inner } of headingsOf(file)) {
        headings += 1;
        const joins = fusedJoins(inner);
        if (joins.length) offenders.push(`${file} ${label}: "${extract(inner).trim().slice(0, 70)}" (${joins.join(' ;; ')})`);
      }
    }

    // A stale walk or selector must fail loudly rather than pass on nothing.
    expect(headings, 'no headings were inspected — the scan is not looking where the pages are').toBeGreaterThan(40);
    expect(
      offenders,
      `a tag with a letter on both sides and no whitespace fuses two words when tags are stripped — put real whitespace between the parts (a newline between block spans is invisible):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the home H1 reads as its five words', () => {
    const h1 = readFileSync(join(root, 'website/index.html'), 'utf8').match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? '';
    expect(extract(h1).trim().split(/\s+/), 'the home H1 fused on extraction').toHaveLength(5);
    expect(fusedJoins(h1)).toEqual([]);
  });
});
