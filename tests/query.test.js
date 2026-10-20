import { describe, expect, it } from 'vitest';
import { applyQuery, collectFacets, SORTS } from '../src/lib/query.js';
import { makeEntry } from '../src/lib/entry.js';

const now = new Date('2026-06-01T00:00:00Z');
const make = (id, fields, created = now) =>
  makeEntry({ shop: 'Shop', drink: 'Drink', ...fields }, { id, now: created });

const entries = [
  make('a', { shop: 'Leaf & Pearl', drink: 'Oolong milk tea', visitDate: '2026-03-01', rating: 4, price: 6, tags: ['Cozy'], toppings: ['Boba'], place: 'Sunset' }),
  make('b', { shop: 'Moss Cup', drink: 'Matcha latte', visitDate: '2026-05-10', rating: 5, price: 7.5, tags: ['Quiet'], toppings: ['Cheese foam'], notes: 'grassy and bright' }),
  make('c', { shop: 'Amber Room', drink: 'Jasmine green', rating: 2, tags: ['cozy', 'Loud'] }, new Date('2026-04-01T00:00:00Z')),
  make('d', { shop: 'Leaf & Pearl', drink: 'Taro slush', visitDate: '2026-01-20', price: 5, toppings: ['boba', 'Taro'] }),
];

const ids = (list) => list.map((x) => x.id);

describe('applyQuery', () => {
  it('returns everything with default options, newest visit first', () => {
    expect(ids(applyQuery(entries))).toEqual(['b', 'a', 'd', 'c']);
  });

  it('searches across shop, drink, place, notes, tags, and toppings case-insensitively', () => {
    expect(ids(applyQuery(entries, { search: 'leaf' }))).toEqual(['a', 'd']);
    expect(ids(applyQuery(entries, { search: 'GRASSY' }))).toEqual(['b']);
    expect(ids(applyQuery(entries, { search: 'sunset' }))).toEqual(['a']);
    expect(ids(applyQuery(entries, { search: 'cheese' }))).toEqual(['b']);
    expect(ids(applyQuery(entries, { search: '  ' }))).toHaveLength(4);
  });

  it('requires every search word to match', () => {
    expect(ids(applyQuery(entries, { search: 'leaf taro' }))).toEqual(['d']);
  });

  it('filters by minimum rating, excluding unrated entries', () => {
    expect(ids(applyQuery(entries, { minRating: 4 }))).toEqual(['b', 'a']);
  });

  it('filters by tag and texture case-insensitively', () => {
    expect(ids(applyQuery(entries, { tag: 'cozy' }))).toEqual(['a', 'c']);
    expect(ids(applyQuery(entries, { texture: 'BOBA' }))).toEqual(['a', 'd']);
  });

  it('sorts by rating, price, oldest, and shop name with missing values last', () => {
    expect(ids(applyQuery(entries, { sort: 'rating' }))).toEqual(['b', 'a', 'c', 'd']);
    expect(ids(applyQuery(entries, { sort: 'price-asc' }))).toEqual(['d', 'a', 'b', 'c']);
    expect(ids(applyQuery(entries, { sort: 'price-desc' }))).toEqual(['b', 'a', 'd', 'c']);
    expect(ids(applyQuery(entries, { sort: 'oldest' }))).toEqual(['d', 'a', 'b', 'c']);
    expect(ids(applyQuery(entries, { sort: 'shop' }))).toEqual(['c', 'a', 'd', 'b']);
  });

  it('falls back to the default sort for unknown sort keys', () => {
    expect(ids(applyQuery(entries, { sort: 'nope' }))).toEqual(ids(applyQuery(entries)));
  });

  it('does not mutate its input', () => {
    const copy = entries.slice();
    applyQuery(entries, { sort: 'shop' });
    expect(entries).toEqual(copy);
  });

  it('exposes labelled sort options', () => {
    expect(SORTS.map((s) => s.value)).toEqual(['recent', 'oldest', 'rating', 'price-asc', 'price-desc', 'shop']);
    SORTS.forEach((s) => expect(s.label).toBeTruthy());
  });
});

describe('collectFacets', () => {
  it('lists distinct tags and textures present in the data, case-folded and sorted', () => {
    expect(collectFacets(entries)).toEqual({
      tags: ['Cozy', 'Loud', 'Quiet'],
      textures: ['Boba', 'Cheese foam', 'Taro'],
    });
  });
});
