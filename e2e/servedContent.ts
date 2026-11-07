import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { seedRows } from './harness';

/**
 * Seed the content a synced learner actually has.
 *
 * The suite's mocked `/scenarios` answers `[]`, so the app keeps only its small
 * offline seed (six rows, two of them in unit 1). Any spec that reads the unit
 * map therefore needs the served rows, or it measures missing data and blames
 * the layout. The coverage fixture supplies the ids and openers (it is the same
 * 49-row snapshot the unit gate checks); the authored catalogue supplies
 * titles, categories and icons, which the fixture omits.
 */
const REPO_ROOT = process.cwd();

interface ScenarioFixtureRow {
  id: string;
  [key: string]: unknown;
}

const SERVED = (
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'tests/fixtures/live-scenarios.json'), 'utf8')) as {
    scenarios: ScenarioFixtureRow[];
  }
).scenarios;

const CATALOGUE = (
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'docs/content/catalogue/scenarios-catalogue.json'), 'utf8')) as {
    scenarios: Array<Record<string, unknown>>;
  }
).scenarios;

export function servedScenarioRows(): Array<Record<string, unknown>> {
  const byId = new Map(CATALOGUE.map((row) => [row.id, row]));
  return SERVED.map((live) => {
    const authored = byId.get(live.id) ?? {};
    return {
      id: live.id,
      title_de: String(authored.title_de ?? ''),
      title_ar: String(authored.title_ar ?? ''),
      ai_persona: String(authored.ai_persona ?? ''),
      category: String(authored.category ?? ''),
      icon: String(authored.icon ?? 'message-square'),
      sequence_order: authored.sequence_order,
      initial_message_a0: live.initial_message_a0,
      initial_message_a1: live.initial_message_a1,
      initial_message_a2: live.initial_message_a2,
      initial_message_b1: live.initial_message_b1,
      initial_message_b2: live.initial_message_b2,
    };
  });
}

export async function seedServedContent(page: Page): Promise<void> {
  await seedRows(page, 'scenarios', servedScenarioRows());
}
