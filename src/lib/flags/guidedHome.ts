/**
 * `guidedHome` — the one switch for the guided refinement of Journey Home.
 *
 * Why a flag at all: the owner's report is that a brand-new learner opens the
 * home screen and cannot tell what to do first, so the fix trims the screen to
 * one hero, one path and the day's tasks. That is a product decision about the
 * FIRST screen a learner ever sees, which makes it the one change where "revert
 * it this second" has to be true without a deploy.
 *
 * Three sources, read in this order:
 *   1. the device switch (`localStorage['kz.guidedHome'] = '1' | '0'`) — instant,
 *      per device, survives a redeploy; this is how the owner tests it on a phone
 *      and how a bad surprise is undone in seconds;
 *   2. the build's `VITE_GUIDED_HOME` — how a preview bundle carries the new home
 *      without changing the shipped default;
 *   3. the build mode — ON in `vite dev` (so the work is visible and the whole
 *      e2e suite exercises it), OFF in a production bundle unless (2) says
 *      otherwise. A shipped bundle must never change shape because a flag module
 *      was added to it.
 *
 * Off has to mean today's screen, not "today's screen minus something": every
 * caller keeps its current JSX and wraps only the new branch in `guided`, so the
 * rendered DOM with the flag off is the DOM that shipped before this file.
 *
 * Checked once per page load and memoised: the switch cannot change while a page
 * is open (nothing in the app writes it), and re-reading storage on every render
 * of a screen that re-renders on every live-query tick is a cost with no benefit.
 * An e2e that needs the other side sets the switch in an init script, before the
 * first load.
 */

const STORAGE_KEY = 'kz.guidedHome';

export interface GuidedHomeSources {
  /** What the device switch holds, verbatim: '1', '0', or anything else. */
  stored: string | null;
  /** `import.meta.env.VITE_GUIDED_HOME`, when a build sets it. */
  envValue?: string;
  /** `import.meta.env.DEV` — a dev/preview server, not a shipped bundle. */
  isDev: boolean;
}

/**
 * The decision, as a pure function so the four combinations are provable
 * without a browser or a build.
 *
 * An explicit device value always wins: a learner (or the owner) who switched it
 * off keeps it off even if the build was compiled with it on, and vice versa.
 * That is the whole point of a kill switch — it cannot be overridden by the
 * thing it is meant to override.
 */
export function resolveGuidedHome({ stored, envValue, isDev }: GuidedHomeSources): boolean {
  if (stored === '1') return true;
  if (stored === '0') return false;
  if (envValue === '1') return true;
  if (envValue === '0') return false;
  return isDev;
}

let cached: boolean | null = null;

/** Is the guided home on, for this page load? */
export function isGuidedHomeEnabled(): boolean {
  if (cached === null) cached = readSources();
  return cached;
}

function readSources(): boolean {
  let stored: string | null = null;
  try {
    // `typeof` rather than a try/catch alone: the unit runner is a node process
    // with no `window`, and storage can also throw on read in private mode.
    stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  const env = (import.meta as unknown as { env?: { DEV?: boolean; VITE_GUIDED_HOME?: string } }).env;
  return resolveGuidedHome({ stored, envValue: env?.VITE_GUIDED_HOME, isDev: env?.DEV === true });
}
