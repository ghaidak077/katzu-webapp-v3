import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as turnGuard from '../cloudflare-turn-guard.js';

/**
 * THE NO-AUTHORED-PERSONA GATE (2026-11-10).
 *
 * The practice chat used to own a script of persona lines: per-level re-asks,
 * acknowledgement prefixes, a trailing-question table, level fallback lines and
 * «Wie bitte?» fallbacks. Those produced bubbles the model never wrote, and a
 * bad turn looked like a worse conversation instead of a visible failure.
 *
 * This file is the structural half of the gate (the behavioural half is
 * `tests/noFallbackPersona.test.ts`): it fails if any of that text or any of
 * the guards that swapped it in comes back. A persona bubble may exist in
 * exactly two places — the shipped opener and a real model reply.
 */

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      out.push(...sourceFiles(full, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Comments are stripped before scanning: a comment may NAME the line that was
 * deleted (that is how the next reader learns what not to re-add), but no
 * executable string may contain it.
 */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const workerSources = readdirSync(ROOT)
  .filter((name) => name.startsWith('cloudflare-') && name.endsWith('.js'))
  .map((name) => ({ path: name, text: withoutComments(readFileSync(join(ROOT, name), 'utf8')) }));

const clientSources = sourceFiles(join(ROOT, 'src'), ['.ts', '.tsx']).map((full) => ({
  path: relative(ROOT, full).replace(/\\/g, '/'),
  text: withoutComments(readFileSync(full, 'utf8')),
}));

/** Every authored persona line this work deleted, verbatim. */
const DELETED_AUTHORED_LINES = [
  'Bitte sagen Sie etwas mehr',
  'Bitte sag etwas mehr',
  'Bitte sagen Sie mir etwas mehr',
  'Bitte erzählen Sie mir etwas mehr',
  'Bitte erzähl mir etwas mehr',
  'Schön, Sie zu sehen',
  'Freut mich, Sie zu sehen',
  'Und was möchten Sie?',
  'Und was machen Sie jetzt?',
  'Wir üben weiter',
  'Sprechen wir weiter',
  'Machen wir mit der Übung weiter',
  'Fahren wir mit dem Gespräch fort',
  'aber die Übung geht weiter',
];

describe('the roleplay guard module authors no persona line', () => {
  it('exports the opener selector and nothing else', () => {
    expect(Object.keys(turnGuard).sort()).toEqual(['openerForLevel']);
  });

  it('has no greeting, trailing-question or re-ask guard', () => {
    for (const name of ['guardGreetingReply', 'guardTrailingQuestion', 'sceneTopicReAsk', 'RE_ASK', 'ACK', 'TRAILING_QUESTION']) {
      expect((turnGuard as Record<string, unknown>)[name], name).toBeUndefined();
    }
  });

  it('still selects stored openers — the one allowed persona text', () => {
    const openers = { a1: 'Hallo! Was möchten Sie trinken?', a2: 'Guten Tag!' };
    expect(turnGuard.openerForLevel(openers, 'A1')).toBe('Hallo! Was möchten Sie trinken?');
    expect(turnGuard.openerForLevel(openers, 'B2')).toBe('Guten Tag!');
  });
});

describe('no deleted persona line survives anywhere in the worker or the client', () => {
  it('finds none of the removed template sentences', () => {
    const hits: string[] = [];
    for (const file of [...workerSources, ...clientSources]) {
      for (const line of DELETED_AUTHORED_LINES) {
        if (file.text.includes(line)) hits.push(`${file.path}: ${line}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('no longer imports the removed guards or the level fallback line', () => {
    const hits: string[] = [];
    for (const file of workerSources) {
      for (const symbol of ['guardGreetingReply', 'guardTrailingQuestion', 'levelFallbackLine', 'FALLBACK_LINES']) {
        if (file.text.includes(symbol)) hits.push(`${file.path}: ${symbol}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('a persona bubble can only be constructed in two places', () => {
  it('has exactly two KATZU construction sites, both in the conversation hook', () => {
    const sites = clientSources.flatMap((file) => {
      const lines = file.text.split('\n');
      return lines
        .map((line, index) => ({ file: file.path, lines, number: index + 1, line: line.trim() }))
        .filter((entry) => entry.line.includes("sender: 'KATZU'"));
    });
    expect(sites).toHaveLength(2);
    expect(new Set(sites.map((site) => site.file))).toEqual(
      new Set(['src/features/conversation/useLiveConversation.ts']),
    );

    // One is the shipped opener (data from the scenario row); one is the model's
    // own reply. No third site can appear without this test failing.
    const contexts = sites.map((site) =>
      site.lines.slice(Math.max(0, site.number - 12), site.number + 2).join('\n'),
    );
    expect(contexts.some((context) => context.includes("id: 'msg_initial'"))).toBe(true);
    expect(contexts.some((context) => context.includes('germanText: res.germanReply'))).toBe(true);
  });
});
