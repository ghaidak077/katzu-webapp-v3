import type { CEFRLevel } from '@/types/models';

// Deterministic daily-mission rotation. Same day = same mission for everyone;
// each new day moves to the next scenario in a stable per-level pool.
// Pure logic so it can be unit-tested without a database.

export interface MissionScenario {
  id: string;
  title_de: string;
  title_ar: string;
  category: string;
}

export interface DailyMission {
  scenario: MissionScenario;
  dayIndex: number; // days since epoch (local)
  position: number; // 1-based position in the rotation cycle
  cycleLength: number; // pool size for this level
}

const EPOCH_DATE = new Date(2026, 0, 1); // local 2026-01-01: dayIndex 0

export function dayIndexFor(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const epoch = new Date(EPOCH_DATE.getFullYear(), EPOCH_DATE.getMonth(), EPOCH_DATE.getDate());
  return Math.floor((start.getTime() - epoch.getTime()) / 86400000);
}

/**
 * Pick today's mission from the given scenario pool for a CEFR level.
 * Deterministic: same inputs always yield the same mission, so the featured
 * card never flickers between renders or devices on the same day.
 */
export function pickDailyMission(
  scenarios: MissionScenario[],
  level: CEFRLevel,
  date: Date = new Date(),
): DailyMission | null {
  const dayIndex = dayIndexFor(date);
  const byLevel = scenarios
    .filter((s) => s.category)
    .sort((a, b) => a.id.localeCompare(b.id));

  const pool = byLevel.length > 0 ? byLevel : scenarios.slice();
  if (pool.length === 0) return null;

  const position = ((dayIndex % pool.length) + pool.length) % pool.length; // safe modulo
  const scenario = pool[position];
  return {
    scenario,
    dayIndex,
    position: position + 1,
    cycleLength: pool.length,
  };
}
