/**
 * The hidden debug label — «AI · model · ms · attempt n» or «ERROR · reason».
 *
 * Off by default, and only a Settings toggle (a deliberately hidden one) turns it
 * on. It exists so the owner can see, on a real device, which model served a
 * turn, how long it took and whether it was the first attempt — without opening
 * the dashboard. It never changes behaviour and never appears for a learner who
 * has not asked for it.
 *
 * There is no FALLBACK state any more: a failed turn is «ERROR · reason», because
 * no authored line stands in for the model's reply.
 */

const STORAGE_KEY = 'katzu.debug.aiLabel';

export interface AiTurnMeta {
  model?: string | null;
  provider?: string | null;
  attempts?: number | null;
  elapsedMs?: number | null;
}

/** True when the learner (or the owner) enabled the label in Settings. */
export function isDebugLabelEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDebugLabelEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* private mode: the toggle simply does not stick */
  }
}

/** «AI · model · ms · attempt n». Missing numbers are shown as an em dash. */
export function aiDebugLabel(meta: AiTurnMeta | null | undefined): string | undefined {
  if (!meta) return undefined;
  const model = String(meta.model || meta.provider || 'unknown');
  const ms = Number.isFinite(Number(meta.elapsedMs)) ? String(meta.elapsedMs) : '—';
  const attempt = Number.isFinite(Number(meta.attempts)) ? String(meta.attempts) : '—';
  return `AI · ${model} · ${ms} ms · attempt ${attempt}`;
}

/** «ERROR · reason» — the reason is a code, never learner text. */
export function errorDebugLabel(reason: string): string {
  return `ERROR · ${reason}`;
}
