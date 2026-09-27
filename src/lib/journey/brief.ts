/**
 * The mission brief, handed from Journey Home to the episode screens.
 *
 * Journey Home is the only screen that decides *why* today's mission is today's;
 * Story Setup then has to say it back to the learner in the same words. Passing
 * it through sessionStorage (exactly like the session summary already is) keeps a
 * single decision and a single explanation, and survives a reload mid-episode.
 * Absent or corrupt data simply yields no brief — the story screen then derives
 * its own line rather than showing a stale one.
 */
export interface MissionBrief {
  scenarioId: string;
  kind: string;
  reasonAr: string;
  taskAr: string;
  startedAt: number;
}

const KEY = 'katzu_mission_brief_v1';

export function saveMissionBrief(brief: MissionBrief): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(brief));
  } catch {
    /* a browser with storage disabled still gets the episode, minus the brief */
  }
}

export function loadMissionBrief(scenarioId?: string): MissionBrief | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MissionBrief;
    if (!parsed || typeof parsed.reasonAr !== 'string') return null;
    if (scenarioId && parsed.scenarioId !== scenarioId) return null;
    return parsed;
  } catch {
    return null;
  }
}
