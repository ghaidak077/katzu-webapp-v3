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

const MAX_LOG_ENTRIES = 400;
const MAX_LINE_LENGTH = 400;

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
