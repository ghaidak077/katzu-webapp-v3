import React from 'react';
import { Check, Circle } from 'lucide-react';
import { GlassWell } from '@/components/glass/GlassSurface';
import { GlassButton } from '@/components/glass/GlassButton';
import type { DailyTasksSnapshot } from '@/lib/daily/taskStore';
import type { DailyTaskKind } from '@/lib/daily/tasks';

export interface DailyTasksPanelProps {
  snapshot: DailyTasksSnapshot | undefined;
  /** Runs the action for the task the learner tapped. */
  onAction: (kind: DailyTaskKind) => void;
}

/**
 * The three daily tasks (V28 Stage 3), rendered as one quiet card under the
 * mission: one scenario session, one grammar step, one review batch.
 *
 * The panel owns no rules — `readDailyTasks` decides what is done, and this only
 * draws it. The streak line is deliberately plain: it says how many consecutive
 * completed days there are and, when one day is being forgiven, says so instead
 * of hiding it — a habit loop that lies about a missed day is worse than none.
 */
export const DailyTasksPanel: React.FC<DailyTasksPanelProps> = ({ snapshot, onAction }) => {
  if (!snapshot) return null;
  const { statuses, doneCount, streakDays, forgiving } = snapshot;

  return (
    <GlassWell className="mb-4 p-3.5" data-testid="daily-tasks">
      <div className="flex items-center justify-between">
        <span className="kz-ar-caption text-kz-ink">مهام اليوم</span>
        <span className="kz-ar-micro text-kz-inkFaint">
          {doneCount} من {statuses.length}
        </span>
      </div>

      <p className="kz-ar-micro mt-1 text-kz-inkFaint">
        {streakDays > 0
          ? `${streakDays} ${streakDays === 1 ? 'يوم متتالٍ' : 'أيام متتالية'} في مهام اليوم${
              forgiving ? ' — يوم واحد مسموح ومُتجاوَز' : ''
            }`
          : 'أكمل المهام الثلاث لتبدأ سلسلتك اليومية.'}
      </p>

      <ul className="mt-3 space-y-2">
        {statuses.map((status) => (
          <li key={status.kind} className="flex items-center gap-2">
            {status.done ? (
              <Check className="h-4 w-4 shrink-0 text-kz-lavender" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-kz-inkFaint" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className={status.done ? 'kz-ar-caption text-kz-inkFaint' : 'kz-ar-caption text-kz-ink'}>
                {status.labelAr}
              </p>
              <p className="kz-ar-micro text-kz-inkFaint">
                {status.done
                  ? 'تم'
                  : status.target > 1
                    ? `${status.hintAr} (${status.progress}/${status.target})`
                    : status.hintAr}
              </p>
            </div>
            {!status.done && (
              <GlassButton
                variant="quiet"
                className="min-h-[44px] shrink-0 px-3 text-[0.72rem]"
                onClick={() => onAction(status.kind)}
              >
                {status.actionAr}
              </GlassButton>
            )}
          </li>
        ))}
      </ul>
    </GlassWell>
  );
};

