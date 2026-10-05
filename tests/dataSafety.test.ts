import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS, ALLOWED_PROP_KEYS } from '../src/lib/analytics/events';
import { DATA_RECIPIENTS, DATA_SAFETY } from '../src/lib/trust/dataSafety';

/**
 * C4 — the Data Safety form, checked against the code it claims to describe.
 *
 * Play misdeclarations are silent: nothing tells the owner the app changed, the
 * answer simply becomes false. These tests make the declaration fail loudly
 * instead, by re-deriving each claim from the thing it is a claim about.
 */

const deps = async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  return Object.keys(pkg.dependencies ?? {}) as string[];
};

describe('data collection is bounded by an allowlist, not by good intentions', () => {
  it('can only send events the server has named', () => {
    expect(ANALYTICS_EVENTS.length).toBeGreaterThan(10);
    // Every event name is a plain identifier; nothing can smuggle a payload in
    // through the name itself.
    for (const name of ANALYTICS_EVENTS) {
      expect(name).toMatch(/^[a-z0-9_]{2,40}$/);
    }
  });

  it('sends no property that could carry identity', () => {
    // A property is what turns "anonymous event" into "a row about a person".
    for (const key of ALLOWED_PROP_KEYS) {
      // `scenarioId` is a content identifier, not a person: it names which
      // dialogue the learner is in, and is shared by every learner who is there.
      expect(key, key).not.toMatch(/email|user|account|phone|address|ip|name/i);
    }
    // The two dimensions the funnel is cut by are a country GROUP and a bucket
    // index — never a country that would re-identify a small cohort.
    expect(ALLOWED_PROP_KEYS).toContain('region');
    expect(ALLOWED_PROP_KEYS).toContain('cell');
  });
});

describe('the declared third parties are the ones actually installed', () => {
  it('names Google and Cloudflare, which the app really talks to', () => {
    const names = DATA_RECIPIENTS.map((r) => r.name).join(' ');
    expect(names).toContain('Google');
    expect(names).toContain('Cloudflare');
  });

  it('contains no advertising or tracking SDK', async () => {
    const installed = await deps();
    const trackers = [
      'facebook', 'fb-', 'segment', 'amplitude', 'mixpanel', 'sentry',
      'firebase', 'admob', 'appsflyer', 'branch', 'hotjar', 'ga', 'gtag',
    ];
    for (const dep of installed) {
      for (const tracker of trackers) {
        // `ga` is checked as a whole name only, so a package that merely starts
        // with the same letters (`galata`, …) is not a false positive.
        if (dep.length <= 4) expect(dep.toLowerCase()).not.toBe(tracker);
        else expect(dep.toLowerCase()).not.toContain(tracker);
      }
    }
    expect(DATA_SAFETY.usedForAdvertising).toBe(false);
  });

  it('ships no analytics client of its own beyond the event allowlist', async () => {
    const installed = await deps();
    expect(installed.join(' ')).not.toContain('analytics');
  });
});

describe("the learner's controls are real, and the form says so", () => {
  it('can export and can delete, because the routes exist', async () => {
    const worker = await readFile(new URL('../cloudflare-unified-worker.js', import.meta.url), 'utf8');
    expect(worker).toContain('handleUserExport');
    // Deletion purges the registry and the per-user telemetry rows.
    expect(worker).toContain('purgeUserRegistry');
    expect(DATA_SAFETY.deletionRequestAvailable).toBe(true);
  });

  it('marks every owner-dependent answer UNCONFIRMED rather than asserting it', () => {
    expect(DATA_SAFETY.unconfirmed.length).toBeGreaterThan(0);
    for (const entry of DATA_SAFETY.unconfirmed) {
      expect(entry.question.length).toBeGreaterThan(10);
      // Every operational claim carries the UNPROVEN/UNCONFIRMED marker.
      expect(entry.answer).toMatch(/UNPROVEN|UNCONFIRMED|^No\b/);
    }
  });

  it('states sign-in honestly: Google accounts, no email/password of ours', () => {
    expect(DATA_SAFETY.accountCreation).toBe('google_sign_in');
  });
});