import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * APP-MAP.md is load-bearing (`AGENTS.md` §12): the next run — possibly a weaker
 * model — navigates off it instead of the source tree. A map that has quietly
 * drifted is worse than no map, because it is trusted. This guard makes drift a
 * named failing test instead of a discovery two runs later.
 *
 * It compares four things in both directions (in the map but not the code, and in
 * the code but not the map):
 *
 *   routes    <Route path="…"> in src/App.tsx      ↔ §14 `appmap-routes`
 *   screens   src/**\/*Screen.tsx                  ↔ §14 `appmap-screens`
 *   endpoints url.pathname dispatch in the worker  ↔ §14 `appmap-endpoints`
 *   tables    CREATE TABLE IF NOT EXISTS in worker ↔ §14 `appmap-tables`
 *
 * Honest limits: the endpoint extractor understands the two dispatch styles the
 * worker actually uses (`=== "path"`, `startsWith("prefix")`) plus the one admin
 * CRUD regex. A future route written in a third style would be invisible to it —
 * so the extractors are also asserted to be non-vacuous (an anchor must be found),
 * and a synthetic-divergence test proves the comparison can fail. Comparison
 * normalises path params (`:scenarioId` ≡ `:param`) because the map uses short
 * names and the code uses route-specific ones.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const appMap = readFileSync(join(root, 'docs', 'agent', 'APP-MAP.md'), 'utf8');
const appSource = readFileSync(join(root, 'src', 'App.tsx'), 'utf8');
const workerSource = readFileSync(join(root, 'cloudflare-unified-worker.js'), 'utf8');

/** One fenced ```` ```name ```` block from APP-MAP, as trimmed non-comment lines. */
export function manifestBlock(doc: string, name: string): string[] {
  const match = doc.match(new RegExp('```' + name + '\\r?\\n([\\s\\S]*?)```'));
  if (!match) throw new Error(`APP-MAP.md is missing the \`${name}\` manifest block`);
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** `:scenarioId` and `:tab` are the same shape to a comparison. */
export function normaliseRoute(route: string): string {
  return route.replace(/:[A-Za-z0-9_]+/g, ':param');
}

/** Every `<Route … path="…">` in App.tsx, normalised and deduped. */
export function codeRoutes(source: string): string[] {
  const found = [...source.matchAll(/<Route\b[^>]*\bpath="([^"]+)"/g)].map((m) => normaliseRoute(m[1]));
  return [...new Set(found)].sort();
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Every `*Screen.tsx` under src/, as repo-relative POSIX paths. */
export function codeScreens(srcDir: string): string[] {
  return walk(srcDir)
    .filter((path) => path.endsWith('Screen.tsx'))
    .map((path) => relative(root, path).split(sep).join('/'))
    .sort();
}

/**
 * The worker's HTTP surface, from the dispatch itself.
 * `startsWith("/x/")` becomes `/x/*`; the admin CRUD regex alternatives expand
 * to `/admin/<table>`.
 */
export function codeEndpoints(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(/url\.pathname === "([^"]+)"/g)) out.add(m[1]);
  // Exclude the negative guard (`!url.pathname.startsWith("/admin")`), which is
  // a security check, not a route the worker serves.
  for (const m of source.matchAll(/(?<!!)url\.pathname\.startsWith\("([^"]+)"\)/g)) out.add(`${m[1]}*`);
  for (const m of source.matchAll(/url\.pathname\.match\(\/\^\\\/admin\\\/\(([^)]+)\)/g)) {
    for (const alternative of m[1].split('|')) out.add(`/admin/${alternative}`);
  }
  return [...out].sort();
}

/** Every `CREATE TABLE IF NOT EXISTS <name>` across all cloudflare-*.js. */
export function codeTables(repoRoot: string): string[] {
  const out = new Set<string>();
  for (const file of readdirSync(repoRoot).filter((name) => /^cloudflare-.*\.js$/.test(name))) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    for (const m of source.matchAll(/CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      out.add(m[1]);
    }
  }
  return [...out].sort();
}

/** What a divergence looks like, for the failure message. */
export function divergence(code: string[], map: string[]): { missingFromMap: string[]; missingFromCode: string[] } {
  const codeSet = new Set(code);
  const mapSet = new Set(map);
  return {
    missingFromMap: code.filter((entry) => !mapSet.has(entry)),
    missingFromCode: map.filter((entry) => !codeSet.has(entry)),
  };
}

function expectNoDivergence(label: string, code: string[], map: string[]): void {
  const { missingFromMap, missingFromCode } = divergence(code, map);
  expect(
    { missingFromMap, missingFromCode },
    `${label}: APP-MAP §14 disagrees with the code.\n` +
      `  in code, absent from the map (add to APP-MAP): ${missingFromMap.join(', ') || '—'}\n` +
      `  in the map, absent from the code (remove from APP-MAP): ${missingFromCode.join(', ') || '—'}`,
  ).toEqual({ missingFromMap: [], missingFromCode: [] });
}

describe('APP-MAP stays true to the code', () => {
  it('carries all four manifest blocks', () => {
    // A missing block must fail loudly, not skip the check.
    for (const name of ['appmap-routes', 'appmap-screens', 'appmap-endpoints', 'appmap-tables']) {
      expect(manifestBlock(appMap, name).length, `${name} is empty`).toBeGreaterThan(0);
    }
  });

  it('routes: App.tsx ↔ appmap-routes', () => {
    expectNoDivergence('routes', codeRoutes(appSource), manifestBlock(appMap, 'appmap-routes').map(normaliseRoute).sort());
  });

  it('screens: src/**/*Screen.tsx ↔ appmap-screens', () => {
    expectNoDivergence('screens', codeScreens(join(root, 'src')), manifestBlock(appMap, 'appmap-screens').sort());
  });

  it('endpoints: the worker dispatch ↔ appmap-endpoints', () => {
    expectNoDivergence('endpoints', codeEndpoints(workerSource), manifestBlock(appMap, 'appmap-endpoints').sort());
  });

  it('tables: worker CREATE TABLE ↔ appmap-tables', () => {
    expectNoDivergence('tables', codeTables(root), manifestBlock(appMap, 'appmap-tables').sort());
  });
});

describe('the guard itself is real (not a vacuous pass)', () => {
  it('extracts the anchors the extractors exist for', () => {
    // If a refactor moves the dispatch so the regexes match nothing, the set
    // comparisons above would compare two empty-ish lists and pass. Name the
    // anchors instead.
    expect(codeRoutes(appSource)).toContain('/session-report');
    expect(codeRoutes(appSource)).toContain('/scenario/:param/live');
    expect(codeEndpoints(workerSource)).toContain('/ai/turn');
    expect(codeEndpoints(workerSource)).toContain('/scenarios/*');
    expect(codeEndpoints(workerSource)).toContain('/admin/starter_phrases');
    expect(codeScreens(join(root, 'src'))).toContain('src/features/conversation/LiveConversationScreen.tsx');
    expect(codeTables(root)).toContain('sync_revisions');
    expect(manifestBlock(appMap, 'appmap-endpoints')).toContain('/ai/turn');
  });

  it('reports a divergence when one is introduced', () => {
    const routes = manifestBlock(appMap, 'appmap-routes').map(normaliseRoute);
    const dropped = routes.filter((route) => route !== '/session-report');
    const { missingFromMap, missingFromCode } = divergence(codeRoutes(appSource), dropped);
    expect(missingFromMap).toEqual(['/session-report']);
    expect(missingFromCode).toEqual([]);

    const invented = [...routes, '/app/does-not-exist'];
    const other = divergence(codeRoutes(appSource), invented);
    expect(other.missingFromCode).toEqual(['/app/does-not-exist']);
  });

  it('normalises path params instead of overfitting to one spelling', () => {
    expect(normaliseRoute('/scenario/:scenarioId/live')).toBe('/scenario/:param/live');
    expect(normaliseRoute('/app/:tab')).toBe('/app/:param');
    expect(normaliseRoute('/')).toBe('/');
  });

  it('lets the endpoint extractor see both dispatch styles', () => {
    const sample = 'if (url.pathname === "/a") {} if (url.pathname.startsWith("/b/")) {}';
    expect(codeEndpoints(sample)).toEqual(['/a', '/b/*']);
  });
});

/**
 * No shipped code may hardcode a production hostname.
 *
 * `robots.txt` and `sitemap.xml` used to be checked-in files holding
 * `https://katzu.app`, a host that does not resolve, and the sitemap listed
 * `/privacy` and `/terms` — routes the app does not have. Both are now generated
 * from `VITE_PUBLIC_APP_URL` by a build plugin. This test is the gate that stops
 * a literal creeping back into the bundle, where it would advertise a dead
 * domain to every crawler and share card.
 *
 * Comments and doc prose are excluded: naming the domain in a comment is how this
 * bug gets *explained*, and `guest@katzu.app` is an email, not a URL.
 */
describe('no hardcoded production hostname ships', () => {
  const root = join(fileURLToPath(new URL('..', import.meta.url)));
  const URL_LITERAL = /https?:\/\/katzu\.app\b/g;

  function shippedFiles(dir: string): string[] {
    return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return shippedFiles(full);
      return /\.(ts|tsx|html|json|webmanifest|txt|xml)$/.test(entry.name) ? [full] : [];
    });
  }

  function codeOnly(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  it('finds no https://katzu.app literal in shipped app code', () => {
    const offenders: string[] = [];
    for (const file of ['src', 'public'].flatMap(shippedFiles).concat('index.html')) {
      const text = codeOnly(readFileSync(join(root, file), 'utf8'));
      if (URL_LITERAL.test(text)) offenders.push(file);
      URL_LITERAL.lastIndex = 0;
    }
    expect(offenders).toEqual([]);
  });

  it('generates robots.txt and sitemap.xml instead of shipping static copies', () => {
    // A checked-in copy is what drifted; if one reappears the generator is bypassed.
    for (const name of ['robots.txt', 'sitemap.xml']) {
      expect(() => readFileSync(join(root, 'public', name), 'utf8')).toThrow();
    }
    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    expect(config).toContain('katzu-public-origin-files');
    // The routes the sitemap advertises must actually exist as /trust/* routes.
    expect(config).toContain('/trust/privacy');
    expect(config).not.toMatch(/'\/privacy'/);
  });
});
