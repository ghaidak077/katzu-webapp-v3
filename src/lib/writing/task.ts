import type { CEFRLevel, WritingTaskType } from '@/types/models';

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
  /** Short Arabic label for the task picker. */
  titleAr: string;
  /** The instruction the learner actually reads. */
  briefAr: string;
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
    titleAr: 'رسالة قصيرة',
    briefAr: 'اكتب رسالة قصيرة غير رسمية من جملتين إلى ثلاث عن الموضوع المذكور أدناه.',
    formatDe: 'Kurze Nachricht',
  },
  appointment_request: {
    titleAr: 'طلب موعد',
    briefAr: 'اكتب طلباً مهذباً لموعد من أربع إلى ست جمل: لماذا، ومتى يناسبك، وماذا تحتاج.',
    formatDe: 'Terminanfrage',
  },
  formal_email: {
    titleAr: 'بريد رسمي',
    briefAr: 'اكتب بريداً رسمياً من ست إلى عشر جمل مع تحية البداية والخاتمة.',
    formatDe: 'Formelle E-Mail',
  },
  complaint: {
    titleAr: 'شكوى رسمية',
    briefAr:
      'اكتب شكوى رسمية من ثماني إلى اثنتي عشرة جملة: اذكر المشكلة، والوقائع، وما جرّبته سابقاً، وما تريد أن يحدث.',
    formatDe: 'Beschwerde',
  },
};
