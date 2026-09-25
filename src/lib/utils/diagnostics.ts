/**
 * Katzu diagnostics logger — timestamped ring buffer of everything that goes
 * wrong in the app, so bug reports carry the full story without a debugger.
 *
 * Design:
 * - In-memory ring buffer (max 400 entries) — bounded, cheap, no schema change.
 * - Captures console.error/console.warn, window.onerror,
 *   window.unhandledrejection, and manual app events via `logEvent`.
 * - Never logs user content or tokens: payloads are truncated and the app
 *   only passes short machine-readable descriptions.
 * - Export as plain text (timestamps + level + message + stack) for copy/paste
 *   or as a downloadable .txt file.
 */

import { WORKER_BASE_URL } from '@/lib/api/workerUrl';

const MAX_LOG_ENTRIES = 400;
const MAX_LINE_LENGTH = 400;

/**
 * Crash forwarding. The ring buffer below lives on the device that crashed —
 * the one device nobody can inspect after a launch — so uncaught errors are
 * also sent to the worker's `error_reports` feed, which the admin dashboard
 * already reads.
 *
 * Only uncaught scopes are forwarded. Console output can carry learner content,
 * and a crash report must never become the place a learner's German sentences
 * end up; an exception message is a defect description, not their work. Each
 * distinct crash is sent once and a session sends at most MAX_CRASH_REPORTS, so
 * a render loop cannot flood the endpoint (server-side it is also capped at
 * 8/minute per IP).
 */
const MAX_CRASH_REPORTS = 8;
const CRASH_SCOPES = new Set(['window', 'promise']);
const reportedCrashes = new Set<string>();
let crashReportsSent = 0;

/**
 * Decides whether a logged entry is worth reporting, and books it. Kept free of
 * network and browser access on purpose: the boundary rules (which scopes may
 * leave the device, once per distinct crash, capped per session) are the part
 * that must not regress, and they are testable as values in, values out.
 * Returns null when the entry must stay local.
 */
export function takeCrashReport(entry: DiagnosticEntry): { scope: string; message: string; page?: string } | null {
  if (!CRASH_SCOPES.has(entry.scope) || crashReportsSent >= MAX_CRASH_REPORTS) return null;
  const identity = `${entry.scope}:${entry.message}`;
  if (reportedCrashes.has(identity)) return null;
  reportedCrashes.add(identity);
  crashReportsSent += 1;
  return {
    scope: entry.scope,
    message: entry.message,
    page: typeof location !== 'undefined' ? location.pathname : undefined,
  };
}

function forwardCrash(entry: DiagnosticEntry): void {
  if (!WORKER_BASE_URL || typeof fetch !== 'function') return;
  const payload = takeCrashReport(entry);
  if (!payload) return;
  void fetch(`${WORKER_BASE_URL}/client-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify(payload),
  }).catch(() => {
    // A crash that happens offline stays local: the buffer and the exported
    // diagnostics still carry it on the device. Never blocking the app matters
    // more than reporting, so there is no retry queue here.
  });
}

export type DiagnosticLevel = 'ERROR' | 'WARN' | 'INFO' | 'NET';

export interface DiagnosticEntry {
  timestamp: number;
  level: DiagnosticLevel;
  scope: string;
  message: string;
  detail?: string;
}

let entries: DiagnosticEntry[] = [];
const listeners = new Set<() => void>();

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDiagnostics(): readonly DiagnosticEntry[] {
  return entries;
}

function truncate(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_LINE_LENGTH ? `${flat.slice(0, MAX_LINE_LENGTH)}…` : flat;
}

function describeArg(arg: unknown): string {
  if (arg == null) return String(arg);
  if (typeof arg === 'string') return truncate(arg);
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (arg instanceof Error) {
    return truncate(arg.message + (arg.stack ? ` | ${arg.stack.split('\n').slice(0, 3).join(' ')}` : ''));
  }
  try {
    return truncate(JSON.stringify(arg));
  } catch {
    return String(arg);
  }
}

function pushEntry(level: DiagnosticLevel, scope: string, message: string, detail?: string): void {
  const entry: DiagnosticEntry = {
    timestamp: Date.now(),
    level,
    scope: truncate(scope) || 'app',
    message: truncate(message) || '(no message)',
    detail: detail ? truncate(detail) : undefined,
  };
  entries = [...entries.slice(-(MAX_LOG_ENTRIES - 1)), entry];
  if (level === 'ERROR') forwardCrash(entry);
  listeners.forEach((l) => l());
}

/** Manual app-level event (AI HTTP status, STT failure, etc.). */
export function logEvent(scope: string, message: string, detail?: unknown): void {
  pushEntry('INFO', scope, message, detail == null ? undefined : describeArg(detail));
}

/** Network-level event, kept separate so it can be filtered in reports. */
export function logNetwork(scope: string, message: string, detail?: unknown): void {
  pushEntry('NET', scope, message, detail == null ? undefined : describeArg(detail));
}

export function logError(scope: string, message: string, detail?: unknown): void {
  pushEntry('ERROR', scope, message, detail == null ? undefined : describeArg(detail));
}

export function formatDiagnosticsText(logs: readonly DiagnosticEntry[] = entries): string {
  const lines = logs.map((e) => {
    const time = new Date(e.timestamp).toISOString().replace('T', ' ').replace('Z', '');
    const detail = e.detail ? ` — ${e.detail}` : '';
    return `[${time}] [${e.level}] [${e.scope}] ${e.message}${detail}`;
  });
  const header = [
    `Katzu diagnostics — ${logs.length} entries`,
    `Device time: ${new Date().toISOString()}`,
    `User agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
    `Page: ${typeof location !== 'undefined' ? location.href : 'unknown'}`,
    '',
  ].join('\n');
  return `${header}${lines.join('\n')}\n`;
}

export function copyDiagnostics(): Promise<boolean> {
  const text = formatDiagnosticsText();
  try {
    if (navigator?.clipboard?.writeText) {
      return navigator.clipboard
        .writeText(text)
        .then(() => true)
        .catch(() => false);
    }
  } catch {
    /* fall through */
  }
  return Promise.resolve(false);
}

export function downloadDiagnostics(): boolean {
  try {
    const blob = new Blob([formatDiagnosticsText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `katzu-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export function clearDiagnostics(): void {
  entries = [];
  listeners.forEach((l) => l());
}

/** Install global capture; call once from main.tsx. */
export function installDiagnosticsCapture(): void {
  if (typeof window === 'undefined') return;
  const w = window as any;

  if (!w.__katzuDiagnosticsInstalled) {
    w.__katzuDiagnosticsInstalled = true;

    const nativeError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      pushEntry('ERROR', 'console', args.map(describeArg).join(' '));
      nativeError(...args);
    };
    const nativeWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      pushEntry('WARN', 'console', args.map(describeArg).join(' '));
      nativeWarn(...args);
    };

    window.addEventListener('error', (event) => {
      pushEntry('ERROR', 'window', event.message || 'Script error', event.filename ? `${event.filename}:${event.lineno}` : undefined);
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = (event as PromiseRejectionEvent).reason;
      pushEntry('ERROR', 'promise', reason instanceof Error ? reason.message : describeArg(reason));
    });
  }
}
