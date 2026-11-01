/**
 * The service-worker update handshake, in prompt mode.
 *
 * Why not `autoUpdate`: the worker activating a new bundle immediately reloads
 * the page, and an in-progress conversation lives only in React state until the
 * session is finished and written to Dexie. A learner mid-sentence on a train
 * would lose the exchange and never know why. So the worker installs and
 * **waits**; this module turns that wait into one small, explicit banner.
 *
 * Three rules it keeps:
 *   1. Nothing reloads by itself. A reload happens only from `applyPendingUpdate`,
 *      after the learner asked for it.
 *   2. A live conversation holds the update. `acquireUpdateHold()` is taken by the
 *      conversation screen while it has messages and has not finished; the banner
 *      stays visible but its action is disabled until the hold is released.
 *   3. A dismissed prompt is not a forgotten update. The waiting worker keeps
 *      waiting, and the next app open asks again.
 *
 * The registration is deliberately hand-written rather than `virtual:pwa-register`
 * so the reload is ours: the plugin helper reloads on `controlling` before any
 * caller can protect unsaved work.
 */

export interface UpdatePromptSnapshot {
  /** A new worker is installed and waiting for the go-ahead. */
  available: boolean;
  /** The learner pressed update and activation is in flight. */
  applying: boolean;
  /** Something in the app (a conversation) must finish before reloading. */
  held: boolean;
  /** The learner pressed "later" this session. */
  dismissed: boolean;
}

const SW_URL = '/sw.js';
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const ACTIVATION_GRACE_MS = 4000;

let snapshot: UpdatePromptSnapshot = {
  available: false,
  applying: false,
  held: false,
  dismissed: false,
};

let holds = 0;
let waitingWorker: ServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;
let teardown: (() => void) | null = null;

const listeners = new Set<() => void>();

function publish(patch: Partial<UpdatePromptSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function getUpdatePromptSnapshot(): UpdatePromptSnapshot {
  return snapshot;
}

export function subscribeUpdatePrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Keep the update from reloading while unsaved work would be lost. The returned
 * function is idempotent, so a React effect may release it twice without
 * corrupting the counter.
 */
export function acquireUpdateHold(): () => void {
  holds += 1;
  publish({ held: true });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    publish({ held: holds > 0 });
  };
}

export function isUpdateHeld(): boolean {
  return holds > 0;
}

function markUpdateAvailable(worker: ServiceWorker) {
  waitingWorker = worker;
  publish({ available: true, applying: false, dismissed: false });
}

export function dismissUpdate(): void {
  publish({ dismissed: true });
}

async function activateAndReload(worker: ServiceWorker): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', done);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', done);
    // A worker can activate without transferring control in every browser. The
    // reload is still the right next step: it picks up whichever worker is
    // active, so the worst case is one more prompt, never a dead page.
    window.setTimeout(done, ACTIVATION_GRACE_MS);
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
  window.location.reload();
}

/**
 * Apply the waiting worker. Refuses when there is nothing to apply, when the
 * learner dismissed the prompt, or while a hold protects unsaved work.
 */
export async function applyPendingUpdate(): Promise<boolean> {
  if (!snapshot.available || snapshot.dismissed || snapshot.held || snapshot.applying) {
    return false;
  }
  if (!waitingWorker) return false;
  publish({ applying: true });
  await activateAndReload(waitingWorker);
  return true;
}

function watchRegistration(current: ServiceWorkerRegistration) {
  registration = current;

  // A worker that finished installing while the tab was closed is already
  // waiting; ask before the first paint rather than waiting for an event.
  if (current.waiting && navigator.serviceWorker.controller) {
    markUpdateAvailable(current.waiting);
  }

  current.addEventListener('updatefound', () => {
    const installing = current.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // `controller` is the guard that tells an update from the very first
      // install: there is nothing to refresh on a first visit, and prompting
      // there would nag every new learner on their first screen.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        markUpdateAvailable(installing);
      }
    });
  });
}

/**
 * Register the worker and start the two cheap checks that find an update while
 * the app stays open: one on returning to the tab, one every half hour.
 * Returns a teardown for tests; the app never calls it.
 */
export function installUpdatePrompt(
  options: { url?: string; intervalMs?: number } = {},
): () => void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }
  if (teardown) return teardown;

  const check = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void registration?.update().catch(() => {
      /* offline or the server is mid-deploy: the next check tries again */
    });
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') check();
  };

  document.addEventListener('visibilitychange', onVisibility);
  const interval = window.setInterval(check, options.intervalMs ?? UPDATE_CHECK_INTERVAL_MS);

  void navigator.serviceWorker
    .register(options.url ?? SW_URL, { scope: '/' })
    .then(watchRegistration)
    .catch(() => {
      /* The app works online without a worker; never block boot on this. */
    });

  teardown = () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibility);
    teardown = null;
  };
  return teardown;
}

/** Test seam: clear module state between cases. */
export function resetUpdatePromptForTests(): void {
  teardown?.();
  teardown = null;
  registration = null;
  waitingWorker = null;
  holds = 0;
  listeners.clear();
  snapshot = { available: false, applying: false, held: false, dismissed: false };
}
