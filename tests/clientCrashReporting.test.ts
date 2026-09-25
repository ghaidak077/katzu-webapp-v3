import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosticEntry } from '@/lib/utils/diagnostics';

/**
 * Crash reporting has to be invisible when it works and harmless when it fails.
 * The decision of what leaves the device is tested directly: only uncaught
 * errors (console output can carry learner text), each distinct crash once, and
 * a bounded number per session so a render loop cannot flood the endpoint.
 */
const entry = (scope: string, message: string): DiagnosticEntry => ({
  timestamp: Date.now(),
  level: 'ERROR',
  scope,
  message,
});

describe('crash report boundaries', () => {
  let takeCrashReport: typeof import('@/lib/utils/diagnostics')['takeCrashReport'];

  beforeEach(async () => {
    // The reporter books what it sends, so each test starts from a clean session.
    vi.resetModules();
    ({ takeCrashReport } = await import('@/lib/utils/diagnostics'));
  });

  it('reports uncaught errors with the scope it came from', () => {
    expect(takeCrashReport(entry('window', 'Cannot read properties of null'))).toMatchObject({
      scope: 'window',
      message: 'Cannot read properties of null',
    });
    expect(takeCrashReport(entry('promise', 'Network request failed'))).toMatchObject({ scope: 'promise' });
  });

  it('never lets console output leave the device', () => {
    // Console arguments can contain a learner's own German; an exception message
    // cannot, which is why only one of the two is reported.
    expect(takeCrashReport(entry('console', 'learner sentence: Ich möchte einen Kaffee'))).toBeNull();
    expect(takeCrashReport(entry('app', 'quiz opened'))).toBeNull();
  });

  it('sends a repeating crash once, not on every render', () => {
    expect(takeCrashReport(entry('window', 'boom'))).not.toBeNull();
    expect(takeCrashReport(entry('window', 'boom'))).toBeNull();
    expect(takeCrashReport(entry('window', 'a different crash'))).not.toBeNull();
  });

  it('stops after the per-session cap instead of flooding the endpoint', () => {
    for (let i = 0; i < 8; i++) {
      expect(takeCrashReport(entry('window', `distinct crash ${i}`))).not.toBeNull();
    }
    expect(takeCrashReport(entry('window', 'one crash too many'))).toBeNull();
  });
});
