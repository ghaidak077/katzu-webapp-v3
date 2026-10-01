import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * V24 regression: the teacher-codes report table was written with
 * backslash-escaped quotes inside the dashboard's template literal. The
 * worker served them literally (`class=\"mono\"`), the browser's JS parser
 * hit `Unexpected identifier` on the inline script, and the WHOLE dashboard
 * went static — no key connect, no tabs, no lookups — because every handler
 * is wired at the bottom of that same script block. `node --check` on the
 * worker file passed (the template literal is valid JS), so the defect was
 * only visible in a browser. These tests parse the rendered HTML the way a
 * browser would.
 */

const html = readFileSync('cloudflare-admin.js', 'utf8').slice(
  readFileSync('cloudflare-admin.js', 'utf8').indexOf('<!DOCTYPE'),
);

function inlineScripts(source: string): string[] {
  const scripts: string[] = [];
  const re = /<script\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const start = match.index + match[0].length;
    const end = source.indexOf('</' + 'script>', start);
    if (end !== -1) scripts.push(source.slice(start, end));
  }
  return scripts;
}

describe('admin dashboard inline scripts parse in a browser (V24 regression)', () => {
  it('every rendered inline script is valid JavaScript', () => {
    const scripts = inlineScripts(html);
    expect(scripts.length).toBeGreaterThan(0);
    // new Function parses without executing — exactly the browser's parse step.
    for (const [i, script] of scripts.entries()) {
      expect(() => new Function(script), `inline script #${i} failed to parse`).not.toThrow();
    }
  });

  it('no served markup carries a backslash-escaped quote from the template literal', () => {
    expect(html).not.toMatch(/<[^>]*class=\\"/);
    expect(html).not.toMatch(/style=\\"/);
  });

  it('the dashboard still wires every handler, including the teacher-codes report', () => {
    expect(html).toContain('on("save-key-btn", saveKey)');
    expect(html).toContain('on("codes-report-btn", loadCodesReport)');
    expect(html).toContain("api(\"/admin/codes/report\")");
  });
});
