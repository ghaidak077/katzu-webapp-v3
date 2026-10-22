import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { isGuidedHomeEnabled } from '@/lib/flags/guidedHome';
import { isFirstSessionDone } from '@/lib/journey/firstSession';

/**
 * The Practice/Progress lock: is it closed, and is the sheet on screen?
 *
 * Two facts and one piece of UI state, in one hook, because the three readers
 * (the tab, the URL, the sheet) must not be able to disagree:
 *
 *  - the tab's guard asks `locked` and shows the sheet on a tap,
 *  - the route's guard asks `locked` and replaces the URL with the home screen,
 *  - the sheet renders from `open` and closes on `hide`.
 *
 * `locked` is FALSE until the evidence has been read. A learner who has already
 * finished a conversation must never be bounced to the home screen by a lock
 * that has not yet looked at the database — so an unresolved read is "not
 * locked", and the guard waits a millisecond rather than a lesson.
 */
export interface PracticeLock {
  /** Are the Practice and Progress tabs closed for this learner right now? */
  locked: boolean;
  /** Is the lock sheet on screen? */
  open: boolean;
  /** Open the sheet (the tap, or the URL, asked for it). */
  show: () => void;
  /** Dismiss the sheet. */
  hide: () => void;
}

export function usePracticeLock(): PracticeLock {
  const guided = isGuidedHomeEnabled();
  // One query, so the two facts arrive together: a lock decided on a session
  // count from one moment and an account row from another could put a paying
  // learner behind a lock for a frame.
  const facts = useLiveQuery(async () => {
    const [sessionCount, user] = await Promise.all([
      db.sessions.count(),
      db.users.get('current_user'),
    ]);
    return { sessionCount, user };
  });
  const [open, setOpen] = useState(false);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  const locked =
    guided &&
    facts !== undefined &&
    !isFirstSessionDone({ guided, sessionCount: facts.sessionCount, user: facts.user });

  return { locked, open, show, hide };
}
