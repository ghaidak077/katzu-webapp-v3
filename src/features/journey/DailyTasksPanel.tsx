import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
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
  /** The card's quiet last row: «المزيد». Omitted when the home draws its own. */
  onMore?: () => void;
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
 * All three tasks are listed. The review batch used to be omitted because the
 * ghost review row above was its door — but then the header said `0/3` over two
 * rows, and a learner counting rows read a different day than the app did. Three
 * rows, one count.
 *
 * The panel owns no rules — `readDailyTasks` decides what is done, and this
 * only draws it.
 */
export const DailyTasksPanel: React.FC<DailyTasksPanelProps> = ({ snapshot, onAction, onMore }) => {
  if (!snapshot) return null;
  const { statuses, doneCount, streakDays, forgiving } = snapshot;
  const allDone = statuses.length > 0 && doneCount >= statuses.length;
  const firstIncomplete = statuses.find((status) => !status.done)?.kind;

  return (
    <GlassWell className="mb-6 p-3.5" data-testid="daily-tasks">
      <div className="flex items-center justify-between gap-3">
        <span className="kz-ar-caption text-kz-ink">مهام اليوم</span>
        {/* Three segments first, then the number — the shape is read at a
            glance and the count agrees with it. */}
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1" aria-hidden>
            {statuses.map((status) => (
              <span
                key={status.kind}
                className={`h-1 w-4 rounded-full ${status.done ? 'bg-kz-lavender/85' : 'bg-white/[0.14]'}`}
              />
            ))}
          </span>
          <span className="kz-ar-micro text-kz-inkDim">
            <LtrCounter value={doneCount} total={statuses.length} />
          </span>
        </span>
      </div>

      {/* The streak line only exists once there is a streak. The zero-state
          sentence it used to sit next to restated the card the learner was
          already looking at. */}
      {streakDays > 0 ? (
        <p className="kz-ar-micro mt-1 text-kz-inkDim">
          {arCount(streakDays, STREAK_DAY_NOM)} في مهام اليوم
          {forgiving ? ' — يوم واحد مسموح ومُتجاوَز' : ''}
        </p>
      ) : null}

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
        {statuses.map((status, index) => (
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
              {/* A 24px circle outline, and a filled green ring with the check
                  inside once the day's record says it happened. The pending mark
                  used to hold a tiny `Circle` glyph, which at 8px read as the
                  letter «C» beside an Arabic label. */}
              {status.done ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kz-neon/15">
                  <Check className="h-3.5 w-3.5 text-kz-neon" aria-hidden />
                </span>
              ) : (
                <span
                  aria-hidden
                  className="h-6 w-6 shrink-0 rounded-full border border-white/25"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className={`kz-ar-caption block truncate ${status.done ? 'text-kz-inkDim' : 'text-kz-ink'}`}>
                  {status.labelAr}
                </span>
                {/* One supporting line, and only where it still changes what the
                    learner does next: the first unfinished task. */}
                {!status.done && status.kind === firstIncomplete ? (
                  <span className="kz-ar-micro block truncate text-kz-inkDim">{status.hintAr}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* The home's one secondary entry point, as the card's quiet last row: it
          stays reachable without adding a fourth thing to the screen. */}
      {onMore ? (
        <button
          type="button"
          data-testid="journey-more"
          aria-haspopup="dialog"
          onClick={onMore}
          className="mt-1 flex min-h-touch w-full items-center justify-start gap-1 border-t border-kz-line/60 px-1 text-kz-inkDim transition-colors duration-fast ease-out pointer-hover:bg-kz-ink/5"
        >
          <span className="kz-ar-micro">المزيد</span>
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </GlassWell>
  );
};
