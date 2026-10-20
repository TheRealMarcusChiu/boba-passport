// localStorage persistence plus JSON backup export/import.
// Nothing here talks to a network; data only moves when the user exports a file.

import { normalizeRecord } from './entry.js';

export const STORAGE_KEY = 'boba-passport:v1:entries';
export const RECOVERY_KEY = 'boba-passport:v1:recovered';
export const APP_ID = 'boba-passport';
export const FORMAT_VERSION = 1;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_ENTRIES = 5000;

function preserve(storage, raw) {
  try {
    if (storage.getItem(RECOVERY_KEY) === null) storage.setItem(RECOVERY_KEY, raw);
  } catch {
    // Best effort only; the warning still tells the user something went wrong.
  }
}

export function loadEntries(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { entries: [], warning: 'This browser is blocking local storage, so entries cannot be saved here.' };
  }
  if (raw === null) return { entries: [], warning: null };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) {
    preserve(storage, raw);
    return {
      entries: [],
      warning: `Saved data could not be read. A copy was kept in local storage under "${RECOVERY_KEY}".`,
    };
  }

  const entries = [];
  const ids = new Set();
  let dropped = 0;
  for (const record of data.entries) {
    const result = normalizeRecord(record);
    if (!result.ok || ids.has(result.entry.id)) {
      dropped += 1;
      continue;
    }
    ids.add(result.entry.id);
    entries.push(result.entry);
  }
  if (dropped) {
    preserve(storage, raw);
    return {
      entries,
      warning: `${dropped} saved ${dropped === 1 ? 'entry was' : 'entries were'} unreadable and hidden. The original data was kept under "${RECOVERY_KEY}".`,
    };
  }
  return { entries, warning: null };
}

export function saveEntries(storage, entries) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: FORMAT_VERSION, entries }));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: /quota/i.test(String(error?.name ?? '') + String(error?.message ?? ''))
        ? 'Browser storage is full. Export a backup and remove some entries.'
        : 'This browser would not save the change. Private browsing modes sometimes block storage.',
    };
  }
}

export function buildExport(entries, now = new Date()) {
  return { app: APP_ID, version: FORMAT_VERSION, exportedAt: now.toISOString(), entries };
}

export function exportFileName(now = new Date()) {
  return `boba-passport-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Parse and validate a backup file. All-or-nothing: one bad entry rejects the file,
 * so a partial import never silently loses data.
 */
export function parseBackup(text, { now = new Date() } = {}) {
  if (typeof text !== 'string') return { ok: false, error: 'The file could not be read as text.' };
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: 'That file is too large to be a Boba Passport backup (limit 5 MB).' };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.app !== APP_ID) {
    return { ok: false, error: 'That file is not a Boba Passport backup.' };
  }
  if (data.version !== FORMAT_VERSION) {
    return { ok: false, error: `Unsupported backup version (${String(data.version).slice(0, 20)}).` };
  }
  if (!Array.isArray(data.entries)) return { ok: false, error: 'The backup has no entries list.' };
  if (data.entries.length > MAX_ENTRIES) {
    return { ok: false, error: `The backup has more than ${MAX_ENTRIES} entries.` };
  }

  const entries = [];
  const ids = new Set();
  for (let i = 0; i < data.entries.length; i += 1) {
    const result = normalizeRecord(data.entries[i], { now });
    if (!result.ok) return { ok: false, error: `Entry ${i + 1} ${result.error.replace(/^[A-Z]/, (c) => c.toLowerCase())}` };
    if (ids.has(result.entry.id)) return { ok: false, error: `Entry ${i + 1} repeats an id used earlier in the file.` };
    ids.add(result.entry.id);
    entries.push(result.entry);
  }
  return { ok: true, entries };
}

export function mergeEntries(existing, incoming, mode) {
  if (mode === 'replace') return incoming.slice();
  const byId = new Map(incoming.map((e) => [e.id, e]));
  const merged = existing.map((e) => byId.get(e.id) ?? e);
  const existingIds = new Set(existing.map((e) => e.id));
  return merged.concat(incoming.filter((e) => !existingIds.has(e.id)));
}
