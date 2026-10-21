import { describe, expect, it } from 'vitest';
import { handleAdminRoutes } from '../cloudflare-admin';

/**
 * The admin dashboard AS THE BROWSER RECEIVES IT.
 *
 * Why this file exists: the dashboard is built inside a template literal, so a
 * backslash written once in the source arrives in the served page as a control
 * character. Four lines did that (`\n` inside a string, `\n` inside a regex),
 * which put a real newline inside a string/regex literal in the served page.
 * The browser's parser threw "Invalid or unexpected token", the WHOLE inline
 * script died, and every handler wired at the bottom of that script never
 * attached — no key connect, no tabs, no lookups. The page looked frozen.
 *
 * tests/adminDashboardHtml.test.ts reads the SOURCE file, so it could not see
 * this class of bug: the source is valid JavaScript, only the RENDERED page is
 * not. This file renders the real page and parses it the way a browser does.
 */

/** The dashboard shell's own script — the last inline block on the page. */
const SHELL_MARKER = 'REDEEM_TEMPLATE';

async function renderDashboard(): Promise<string> {
  const request = new Request('https://katzu.test/admin');
  const res = await handleAdminRoutes(
    new URL(request.url),
    request,
    {} as never,
    {} as never,
    { ensureTables: async () => true },
  );
  if (!res) throw new Error('the /admin route was not handled');
  return await res.text();
}

function inlineScripts(html: string): string[] {
  const scripts: string[] = [];
  const re = /<script\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const start = match.index + match[0].length;
    const end = html.indexOf('</' + 'script>', start);
    if (end !== -1) scripts.push(html.slice(start, end));
  }
  return scripts;
}

async function renderShell(): Promise<string> {
  const scripts = inlineScripts(await renderDashboard());
  const shell = scripts.find((s) => s.includes(SHELL_MARKER));
  if (!shell) throw new Error('the dashboard shell script was not found on the page');
  return shell;
}

describe('rendered admin dashboard (browser view)', () => {
  it('every inline script of the served page parses', async () => {
    const scripts = inlineScripts(await renderDashboard());
    expect(scripts.length).toBeGreaterThanOrEqual(3);
    // new Function parses without executing — exactly the browser's parse step.
    scripts.forEach((source, i) => {
      expect(() => new Function(source), `inline script #${i} failed to parse`).not.toThrow();
    });
  });

  it('keeps its line breaks as escapes instead of raw newlines', async () => {
    const shell = await renderShell();
    // The browser must receive the two-character escape, not a control char.
    expect(shell).toContain('"Walk order (first = tried first):\\n"');
    expect(shell).toContain('"\\nsample: "');
    // ...and the same for the key-list pattern.
    expect(shell).toContain('split(/[,;\\r\\n]+/)');
  });

  it('splits a pasted key list on commas, semicolons and line breaks, in one place', async () => {
    const shell = await renderShell();
    expect(shell).toContain('function aipParseKeys(raw)');
    expect(shell).toContain('body.keys = aipParseKeys(keysRaw);');
    expect(shell).toContain('bodyD.keys = aipParseKeys(keysRaw);');
  });

  it('reads the key fingerprint under the name the worker sends', async () => {
    const shell = await renderShell();
    // The worker answers with `testedKey`; the dashboard used to read
    // `testingKey`, so the fingerprint never appeared.
    expect(shell).toContain('r.testedKey');
    expect(shell).not.toContain('r.testingKey');
  });

  it('sends "Clear keys" for a custom entry too', async () => {
    const shell = await renderShell();
    expect(shell).toContain('body.clearKeys = true;');
    expect(shell).toContain('delete body.keys;');
    expect(shell).toContain('aipResetPending();');
  });

  it('every tab has a nav button and a view', async () => {
    const html = await renderDashboard();
    for (const tab of ['overview', 'users', 'activity', 'errors', 'licenses', 'ai', 'content', 'schema']) {
      expect(html, `view-${tab}`).toContain(`id="view-${tab}"`);
      expect(html, `nav-${tab}`).toContain(`id="nav-${tab}"`);
    }
  });

  it("the studio's tab list knows the AI view, so it hides with the others", async () => {
    const html = await renderDashboard();
    expect(html).toContain(
      'var TABS = ["overview", "users", "activity", "errors", "licenses", "ai", "content", "schema"]',
    );
  });

  it('every statically wired handler id exists on the page', async () => {
    const html = await renderDashboard();
    const wired = [...html.matchAll(/\bon\("([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(wired.length).toBeGreaterThan(10);
    for (const id of wired) expect(html, id).toContain(`id="${id}"`);
  });

  it('every element the shell looks up exists on the page', async () => {
    const html = await renderDashboard();
    const shell = await renderShell();
    const looked = [...shell.matchAll(/getElementById\("([a-zA-Z0-9_-]+)"\)/g)].map((m) => m[1]);
    expect(looked.length).toBeGreaterThan(20);
    // #content-type and #content-out belong to the retired JSON dump; the
    // studio replaced loadContent() with a no-op and those inputs are gone.
    const retired = new Set(['content-type', 'content-out']);
    for (const id of looked) {
      if (retired.has(id)) continue;
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it('client code never calls a server-only helper', async () => {
    const scripts = inlineScripts(await renderDashboard());
    for (const source of scripts) {
      // escapeHtml() exists on the server only; calling it in the browser
      // threw a ReferenceError and the codes report always read
      // "Report unavailable."
      expect(source, 'client code calls the server-only HTML escaper').not.toMatch(/escapeHtml\s*\(/);
    }
  });

  it('fetches the codes report with the Licenses tab, not before a key exists', async () => {
    const shell = await renderShell();
    expect(shell).toContain('else if (state.tab === "licenses") loadCodesReport();');
    // Exactly one call site left: the Licenses dispatch in refreshTab(). The
    // page-load call is gone — without a key it 401s and raised a bogus
    // "Unauthorized" toast.
    const calls = shell.match(/loadCodesReport\(\);/g) || [];
    expect(calls.length).toBe(1);
  });

  it('builds the codes report with DOM nodes, never with innerHTML', async () => {
    const shell = await renderShell();
    expect(shell).toContain('out.appendChild(table);');
    expect(shell).not.toContain('out.innerHTML =');
  });

  it('tells the owner the page is dead instead of freezing silently', async () => {
    const html = await renderDashboard();
    const scripts = inlineScripts(html);
    // The watchdog must be its OWN block that runs BEFORE the shell: a parse
    // error in the shell is exactly the case where the shell cannot report it.
    const watchdogAt = scripts.findIndex((s) => s.includes('__katzuAdminBooted'));
    const shellAt = scripts.findIndex((s) => s.includes(SHELL_MARKER));
    expect(watchdogAt).toBeGreaterThanOrEqual(0);
    expect(watchdogAt).toBeLessThan(shellAt);
    // ...and the shell must actually clear it once every handler is wired.
    expect(scripts[shellAt]).toContain('window.__katzuAdminBooted()');
  });

  it('says it is not connected before a key is entered', async () => {
    const html = await renderDashboard();
    expect(html).toMatch(/id="key-state"[^>]*>not connected/);
  });
});
