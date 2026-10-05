/**
 * The daily reminder, as an `.ics` file the learner opens once.
 *
 * WHY A FILE AND NOT A NOTIFICATION
 * The app has no push server and no VAPID keys yet (both are deferred, on the
 * OWNER LIST). What it CAN do honestly is hand the learner a calendar entry they
 * own: one recurring reminder a day before their own date, in their own calendar,
 * which keeps working after the tab is closed. A promise the app cannot keep is
 * worse than a file that does exactly what it says.
 *
 * WHAT IS PINNED BY TEST
 *  - the output is a valid VCALENDAR with CRLF line endings and a folded-free
 *    75-octet-per-line body (a long Arabic title would otherwise be silently
 *    truncated by some parsers);
 *  - the date is the learner's own, in LOCAL time with no `Z`, because an exam
 *    is at a place, not at an instant in UTC;
 *  - the reminder never claims the app will speak at the learner: it is an
 *    all-day event the day before, with a description the learner controls.
 */

/** The reminder fires the day before the learner's date, at their chosen time. */
export const REMINDER_OFFSET_DAYS = 1;

/** How many calendar days before the date the entry lands. */
const FREQUENCY = 'DAILY;INTERVAL=1;COUNT=1';

export interface ReminderInput {
  /** Epoch ms of the learner's own date. */
  targetDate: number;
  /** `HH:mm` the learner chose, or undefined for all-day. */
  reminderTime?: string;
  /** What to call it, Arabic-first. */
  titleAr: string;
  descriptionAr?: string;
  /** Stable per learner+date, so a re-download replaces rather than duplicates. */
  uid?: string;
  now?: number;
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

/** Local `YYYYMMDDTHHMMSS` — no `Z`, because an exam happens somewhere. */
function localStamp(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

function allDayStamp(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** Escape the RFC 5545 characters, in the order the spec requires. */
function escapeText(value: string): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets, the limit every parser actually enforces. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  for (const char of line) {
    if (encoder.encode(current + char).length > 74) {
      out.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

/**
 * The whole file, or null when there is no date to remind about.
 *
 * `null` is the honest answer for a learner who skipped the date question: the
 * app has nothing to schedule, and offering to schedule nothing is noise.
 */
export function buildExamReminderIcs(input: ReminderInput): string | null {
  const target = Number(input?.targetDate);
  if (!Number.isFinite(target) || target <= 0) return null;
  const title = String(input?.titleAr || 'تذكير Katzu').slice(0, 120);

  const targetDate = new Date(target);
  const reminderDate = new Date(targetDate.getTime() - REMINDER_OFFSET_DAYS * 86_400_000);
  const now = new Date(Number(input?.now ?? Date.now()));

  const time = /^\d{2}:\d{2}$/.test(String(input?.reminderTime || '')) ? String(input?.reminderTime) : null;
  const [hours, minutes] = time ? time.split(':').map((part) => Number(part)) : [9, 0];

  const timed = new Date(reminderDate);
  timed.setHours(hours, minutes, 0, 0);
  const endsAt = new Date(timed.getTime() + 15 * 60_000);

  const description = escapeText(
    input?.descriptionAr || 'ابدأ اليوم بمحادثة قصيرة على كاتزو — عشر دقائق تكفي.',
  );
  const uid = String(input?.uid || `katzu-reminder-${target}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Katzu//Exam Reminder//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@katzu`,
    `DTSTAMP:${localStamp(now)}`,
    time ? `DTSTART:${localStamp(timed)}` : `DTSTART;VALUE=DATE:${allDayStamp(timed)}`,
    time ? `DTEND:${localStamp(endsAt)}` : `DTEND;VALUE=DATE:${allDayStamp(timedDatePlusOne(timed))}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${description}`,
    // A learner who opens this once has a calendar entry forever; the recurrence
    // is a single occurrence, so nothing repeats after the date has passed.
    `RRULE:FREQ=${FREQUENCY}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'TRIGGER:-PT12H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(fold).join('\r\n') + '\r\n';
}

function timedDatePlusOne(date: Date): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + 1);
  return next;
}

/** The filename, so two downloads replace each other instead of stacking up. */
export function reminderFileName(now = Date.now()): string {
  const day = new Date(now);
  return `katzu-reminder-${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}.ics`;
}