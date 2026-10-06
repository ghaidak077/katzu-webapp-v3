import React from 'react';
import { Check, Circle, ChevronLeft } from 'lucide-react';
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
 * The three daily tasks (V28 Stage 3), rendered as ONE quiet checklist under
 * the mission (launch polish, Screen 1 item 2).
 *
 * What changed and why: the panel used to give every task its own text button,
 * so two hierarchies competed on Journey Home — the hero (review) and the task
 * list each offered a loud action, and nothing said which one was "today".
 * The hero is the single primary action; the tasks are the habit underneath
 * it, so the whole ROW is now the tap target (a button — named, 44px+) with a
 * status circle, a one-line subtitle and a trailing chevron. Progress reads
 * from a 3-segment strip plus the number, not a bare "0 من 3" (G1: Western
 * digits; G2: the count stays a plain Arabic sentence, never an "n / m" run).
 *
 * The panel owns no rules — `readDailyTasks` decides what is done, and this
 * only draws it. The streak line is deliberately plain: it says how many
 * consecutive completed days there are and, when one day is being forgiven,
 * says so instead of hiding it — a habit loop that lies about a missed day is
 * worse than none.
 */
export const DailyTasksPanel: React.FC<DailyTasksPanelProps> = ({ snapshot, onAction }) => {
  if (!snapshot) return null;
  const { statuses, doneCount, streakDays, forgiving } = snapshot;

  return (
    <GlassWell className="mb-4 p-3.5" data-testid="daily-tasks">
      <div className="flex items-center justify-between gap-3">
        <span className="kz-ar-caption text-kz-ink">مهام اليوم</span>
        {/* Three segments first, then the number — the shape is read at a
            glance and the count agrees with it. */}
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1" aria-hidden>
            {statuses.map((status) => (
              <span
                key={status.kind}
                className={`h-[5px] w-4 rounded-full ${
                  status.done ? 'bg-kz-lavender/85' : 'bg-white/[0.14]'
                }`}
              />
            ))}
          </span>
          <span className="kz-ar-micro text-kz-inkFaint">
            <LtrCounter value={doneCount} total={statuses.length} />
          </span>
        </span>
      </div>

      <p className="kz-ar-micro mt-1.5 text-kz-inkFaint">
        {streakDays > 0
          ? `${arCount(streakDays, STREAK_DAY_NOM)} في مهام اليوم${
              forgiving ? ' — يوم واحد مسموح ومُتجاوَز' : ''
            }`
          : 'أكمل المهام الثلاث لتبدأ سلسلتك اليومية.'}
      </p>

      <ul className="mt-2.5 space-y-1">
        {statuses.map((status) => (
          <li key={status.kind}>
            <button
              type="button"
              onClick={() => onAction(status.kind)}
              aria-disabled={status.done || undefined}
              className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-1 py-1.5 text-start transition-colors pointer-hover:bg-white/[0.04]"
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
                <span className={`kz-ar-caption block ${status.done ? 'text-kz-inkFaint' : 'text-kz-ink'}`}>
                  {status.labelAr}
                </span>
                <span className="kz-ar-micro block truncate text-kz-inkFaint">
                  {status.done
                    ? 'تم'
                    : status.target > 1
                      ? `${status.hintAr} (${status.progress}/${status.target})`
                      : status.hintAr}
                </span>
              </span>
              {/* Trailing chevron — the row is the affordance, so a per-task
                  text button is gone rather than a second copy of it. */}
              <ChevronLeft className="h-4 w-4 shrink-0 text-kz-inkFaint" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </GlassWell>
  );
};
