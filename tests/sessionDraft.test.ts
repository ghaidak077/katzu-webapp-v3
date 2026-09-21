import { describe, expect, it } from 'vitest';
import { clearAllSessionDrafts, clearSessionDraft, loadSessionDraft, saveSessionDraft } from '../src/lib/db/katzuDb';

class MemoryStorage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}

describe('session drafts', () => {
  const now = Date.parse('2026-09-21T10:00:00Z');
  const draft = { sessionId: 'session-1', mode: 'quick', level: 'A1', messages: [{ id: '1' }, { id: '2' }] };

  it('restores a draft for the same account and scenario only', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    saveSessionDraft('a@example.com', 'cafe', draft, storage, now);
    expect(loadSessionDraft('a@example.com', 'cafe', storage, now + 1000)?.sessionId).toBe('session-1');
    expect(loadSessionDraft('b@example.com', 'cafe', storage, now + 1000)).toBeNull();
    expect(loadSessionDraft('a@example.com', 'bank', storage, now + 1000)).toBeNull();
  });

  it('drops drafts older than 12 hours and corrupt entries', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    saveSessionDraft('a@example.com', 'cafe', draft, storage, now);
    expect(loadSessionDraft('a@example.com', 'cafe', storage, now + 13 * 3_600_000)).toBeNull();
    expect(storage.length).toBe(0);
    storage.setItem('katzu:draft:a@example.com:cafe', '{not json');
    expect(loadSessionDraft('a@example.com', 'cafe', storage, now)).toBeNull();
  });

  it('clears one draft or all drafts without touching other keys', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    storage.setItem('other', 'keep');
    saveSessionDraft('a@example.com', 'cafe', draft, storage, now);
    saveSessionDraft('a@example.com', 'bank', draft, storage, now);
    clearSessionDraft('a@example.com', 'cafe', storage);
    expect(loadSessionDraft('a@example.com', 'cafe', storage, now)).toBeNull();
    clearAllSessionDrafts(storage);
    expect(loadSessionDraft('a@example.com', 'bank', storage, now)).toBeNull();
    expect(storage.getItem('other')).toBe('keep');
  });

  it('never stores drafts without an account', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    saveSessionDraft('', 'cafe', draft, storage, now);
    expect(storage.length).toBe(0);
  });
});
