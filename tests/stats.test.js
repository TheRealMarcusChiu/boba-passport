import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/lib/stats.js';
import { makeEntry } from '../src/lib/entry.js';

let n = 0;
const e = (fields) => makeEntry({ shop: 'Shop', drink: 'Drink', ...fields }, { id: `e${n++}` });

describe('computeStats', () => {
  it('returns honest empty values when there is no data', () => {
    const stats = computeStats([]);
    expect(stats).toEqual({
      total: 0,
      places: 0,
      averageRating: null,
      ratedCount: 0,
      favoriteTexture: null,
      favoriteTag: null,
      topShop: null,
      price: null,
    });
  });

  it('counts distinct places by shop + neighborhood, case-insensitively', () => {
    const stats = computeStats([
      e({ shop: 'Leaf', place: 'Sunset' }),
      e({ shop: 'leaf ', place: 'sunset' }),
      e({ shop: 'Leaf', place: 'Mission' }),
      e({ shop: 'Pearl' }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.places).toBe(3);
  });

  it('averages only rated entries to one decimal', () => {
    const stats = computeStats([e({ rating: 5 }), e({ rating: 4 }), e({ rating: 4 }), e({})]);
    expect(stats.ratedCount).toBe(3);
    expect(stats.averageRating).toBe(4.3);
  });

  it('derives favorite texture and tag from actual frequency', () => {
    const stats = computeStats([
      e({ toppings: ['Boba', 'Pudding'], tags: ['Cozy'] }),
      e({ toppings: ['boba'], tags: ['Quiet', 'Cozy'] }),
      e({ toppings: ['Grass jelly'], tags: ['Quiet', 'cozy'] }),
    ]);
    expect(stats.favoriteTexture).toEqual({ name: 'Boba', count: 2 });
    expect(stats.favoriteTag).toEqual({ name: 'Cozy', count: 3 });
  });

  it('breaks frequency ties alphabetically so results are stable', () => {
    const stats = computeStats([e({ toppings: ['Taro'] }), e({ toppings: ['Aloe'] })]);
    expect(stats.favoriteTexture).toEqual({ name: 'Aloe', count: 1 });
  });

  it('reports the most-visited shop only when a shop repeats', () => {
    expect(computeStats([e({ shop: 'A' }), e({ shop: 'B' })]).topShop).toBeNull();
    expect(computeStats([e({ shop: 'A' }), e({ shop: 'a' }), e({ shop: 'B' })]).topShop).toEqual({
      name: 'A',
      count: 2,
    });
  });

  it('summarizes prices from entries that have one', () => {
    const stats = computeStats([e({ price: 4 }), e({ price: 7 }), e({ price: 5.5 }), e({ price: 6 }), e({})]);
    expect(stats.price).toEqual({ count: 4, min: 4, max: 7, average: 5.63, median: 5.75 });
  });

  it('includes free (zero-price) drinks in the price summary', () => {
    expect(computeStats([e({ price: 0 })]).price).toEqual({ count: 1, min: 0, max: 0, average: 0, median: 0 });
  });
});
