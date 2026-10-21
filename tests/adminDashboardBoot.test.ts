import { JSDOM, VirtualConsole } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { handleAdminRoutes } from '../cloudflare-admin';

/**
 * The dashboard BOOTS.
 *
 * tests/adminDashboardRendered.test.ts parses the served scripts; this file runs
 * them in a real DOM, because "parses" is not the property that broke. A single
 * raw newline in a string literal killed the shell script before it reached the
 * `on(...)` calls at the bottom, so every button on /admin was dead and the page
 * looked frozen. Parsing a script proves nothing about whether the handlers at
 * the end of it attached — this file clicks the buttons.
 *
 * jsdom, not the vitest jsdom environment: a full page with four inline scripts
 * has to be constructed as its own document so the scripts execute in order.
 */

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

interface Booted {
  dom: JSDOM;
  scriptErrors: string[];
  window: Window & { __katzuAdminBoot?: boolean; showTab?: (tab: string) => void };
}

function boot(html: string): Booted {
  const scriptErrors: string[] = [];
  const virtualConsole = new VirtualConsole();
  // Anything the page throws while its scripts run lands here.
  virtualConsole.on('jsdomError', (err: Error) => scriptErrors.push(String(err?.message || err)));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://katzu.test/admin',
    pretendToBeVisual: true,
    virtualConsole,
  });
  // jsdom ships no fetch. 401 keeps the studio on its error path: this test has
  // no D1 behind it, only the question "did the buttons get wired up?".
  (dom.window as unknown as { fetch: unknown }).fetch = async () => ({ status: 401, json: async () => ({}) });
  return { dom, scriptErrors, window: dom.window as Booted['window'] };
}

const click = (win: Window, id: string) => {
  const node = win.document.getElementById(id);
  if (!node) throw new Error(`#${id} is not on the page`);
  node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
};

const cls = (win: Window, id: string) => win.document.getElementById(id)?.className ?? '';

describe('the served admin dashboard boots in a DOM', () => {
  it('runs every inline script to the last line, without throwing', async () => {
    const html = await renderDashboard();
    const { dom, scriptErrors, window } = boot(html);
    expect(scriptErrors).toEqual([]);
    // Set by the shell script's final statement — proof it reached the bottom,
    // i.e. every handler below the failure point was wired.
    expect(window.__katzuAdminBoot).toBe(true);
    dom.window.close();
  });

  it('switches views when a nav button is clicked', async () => {
    const { dom, window } = boot(await renderDashboard());
    click(window, 'nav-ai');
    expect(cls(window, 'view-ai')).toBe('');
    expect(cls(window, 'view-overview')).toBe('hidden');
    expect(cls(window, 'nav-ai')).toBe('active');
    expect(window.document.getElementById('page-title')?.textContent).toBe('AI Providers');
    click(window, 'nav-users');
    expect(cls(window, 'view-users')).toBe('');
    expect(cls(window, 'view-ai')).toBe('hidden');
    dom.window.close();
  });

  it('hides the AI panel when Content Studio is opened', async () => {
    const { dom, window } = boot(await renderDashboard());
    click(window, 'nav-ai');
    expect(cls(window, 'view-ai')).toBe('');
    click(window, 'nav-content');
    // The studio's tab list did not include "ai", so its own view became active
    // while the AI panel stayed visible underneath it.
    expect(cls(window, 'view-ai')).toBe('hidden');
    expect(cls(window, 'view-content')).toBe('');
    dom.window.close();
  });

  it('renders the codes report, and keeps a code label out of the HTML', async () => {
    const { dom, window } = boot(await renderDashboard());
    const hostile = '<img src=x onerror=alert(1)>';
    (window as unknown as { fetch: unknown }).fetch = async (url: string) => ({
      status: 200,
      json: async () =>
        String(url).includes('/admin/codes/report')
          ? { labels: [{ label: hostile, created: 3, activated: 1 }], totals: { created: 3, activated: 1 } }
          : {},
    });
    window.document.getElementById('admin-key')!.setAttribute('value', 'k');
    (window.document.getElementById('admin-key') as HTMLInputElement).value = 'k';
    click(window, 'save-key-btn');
    click(window, 'nav-licenses');
    await new Promise((resolve) => setTimeout(resolve, 30));

    const out = window.document.getElementById('codes-report')!;
    // It used to call a server-only escapeHtml(), throw a ReferenceError inside
    // a promise, and print "Report unavailable." forever.
    expect(out.textContent).not.toContain('unavailable');
    expect(out.querySelectorAll('table tr')).toHaveLength(2);
    expect(out.textContent).toContain('3');
    // The label is data, not markup: no element, and the raw text survives.
    expect(out.querySelector('img')).toBeNull();
    expect(out.textContent).toContain(hostile);
    dom.window.close();
  });

  it('raises a visible banner when the script cannot start', async () => {
    const html = await renderDashboard();
    // Reintroduce the original defect: a real newline inside a string literal,
    // which is what the template literal used to emit.
    const broken = html.replace('"Walk order (first = tried first):\\n"', '"Walk order (first = tried first):\n"');
    expect(broken).not.toBe(html);
    const { dom, window } = boot(broken);
    expect(window.__katzuAdminBoot).toBe(false);
    // The watchdog lives in its own, earlier script block, so it still runs.
    await new Promise((resolve) => setTimeout(resolve, 3300));
    const banner = window.document.querySelector('[role="alert"]');
    expect(banner?.textContent).toContain('did not start');
    dom.window.close();
  }, 10_000);
});
