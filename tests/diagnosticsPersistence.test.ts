import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What crash evidence survives a reload.
 *
 * The buffer is in memory, so before this a page that crashed hard enough for the
 * learner to reload it reported *nothing* — the export they were asked to send
 * carried none of the evidence. These tests pin the two rules that make the
 * persistence safe: only messages that are already allowed to leave the device are
 * stored, and a missing, full or corrupted store never breaks the app.
 */
const STORAGE_KEY = 'kz-diagnostics-crashes';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  } as Storage;
}

type Diagnostics = typeof import('@/lib/utils/diagnostics');

/** Module state as it is on a cold app start: empty buffer, storage untouched. */
async function coldStart(): Promise<Diagnostics> {
  vi.resetModules();
  return import('@/lib/utils/diagnostics');
}

/** A fresh module with an empty buffer *and* an empty store. */
async function freshModule(): Promise<Diagnostics> {
  const module = await coldStart();
  module.clearDiagnostics();
  return module;
}

describe('persisted crash evidence', () => {
  let storage: Storage;

  beforeEach(() => {
    vi.unstubAllGlobals();
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('keeps the app’s own errors so a reload can still report them', async () => {
    const diagnostics = await freshModule();
    diagnostics.logError('ai/turn', 'Turn failed (NETWORK_ERROR)');
    diagnostics.logError('stt', 'Speech recognition error: no-speech');

    const stored = JSON.parse(storage.getItem(STORAGE_KEY) as string);
    expect(stored).toHaveLength(2);
    expect(stored.map((row: { scope: string }) => row.scope)).toEqual(['ai/turn', 'stt']);
  });

  it('never stores console output, which can carry the learner’s own sentence', async () => {
    // `console.error` is captured into the buffer (that is what makes a pasted
    // export useful), but it is the one source that can hold a sentence the learner
    // actually said, so it must never be written to storage.
    vi.stubGlobal('window', { addEventListener: () => {} });
    const diagnostics = await coldStart();
    diagnostics.installDiagnosticsCapture();
    console.error('learner sentence: Ich möchte einen Kaffee bitte');

    expect(diagnostics.getDiagnostics().some((entry) => entry.scope === 'console')).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY) || '[]')).toHaveLength(0);
  });

  it('restores the previous session without duplicating it', async () => {
    const first = await freshModule();
    first.logError('ai/turn', 'Turn failed (AI_EMPTY_REPLY)');

    // A reload: fresh module state, same storage.
    const second = await coldStart();
    expect(second.rehydrateDiagnostics()).toBe(1);
    expect(second.getDiagnostics().map((entry) => entry.scope)).toEqual(['ai/turn']);

    // Reloading again repeats the same tail rather than appending it twice.
    const third = await coldStart();
    expect(third.rehydrateDiagnostics()).toBe(1);
    expect(third.getDiagnostics()).toHaveLength(1);
  });

  it('ignores a corrupted payload and keeps working', async () => {
    storage.setItem(STORAGE_KEY, '{not json');
    const diagnostics = await freshModule();
    expect(diagnostics.rehydrateDiagnostics()).toBe(0);
    diagnostics.logError('window', 'boom');
    expect(JSON.parse(storage.getItem(STORAGE_KEY) as string)).toHaveLength(1);
  });

  it('bounds what is stored, so local storage cannot grow without limit', async () => {
    const diagnostics = await freshModule();
    for (let index = 0; index < 60; index += 1) {
      diagnostics.logError('window', `crash ${index}`);
    }
    const stored = JSON.parse(storage.getItem(STORAGE_KEY) as string);
    expect(stored).toHaveLength(40);
    expect(stored[stored.length - 1].message).toBe('crash 59');
  });

  it('survives storage being unavailable at all', async () => {
    vi.stubGlobal('localStorage', undefined);
    const diagnostics = await freshModule();
    expect(diagnostics.rehydrateDiagnostics()).toBe(0);
    expect(() => diagnostics.logError('window', 'boom')).not.toThrow();
    expect(diagnostics.getDiagnostics().map((entry) => entry.scope)).toEqual(['window']);
  });
});
