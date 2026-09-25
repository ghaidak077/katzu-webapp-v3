/**
 * One source of truth for the worker origin.
 *
 * Two callers need it: the API client (every endpoint) and the crash reporter
 * (which cannot import the API client — the client imports diagnostics, and a
 * cycle would make the constant undefined at module init).
 */
export const WORKER_BASE_URL = ((import.meta as any).env?.VITE_WORKER_URL || '').replace(/\/+$/, '');
