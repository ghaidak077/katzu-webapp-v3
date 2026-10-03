/**
 * The localStorage key of the durable daily-event queue (V29).
 *
 * It lives in its own leaf module so both the queue writer (`dailyAuthority.ts`)
 * and the sign-out wipe (`katzuDb.ts`) share one source of truth without a
 * circular import — `dailyAuthority` already imports the database, so it cannot
 * be imported back from there.
 */
export const DAILY_EVENT_QUEUE_KEY = 'katzu_daily_events_v1';
