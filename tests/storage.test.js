import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  RECOVERY_KEY,
  MAX_IMPORT_BYTES,
  loadEntries,
  saveEntries,
  buildExport,
  exportFileName,
  parseBackup,
  mergeEntries,
} from '../src/lib/storage.js';
import { makeEntry } from '../src/lib/entry.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

const now = new Date('2026-07-04T12:00:00Z');
const entry = (id, fields = {}) => makeEntry({ shop: 'S', drink: 'D', ...fields }, { id, now });

describe('loadEntries / saveEntries', () => {
  let storage;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(loadEntries(storage)).toEqual({ entries: [], warning: null });
  });

  it('round-trips entries through a versioned envelope', () => {
    const list = [entry('a'), entry('b', { rating: 5 })];
    expect(saveEntries(storage, list)).toEqual({ ok: true });
    const raw = JSON.parse(storage.getItem(STORAGE_KEY));
    expect(raw.version).toBe(1);
    expect(loadEntries(storage).entries).toEqual(list);
  });

  it('preserves corrupt data in a recovery key instead of discarding it', () => {
    storage.setItem(STORAGE_KEY, '{not json');
    const result = loadEntries(storage);
    expect(result.entries).toEqual([]);
    expect(result.warning).toMatch(/could not be read/i);
    expect(storage.getItem(RECOVERY_KEY)).toBe('{not json');
  });

  it('drops individually invalid stored entries but keeps valid ones and warns', () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, entries: [entry('ok'), { id: 'bad', shop: '', drink: '' }] }),
    );
    const result = loadEntries(storage);
    expect(result.entries.map((x) => x.id)).toEqual(['ok']);
    expect(result.warning).toMatch(/1/);
    expect(storage.getItem(RECOVERY_KEY)).toBeTruthy();
  });

  it('reports quota or access failures without throwing', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const result = saveEntries(failing, [entry('a')]);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('survives storage being unavailable on read', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    const result = loadEntries(blocked);
    expect(result.entries).toEqual([]);
    expect(result.warning).toBeTruthy();
  });
});

describe('export', () => {
  it('builds a self-describing backup', () => {
    const data = buildExport([entry('a')], now);
    expect(data).toMatchObject({ app: 'boba-passport', version: 1, exportedAt: now.toISOString() });
    expect(data.entries).toHaveLength(1);
  });

  it('names the file with the date', () => {
    expect(exportFileName(now)).toBe('boba-passport-2026-07-04.json');
  });

  it('exports data that parseBackup accepts unchanged', () => {
    const list = [entry('a', { tags: ['Cozy'], price: 5 }), entry('b')];
    const text = JSON.stringify(buildExport(list, now));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.entries).toEqual(list);
  });
});

describe('parseBackup', () => {
  const wrap = (entries, extra = {}) => JSON.stringify({ app: 'boba-passport', version: 1, entries, ...extra });

  it('rejects invalid JSON', () => {
    expect(parseBackup('nope')).toMatchObject({ ok: false });
  });

  it('rejects files from other apps or unknown versions', () => {
    expect(parseBackup(JSON.stringify({ app: 'other', version: 1, entries: [] })).ok).toBe(false);
    expect(parseBackup(wrap([], { version: 99 })).ok).toBe(false);
    expect(parseBackup(JSON.stringify([entry('a')])).ok).toBe(false);
  });

  it('rejects oversized files before parsing', () => {
    const result = parseBackup('x'.repeat(MAX_IMPORT_BYTES + 1));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });

  it('rejects the whole file when any entry is invalid, naming the entry', () => {
    const result = parseBackup(wrap([entry('a'), { id: 'b', shop: 'S', drink: '', rating: 9 }]));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/entry 2/i);
  });

  it('rejects duplicate ids', () => {
    expect(parseBackup(wrap([entry('a'), entry('a')])).ok).toBe(false);
  });

  it('assigns ids and timestamps to entries that lack them', () => {
    const result = parseBackup(wrap([{ shop: 'S', drink: 'D' }]), { now });
    expect(result.ok).toBe(true);
    expect(result.entries[0].id).toBeTruthy();
    expect(result.entries[0].createdAt).toBe(now.toISOString());
  });

  it('strips unknown fields and never pollutes prototypes', () => {
    const text = `{"app":"boba-passport","version":1,"entries":[{"id":"a","shop":"S","drink":"D","__proto__":{"hacked":1},"script":"<b>"}]}`;
    const result = parseBackup(text);
    expect(result.ok).toBe(true);
    expect(result.entries[0]).not.toHaveProperty('script');
    expect({}.hacked).toBeUndefined();
  });

  it('rejects malformed ids and timestamps', () => {
    expect(parseBackup(wrap([{ ...entry('a'), id: 42 }])).ok).toBe(false);
    expect(parseBackup(wrap([{ ...entry('a'), createdAt: 'yesterday' }])).ok).toBe(false);
  });
});

describe('mergeEntries', () => {
  it('replace mode returns only incoming entries', () => {
    expect(mergeEntries([entry('a')], [entry('b')], 'replace').map((x) => x.id)).toEqual(['b']);
  });

  it('merge mode keeps existing, adds new, and lets incoming win on id clashes', () => {
    const existing = [entry('a', { drink: 'old' }), entry('b')];
    const incoming = [entry('a', { drink: 'new' }), entry('c')];
    const merged = mergeEntries(existing, incoming, 'merge');
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(merged[0].drink).toBe('new');
  });
});
