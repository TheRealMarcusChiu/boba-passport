// Entry schema, validation, and construction. Everything that enters the app —
// form input, stored data, imported backups — passes through validateEntry so
// there is exactly one definition of a well-formed entry.

export const SWEETNESS_LEVELS = ['0%', '25%', '50%', '75%', '100%'];
export const ICE_LEVELS = ['No ice', 'Light ice', 'Regular ice', 'Extra ice', 'Hot'];
export const TEA_BASES = ['Black', 'Green', 'Oolong', 'Jasmine', 'Matcha', 'Hojicha', 'Earl Grey', 'Fruit', 'Milk', 'Herbal'];
export const TEXTURE_OPTIONS = ['Boba', 'Mini pearls', 'Pudding', 'Grass jelly', 'Cheese foam', 'Lychee jelly', 'Red bean', 'Taro', 'Aloe', 'Coconut jelly'];
export const ATMOSPHERE_TAGS = ['Cozy', 'Quiet', 'Lively', 'Good for work', 'Late night', 'Outdoor seating', 'Takeaway only', 'Date spot'];

export const LIMITS = Object.freeze({
  shop: 80,
  drink: 120,
  place: 80,
  teaBase: 60,
  notes: 2000,
  listItem: 40,
  listItems: 20,
  maxPrice: 100000,
});

const TEXT_FIELDS = [
  ['shop', 'Shop', true],
  ['drink', 'Drink or order', true],
  ['place', 'City or neighborhood', false],
  ['teaBase', 'Tea base', false],
  ['notes', 'Notes', false],
];

function readText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return undefined;
  return value.trim();
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function readList(value) {
  if (value === undefined || value === null || value === '') return [];
  const raw = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) return undefined;
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const clean = item.trim().replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function readNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return undefined;
}

/**
 * Validate and normalize raw entry fields.
 * Returns { ok, value, errors } where value contains only known fields.
 */
export function validateEntry(input) {
  const source = input && typeof input === 'object' ? input : {};
  const errors = {};
  const value = {};

  for (const [key, label, required] of TEXT_FIELDS) {
    const text = readText(source[key]);
    if (text === undefined) {
      errors[key] = `${label} must be text.`;
    } else if (required && !text) {
      errors[key] = `${label} is required.`;
    } else if (text.length > LIMITS[key]) {
      errors[key] = `${label} must be ${LIMITS[key]} characters or fewer.`;
    }
    value[key] = text ?? '';
  }

  const visitDate = readText(source.visitDate);
  if (visitDate === undefined || (visitDate && !isRealDate(visitDate))) {
    errors.visitDate = 'Visit date must be a real date (YYYY-MM-DD).';
  }
  value.visitDate = visitDate && !errors.visitDate ? visitDate : '';

  const price = readNumber(source.price);
  if (price === undefined || (price !== null && (price < 0 || price > LIMITS.maxPrice))) {
    errors.price = 'Price must be a number of zero or more.';
    value.price = null;
  } else {
    value.price = price === null ? null : Math.round(price * 100) / 100;
  }

  for (const [key, options, label] of [
    ['sweetness', SWEETNESS_LEVELS, 'Sweetness'],
    ['ice', ICE_LEVELS, 'Ice'],
  ]) {
    const choice = readText(source[key]);
    if (choice === undefined || (choice && !options.includes(choice))) {
      errors[key] = `${label} must be one of: ${options.join(', ')}.`;
    }
    value[key] = choice && !errors[key] ? choice : '';
  }

  for (const [key, label] of [
    ['toppings', 'Toppings'],
    ['tags', 'Atmosphere tags'],
  ]) {
    const list = readList(source[key]);
    if (list === undefined) {
      errors[key] = `${label} must be a list of words.`;
    } else if (list.length > LIMITS.listItems) {
      errors[key] = `${label}: keep it to ${LIMITS.listItems} or fewer.`;
    } else if (list.some((item) => item.length > LIMITS.listItem)) {
      errors[key] = `${label}: each item must be ${LIMITS.listItem} characters or fewer.`;
    }
    value[key] = errors[key] ? [] : list;
  }

  const rating = readNumber(source.rating);
  if (rating === undefined || (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5))) {
    errors.rating = 'Rating must be a whole number from 1 to 5.';
    value.rating = null;
  } else {
    value.rating = rating;
  }

  const ordered = {
    shop: value.shop,
    drink: value.drink,
    visitDate: value.visitDate,
    place: value.place,
    price: value.price,
    teaBase: value.teaBase,
    sweetness: value.sweetness,
    ice: value.ice,
    toppings: value.toppings,
    tags: value.tags,
    notes: value.notes,
    rating: value.rating,
  };
  const ok = Object.keys(errors).length === 0;
  return { ok, value: ordered, errors };
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build a full stored entry from raw fields. Throws if the fields are invalid.
 * Pass `previous` to update an existing entry while keeping its identity.
 */
export function makeEntry(input, { now = new Date(), id, previous } = {}) {
  const result = validateEntry(input);
  if (!result.ok) {
    const first = Object.values(result.errors)[0];
    throw new Error(`Invalid entry: ${first}`);
  }
  const stamp = now.toISOString();
  return {
    id: previous?.id ?? id ?? newId(),
    ...result.value,
    createdAt: previous?.createdAt ?? stamp,
    updatedAt: stamp,
  };
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isTimestamp(value) {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

/**
 * Normalize an entry record from storage or a backup file.
 * Returns { ok: true, entry } or { ok: false, error }.
 */
export function normalizeRecord(raw, { now = new Date() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'is not an object' };
  }
  const result = validateEntry(raw);
  if (!result.ok) return { ok: false, error: Object.values(result.errors)[0] };

  if (raw.id !== undefined && (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id))) {
    return { ok: false, error: 'has an invalid id' };
  }
  for (const key of ['createdAt', 'updatedAt']) {
    if (raw[key] !== undefined && !isTimestamp(raw[key])) {
      return { ok: false, error: `has an invalid ${key}` };
    }
  }
  const stamp = now.toISOString();
  const createdAt = raw.createdAt ? new Date(raw.createdAt).toISOString() : stamp;
  return {
    ok: true,
    entry: {
      id: raw.id ?? newId(),
      ...result.value,
      createdAt,
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : createdAt,
    },
  };
}
