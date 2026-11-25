import type { CEFRLevel, WritingTaskType } from '@/types/models';
import type { UiStringKey } from '@/lib/i18n/strings';

/**
 * Which written task a level is ready for — the client half of the contract with
 * `taskTypeForLevel()` in `cloudflare-writing.js`.
 *
 * The worker validates the task it receives against that same mapping, and
 * `tests/writingContract.test.ts` asserts the two tables agree for every level,
 * so a learner can never be shown one task and graded against another. That
 * failure would be invisible in exactly the way this app cannot afford: the
 * score would look plausible while measuring the wrong thing.
 */
export function writingTaskForLevel(level: CEFRLevel | string | undefined): WritingTaskType {
  switch (String(level || 'A1').toUpperCase()) {
    case 'B2':
      return 'complaint';
    case 'B1':
      return 'formal_email';
    case 'A2':
      return 'appointment_request';
    default:
      return 'short_message';
  }
}

export interface WritingTaskCopy {
  /**
   * Dictionary row for the short task label the picker shows.
   *
   * A key rather than a sentence: this table is built once at module load, so a
   * literal here would be frozen in one language and painted into every other
   * one — which is exactly how the Arabic task block used to survive on the
   * English writing screen. The screen resolves the key in render, where the
   * learner's language is known.
   */
  titleKey: UiStringKey;
  /** Dictionary row for the instruction the learner actually reads. */
  briefKey: UiStringKey;
  /** The German name of the task format, shown as the exam term. */
  formatDe: string;
}

/**
 * UI copy for each task format. The *definition* the grader uses lives in
 * `cloudflare-writing.js` next to the prompt; this is what the learner reads, and
 * keeping them apart is deliberate — the worker must never be able to change what
 * a task means by editing a string that is also shown on screen.
 */
export const WRITING_TASK_COPY: Record<WritingTaskType, WritingTaskCopy> = {
  short_message: {
    titleKey: 'writing.task.shortMessage.title',
    briefKey: 'writing.task.shortMessage.brief',
    formatDe: 'Kurze Nachricht',
  },
  appointment_request: {
    titleKey: 'writing.task.appointment.title',
    briefKey: 'writing.task.appointment.brief',
    formatDe: 'Terminanfrage',
  },
  formal_email: {
    titleKey: 'writing.task.formalEmail.title',
    briefKey: 'writing.task.formalEmail.brief',
    formatDe: 'Formelle E-Mail',
  },
  complaint: {
    titleKey: 'writing.task.complaint.title',
    briefKey: 'writing.task.complaint.brief',
    formatDe: 'Beschwerde',
  },
};
