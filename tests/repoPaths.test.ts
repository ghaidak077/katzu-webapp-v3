import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** `existsSync` says a path exists; this says it is a folder. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Every file a test reads must exist, and must be named directly.
 *
 * WHY THIS IS A GATE AND NOT A NOTE
 * `tests/launchEvents.test.ts` read its input as
 * `src/features/analytics/../../lib/analytics/events.ts`. The directory
 * `src/features/analytics` does not exist — and that turned out not to matter
 * on Windows, which resolved the `..` chain anyway, while Linux CI threw
 * ENOENT on the very same checkout. The suite was green here and red there for
 * a full CI round-trip, with the failure pointing at an assertion rather than at
 * the path that caused it.
 *
 * The rule this pins is small: name the file you mean. Traversal through a
 * directory that is not there is a path that only works on one developer's
 * machine, and it fails in the one place where nobody is watching.
 */
describe('paths the test suite reads', () => {
  const testFiles = readdirSync('tests').filter((f) => f.endsWith('.ts'));

  /**
   * String literals handed to the suite's file-reading helpers, module-scope
   * free: the direct `readFileSync` call and the local wrappers named
   * `source` (launchEvents) and `read` (v33/v34/v40, interfaceContracts —
   * each resolves its argument against the repo root). Scanning only the
   * direct call is how the bug below hid once already: the broken path was
   * passed to a helper, the helper reached `readFileSync`, and this test —
   * which at the time looked only at `readFileSync` call sites — saw
   * nothing. The wrappers are the same call wearing a different name.
   */
  function literalPaths(file: string): string[] {
    const text = readFileSync(join('tests', file), 'utf8');
    return [...text.matchAll(/\b(?:readFileSync|source|read)\(\s*'([^']+)'\s*[,)]/g)]
      .map((m) => m[1])
      .filter((p) => !p.includes('${'));
  }

  it('found the suite it is meant to check', () => {
    expect(testFiles.length).toBeGreaterThan(50);
  });

  it('every literal path names a file that exists', () => {
    const missing: string[] = [];
    for (const file of testFiles) {
      for (const path of literalPaths(file)) {
        if (!existsSync(path)) missing.push(`${file} → ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no literal path traverses through a directory that is not there', () => {
    // The specific shape that cost a CI run. This has to walk the segments
    // ITSELF rather than ask the OS whether the path resolves: Windows happily
    // resolves `src/features/analytics/../..` even though `src/features/
    // analytics` does not exist, so an `existsSync(path)` check passes here
    // and the same checkout throws ENOENT on Linux CI. Every directory prefix
    // must be a real directory, checked one segment at a time.
    const broken: string[] = [];
    for (const file of testFiles) {
      for (const path of literalPaths(file)) {
        const segments = path.split('/');
        segments.pop(); // the file name itself; the walk below checks its folders
        let cursor = '';
        for (const segment of segments) {
          if (segment === '..') {
            cursor = cursor.slice(0, cursor.lastIndexOf('/'));
            if (cursor && !existsSync(cursor)) {
              broken.push(`${file} → ${path} (no directory "${cursor}")`);
              break;
            }
            continue;
          }
          cursor = cursor ? `${cursor}/${segment}` : segment;
          if (!existsSync(cursor) || !isDirectory(cursor)) {
            broken.push(`${file} → ${path} (no directory "${cursor}")`);
            break;
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('names no absolute or home-relative path', () => {
    // A literal `C:\\...` or `/Users/...` in a test is green on one machine and
    // missing on every other, which is the same failure wearing a different hat.
    const absolute: string[] = [];
    for (const file of testFiles) {
      for (const path of literalPaths(file)) {
        if (/^(?:[A-Za-z]:[\\/]|\/|~)/.test(path)) absolute.push(`${file} → ${path}`);
      }
    }
    expect(absolute).toEqual([]);
  });
});
