import React from 'react';
import { Check, Circle } from 'lucide-react';
import { GlassWell } from '@/components/glass/GlassSurface';
import type { DailyTasksSnapshot } from '@/lib/daily/taskStore';
import { arCount } from '@/lib/i18n/arabicCount';
import { STREAK_DAY_NOM } from '@/lib/i18n/countForms';
import { LtrCounter } from '@/components/common/LtrCounter';
import type { DailyTaskKind } from '@/lib/daily/tasks';

export interface DailyTasksPanelProps {
  snapshot: DailyTasksSnapshot | undefined;
  /** Runs the action for the task the learner tapped. */
  onAction: (kind: DailyTaskKind) => void;
}

/**
 * The day's tasks, as a compact checklist under the hero.
 *
 * One line per task, 48px, a circular state mark leading and nothing trailing:
 * the row is the target, so a chevron on it would promise a second screen that
 * does not exist. The count and the three-segment strip share the header row
 * with the title, because "how much of today is left" is one glance, not a
 * paragraph.
 *
 * The review batch is not listed. It is the one task whose door is already on
 * the screen — the ghost review row above the card — and `markReviewGraded`
 * records it the moment the learner grades an item there, so a third row would
 * be a second entrance to a room they are already standing in. The header's
 * three segments still track all three tasks, so the day's contract stays
 * honest even though only two of them are listed here.
 *
 * The panel owns no rules — `readDailyTasks` decides what is done, and this
 * only draws it.
 */
export const DailyTasksPanel: React.FC<DailyTasksPanelProps> = ({ snapshot, onAction }) => {
  if (!snapshot) return null;
  const { statuses, doneCount, streakDays, forgiving } = snapshot;
  const allDone = statuses.length > 0 && doneCount >= statuses.length;
  // The one task whose entry point is elsewhere on the screen (see above).
  const listed = statuses.filter((status) => status.kind !== 'review');
  const firstIncomplete = listed.find((status) => !status.done)?.kind;

  return (
    <GlassWell className="mb-4 p-3.5" data-testid="daily-tasks">
      <div className="flex items-center justify-between gap-3">
        <span className="kz-ar-caption text-kz-ink">مهام اليوم</span>
        {/* Three segments first, then the number — the shape is read at a
            glance and the count agrees with it. Both count the whole day, not
            just the rows below. */}
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1" aria-hidden>
            {statuses.map((status) => (
              <span
                key={status.kind}
                className={`h-1 w-4 rounded-full ${status.done ? 'bg-kz-lavender/85' : 'bg-white/[0.14]'}`}
              />
            ))}
          </span>
          <span className="kz-ar-micro text-kz-inkFaint">
            <LtrCounter value={doneCount} total={statuses.length} />
          </span>
        </span>
      </div>

      <p className="kz-ar-micro mt-1 text-kz-inkFaint">
        {streakDays > 0
          ? `${arCount(streakDays, STREAK_DAY_NOM)} في مهام اليوم${
              forgiving ? ' — يوم واحد مسموح ومُتجاوَز' : ''
            }`
          : 'أكمل المهام الثلاث لتبدأ سلسلتك اليومية.'}
      </p>

      {allDone ? (
        <p
          role="status"
          data-testid="daily-tasks-complete"
          className="kz-pop kz-ar-micro mt-2 rounded-xl border border-kz-neon/25 bg-kz-neon/10 px-2.5 py-1.5 text-kz-neon"
        >
          أتممت مهام اليوم الثلاث — غداً تتجدد خطوتك اليومية لتثبيت ما تدرّبت عليه.
        </p>
      ) : null}

      <ul className="mt-2 divide-y divide-kz-line/60">
        {listed.map((status, index) => (
          /* Rows arrive 60ms apart on first paint only: the panel states today's
             shape in the order they appear, and a row that is already done is
             never re-animated when the live query refreshes it. */
          <li key={status.kind} className="kz-message-in" style={{ animationDelay: `${index * 60}ms` }}>
            <button
              type="button"
              onClick={() => onAction(status.kind)}
              aria-disabled={status.done || undefined}
              aria-label={status.done ? `${status.labelAr} — تم` : undefined}
              className="flex min-h-control w-full items-center gap-2.5 text-start"
            >
              {status.done ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kz-lavender/15">
                  <Check className="h-3.5 w-3.5 text-kz-lavender" aria-hidden />
                </span>
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15">
                  <Circle className="h-2 w-2 text-kz-inkFaint" aria-hidden />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={`kz-ar-caption block truncate ${status.done ? 'text-kz-inkFaint' : 'text-kz-ink'}`}>
                  {status.labelAr}
                </span>
                {/* One supporting line, and only where it still changes what the
                    learner does next: the first unfinished task. */}
                {!status.done && status.kind === firstIncomplete ? (
                  <span className="kz-ar-micro block truncate text-kz-inkFaint">{status.hintAr}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </GlassWell>
  );
};
