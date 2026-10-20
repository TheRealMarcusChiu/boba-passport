// Search, filter, and sort for the journal gallery. Pure functions; inputs are never mutated.

export const SORTS = [
  { value: 'recent', label: 'Most recent visit' },
  { value: 'oldest', label: 'Oldest visit' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'shop', label: 'Shop name A–Z' },
];

const fold = (text) => String(text ?? '').toLowerCase();

function haystack(entry) {
  return fold(
    [entry.shop, entry.drink, entry.place, entry.notes, entry.teaBase, ...(entry.tags ?? []), ...(entry.toppings ?? [])].join(' '),
  );
}

/** Compare with missing values (null / '') always sorting last, regardless of direction. */
function missingLast(a, b, compare) {
  const aMissing = a === null || a === undefined || a === '';
  const bMissing = b === null || b === undefined || b === '';
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  return compare(a, b);
}

const byVisit = (direction) => (a, b) =>
  missingLast(a.visitDate, b.visitDate, (x, y) => direction * x.localeCompare(y)) ||
  direction * String(a.createdAt).localeCompare(String(b.createdAt));

const COMPARATORS = {
  recent: byVisit(-1),
  oldest: byVisit(1),
  rating: (a, b) => missingLast(a.rating, b.rating, (x, y) => y - x) || byVisit(-1)(a, b),
  'price-asc': (a, b) => missingLast(a.price, b.price, (x, y) => x - y) || byVisit(-1)(a, b),
  'price-desc': (a, b) => missingLast(a.price, b.price, (x, y) => y - x) || byVisit(-1)(a, b),
  shop: (a, b) => a.shop.localeCompare(b.shop, undefined, { sensitivity: 'base' }) || byVisit(-1)(a, b),
};

export function applyQuery(entries, { search = '', minRating = 0, tag = '', texture = '', sort = 'recent' } = {}) {
  const words = fold(search).split(/\s+/).filter(Boolean);
  const wantTag = fold(tag);
  const wantTexture = fold(texture);
  const min = Number(minRating) || 0;

  const result = entries.filter((entry) => {
    if (min && !(entry.rating >= min)) return false;
    if (wantTag && !(entry.tags ?? []).some((t) => fold(t) === wantTag)) return false;
    if (wantTexture && !(entry.toppings ?? []).some((t) => fold(t) === wantTexture)) return false;
    if (words.length) {
      const text = haystack(entry);
      if (!words.every((word) => text.includes(word))) return false;
    }
    return true;
  });

  return result.sort(COMPARATORS[sort] ?? COMPARATORS.recent);
}

function distinct(values) {
  const map = new Map();
  for (const value of values) {
    const key = fold(value);
    if (key && !map.has(key)) map.set(key, value);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Tags and textures that actually appear in the data, for filter menus. */
export function collectFacets(entries) {
  return {
    tags: distinct(entries.flatMap((e) => e.tags ?? [])),
    textures: distinct(entries.flatMap((e) => e.toppings ?? [])),
  };
}
