import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

/** How long a read may take before a screen stops implying that it is merely slow. */
const STALLED_AFTER_MS = 6_000;

export type LiveRowKind = 'reading' | 'missing' | 'ready';

export interface LiveRow<T> {
  kind: LiveRowKind;
  row: T | undefined;
  /** Neither resolved nor failed for longer than any screen should imply. */
  stalled: boolean;
  /** Runs the query again — a learner should not have to reload the app. */
  retry: () => void;
}

/**
 * One row from Dexie, with "still reading" kept apart from "not there".
 *
 * `useLiveQuery` returns `undefined` twice — while the first read is in flight, and
 * when the row does not exist — so a screen that branches on it can only lie ("this
 * scene is missing" during a slow read) or spin forever. Wrapping the row in an
 * object separates the two.
 *
 * The stall is a real state, not a theoretical one: IndexedDB wedges a read behind a
 * blocked connection change (another tab holding an older schema, an upgrade waiting
 * on it) and it wedges it *silently* — nothing rejects, so there is no error to catch
 * and no failure frame to render. After a bounded wait the caller stops claiming to
 * be loading and offers `retry`, which re-runs the query.
 */
export function useLiveRow<T>(read: () => Promise<T | undefined>, deps: unknown[]): LiveRow<T> {
  const [attempt, setAttempt] = useState(0);
  const [stalled, setStalled] = useState(false);
  // The last row this hook actually saw. `useLiveQuery` resets to `undefined`
  // whenever it re-subscribes, and a live query re-runs on every write to the
  // tables it touched — including the app's own background content refresh. A
  // screen that branches on that reset would blank itself mid-episode, so once a
  // row has been read the hook keeps reporting it and treats a re-run as a
  // refresh, not as news that the row is gone.
  const [seen, setSeen] = useState<{ row: T | null } | undefined>(undefined);

  const live = useLiveQuery(async () => ({ row: (await read()) ?? null }), [...deps, attempt]);
  const result = live ?? seen;

  useEffect(() => {
    if (live !== undefined) setSeen(live);
  }, [live]);

  useEffect(() => {
    if (result !== undefined) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS);
    return () => clearTimeout(timer);
  }, [result, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    kind: result === undefined ? 'reading' : result.row === null ? 'missing' : 'ready',
    row: result?.row ?? undefined,
    stalled,
    retry,
  };
}
