import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The content studio is plain DOM code served straight to the browser, so the
 * only thing standing between a CSV cell and an injected `<script>` is the way
 * the panel writes values. These checks are structural on purpose: they fail if
 * a future edit starts building markup from data, which no amount of server
 * validation can make safe.
 */

const app = readFileSync('admin-worker/public/app.js', 'utf8');
const html = readFileSync('admin-worker/public/index.html', 'utf8');
const css = readFileSync('admin-worker/public/styles.css', 'utf8');

describe('the content panel never builds markup from data', () => {
  it('does not use innerHTML, insertAdjacentHTML or document.write anywhere', () => {
    for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
      expect(app.includes(forbidden), `${forbidden} must not appear in app.js`).toBe(false);
    }
  });

  it('writes operator and row text through textContent', () => {
    expect(app).toContain('node.textContent = props[key]');
    expect(app).toContain('el("div", { dir: "ltr", text: entry.key })');
  });

  it('renders Arabic fields right-to-left but the row key left-to-right', () => {
    expect(app).toContain('/_ar$/.test(column.name)');
    expect(app).toContain('field.setAttribute("dir", "rtl")');
  });
});

describe('the content panel exposes every documented action', () => {
  const ids = [
    'content-type',
    'content-status',
    'content-level',
    'content-scenario',
    'content-q',
    'content-apply',
    'content-new',
    'content-publish-all',
    'content-export-csv',
    'content-export-json',
    'content-list',
    'content-editor',
    'content-save',
    'content-publish',
    'content-discard',
    'content-diff',
    'content-history',
    'content-import-dry',
    'content-import-apply',
    'content-backup-now',
    'content-backup-download',
    'bundled-kind',
    'bundled-q',
    'bundled-apply',
    'bundled-export',
  ];
  it('has an element for each control and a handler for each button', () => {
    for (const id of ids) {
      expect(html.includes(`id="${id}"`), `index.html is missing #${id}`).toBe(true);
    }
    const wired = [
      'content-type',
      'content-apply',
      'content-new',
      'content-publish-all',
      'content-export-csv',
      'content-export-json',
      'content-save',
      'content-discard',
      'content-publish',
      'content-import-dry',
      'content-import-apply',
      'content-backup-now',
      'content-backup-download',
      'bundled-apply',
      'bundled-kind',
      'bundled-export',
    ];
    for (const id of wired) {
      expect(app.includes(`$("${id}").addEventListener`), `app.js does not wire #${id}`).toBe(true);
    }
  });

  it('styles the new blocks instead of shipping unstyled markup', () => {
    for (const selector of ['.fields', '.field', '.actions', 'details.block', '.scroll-x']) {
      expect(css.includes(selector), `styles.css is missing ${selector}`).toBe(true);
    }
  });
});
