// Dashboard numbers, derived only from the entries passed in.

const round = (value, places) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const fold = (text) => text.trim().toLowerCase();

/** Most frequent value (case-insensitive), ties broken alphabetically. */
function mostFrequent(values) {
  const counts = new Map();
  for (const value of values) {
    const key = fold(value);
    if (!key) continue;
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { name: value.trim(), count: 1 });
  }
  let best = null;
  for (const item of counts.values()) {
    if (!best || item.count > best.count || (item.count === best.count && item.name.localeCompare(best.name) < 0)) {
      best = item;
    }
  }
  return best ? { name: best.name, count: best.count } : null;
}

function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeStats(entries) {
  const places = new Set(entries.map((e) => `${fold(e.shop)}|${fold(e.place ?? '')}`));

  const ratings = entries.map((e) => e.rating).filter((r) => typeof r === 'number');
  const averageRating = ratings.length ? round(ratings.reduce((a, b) => a + b, 0) / ratings.length, 1) : null;

  const shop = mostFrequent(entries.map((e) => e.shop));

  const prices = entries
    .map((e) => e.price)
    .filter((p) => typeof p === 'number')
    .sort((a, b) => a - b);
  const price = prices.length
    ? {
        count: prices.length,
        min: prices[0],
        max: prices[prices.length - 1],
        average: round(prices.reduce((a, b) => a + b, 0) / prices.length, 2),
        median: round(median(prices), 2),
      }
    : null;

  return {
    total: entries.length,
    places: entries.length ? places.size : 0,
    averageRating,
    ratedCount: ratings.length,
    favoriteTexture: mostFrequent(entries.flatMap((e) => e.toppings ?? [])),
    favoriteTag: mostFrequent(entries.flatMap((e) => e.tags ?? [])),
    topShop: shop && shop.count > 1 ? shop : null,
    price,
  };
}
