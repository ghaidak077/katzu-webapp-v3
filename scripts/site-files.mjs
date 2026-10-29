/**
 * The files a build writes besides pages: the one 301 table, and the emitter that
 * keeps `website/` honest about what this build produced.
 *
 * Split out of `build-website.mjs` on 2026-10-29 when that shell crossed the
 * 500-line script budget (`tests/codeBudgets.test.ts`). Nothing here knows about
 * pages or copy; it takes the output directory as an argument.
 */

import { mkdirSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/* ------------------------------------------------------------------ */
/* redirects / 404 — robots, sitemap and llms.txt come from site-seo   */
/* ------------------------------------------------------------------ */

/**
 * Old site URLs, one 301 each, straight to the final section. No rule points at
 * another redirect: a chain costs a round trip and hides the real target from a
 * crawler. Every fragment below exists on its target page.
 */
export function redirectsTxt() {
  return `# The site is three pages now: /, /pricing, /help. Every old URL answers
# with ONE 301 to its final target — no chain, no second hop.
/how-it-works /#app 301
/how-it-works/ /#app 301
/who-its-for /#faq 301
/who-its-for/ /#faq 301
/compare /#faq 301
/compare/ /#faq 301
/use-cases/moving-to-germany /#rail 301
/use-cases/* /#rail 301
/faq /help#faq 301
/faq/ /help#faq 301
/about /help#about 301
/about/ /help#about 301
/privacy /help#privacy 301
/terms /help#terms 301
/refund /help#refund 301
/trust/privacy /help#privacy 301
/trust/terms /help#terms 301
/trust/refund /help#refund 301
/trust/contact /help#contact 301
/trust/imprint /help#about 301
/trust/* /help 301
/en / 301
/en/pricing /pricing 301
/en/faq /help#faq 301
/en/about /help#about 301
/en/how-it-works /#app 301
/en/who-its-for /#faq 301
/en/compare /#faq 301
/en/use-cases/moving-to-germany /#rail 301
/en/trust/privacy /help#privacy 301
/en/trust/terms /help#terms 301
/en/trust/refund /help#refund 301
/en/* /  301
`;
}

/* ------------------------------------------------------------------ */
/* Emit                                                               */
/* ------------------------------------------------------------------ */

export function emit(outDir, rel, content) {
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return rel;
}

/**
 * Delete every generated page this build no longer writes, in both flavours:
 * the `.html` and its markdown twin under `md/`. A removed guide must not leave
 * a markdown file behind that the negotiated URL would still serve.
 */
export function pruneStaleHtml(outDir, keep) {
  const removed = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.html') && !(entry.endsWith('.md') && dir.startsWith(join(outDir, 'md')))) continue;
      const rel = relative(outDir, full).replace(/\\/g, '/');
      if (keep.has(rel)) continue;
      unlinkSync(full);
      removed.push(rel);
    }
  };
  walk(outDir);
  // Empty directories are stale too: `use-cases/` and `trust/` must not linger.
  const dropEmpty = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (!statSync(full).isDirectory()) continue;
      if (full === join(outDir, 'assets')) continue;
      dropEmpty(full);
      if (readdirSync(full).length === 0) rmdirSync(full);
    }
  };
  dropEmpty(outDir);
  return removed;
}
