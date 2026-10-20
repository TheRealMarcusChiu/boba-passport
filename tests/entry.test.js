import { describe, expect, it } from 'vitest';
import {
  ICE_LEVELS,
  SWEETNESS_LEVELS,
  LIMITS,
  makeEntry,
  validateEntry,
} from '../src/lib/entry.js';

describe('validateEntry', () => {
  it('requires shop and drink', () => {
    const result = validateEntry({ shop: '   ', drink: '' });
    expect(result.ok).toBe(false);
    expect(result.errors.shop).toMatch(/shop/i);
    expect(result.errors.drink).toMatch(/drink|order/i);
  });

  it('accepts a minimal entry and fills optional fields with empty defaults', () => {
    const result = validateEntry({ shop: ' Leaf & Pearl ', drink: 'Oolong milk tea' });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      shop: 'Leaf & Pearl',
      drink: 'Oolong milk tea',
      visitDate: '',
      place: '',
      price: null,
      teaBase: '',
      sweetness: '',
      ice: '',
      toppings: [],
      tags: [],
      notes: '',
      rating: null,
    });
  });

  it('accepts a fully populated entry from form-style strings', () => {
    const result = validateEntry({
      shop: 'Leaf & Pearl',
      drink: 'Brown sugar milk',
      visitDate: '2026-03-14',
      place: 'Sunset, SF',
      price: '6.5',
      teaBase: 'Black',
      sweetness: SWEETNESS_LEVELS[2],
      ice: ICE_LEVELS[1],
      toppings: 'Boba, pudding, boba',
      tags: ['Cozy', 'cozy', ' Late night '],
      notes: 'Chewy pearls.',
      rating: '4',
    });
    expect(result.ok).toBe(true);
    expect(result.value.price).toBe(6.5);
    expect(result.value.rating).toBe(4);
    expect(result.value.toppings).toEqual(['Boba', 'pudding']);
    expect(result.value.tags).toEqual(['Cozy', 'Late night']);
  });

  it('rejects impossible dates, negative prices, and out-of-range ratings', () => {
    const result = validateEntry({
      shop: 'A',
      drink: 'B',
      visitDate: '2026-02-30',
      price: '-1',
      rating: 6,
    });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['price', 'rating', 'visitDate']);
  });

  it('rejects non-integer ratings and non-numeric prices', () => {
    expect(validateEntry({ shop: 'A', drink: 'B', rating: 3.5 }).errors.rating).toBeTruthy();
    expect(validateEntry({ shop: 'A', drink: 'B', price: 'cheap' }).errors.price).toBeTruthy();
  });

  it('rounds price to cents', () => {
    expect(validateEntry({ shop: 'A', drink: 'B', price: 5.999 }).value.price).toBe(6);
  });

  it('rejects unknown sweetness and ice values', () => {
    const result = validateEntry({ shop: 'A', drink: 'B', sweetness: 'extreme', ice: 'lava' });
    expect(result.errors.sweetness).toBeTruthy();
    expect(result.errors.ice).toBeTruthy();
  });

  it('enforces length limits', () => {
    const result = validateEntry({
      shop: 'x'.repeat(LIMITS.shop + 1),
      drink: 'ok',
      notes: 'n'.repeat(LIMITS.notes + 1),
    });
    expect(result.errors.shop).toBeTruthy();
    expect(result.errors.notes).toBeTruthy();
  });

  it('rejects non-string text fields instead of coercing objects', () => {
    const result = validateEntry({ shop: { toString: () => 'evil' }, drink: ['x'] });
    expect(result.ok).toBe(false);
  });

  it('ignores unknown keys, including prototype-polluting ones', () => {
    const input = JSON.parse('{"shop":"A","drink":"B","__proto__":{"polluted":true},"extra":1}');
    const result = validateEntry(input);
    expect(result.ok).toBe(true);
    expect(result.value).not.toHaveProperty('extra');
    expect({}.polluted).toBeUndefined();
  });

  it('caps the number of tags', () => {
    const tags = Array.from({ length: LIMITS.listItems + 1 }, (_, i) => `t${i}`);
    expect(validateEntry({ shop: 'A', drink: 'B', tags }).errors.tags).toBeTruthy();
  });
});

describe('makeEntry', () => {
  it('adds identity and timestamps', () => {
    const now = new Date('2026-05-01T10:00:00Z');
    const entry = makeEntry({ shop: 'A', drink: 'B' }, { now, id: 'id-1' });
    expect(entry).toMatchObject({
      id: 'id-1',
      shop: 'A',
      drink: 'B',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it('preserves createdAt when updating an existing entry', () => {
    const created = makeEntry({ shop: 'A', drink: 'B' }, { now: new Date('2026-01-01T00:00:00Z'), id: 'x' });
    const updated = makeEntry({ shop: 'A', drink: 'C' }, { now: new Date('2026-02-01T00:00:00Z'), previous: created });
    expect(updated.id).toBe('x');
    expect(updated.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(updated.updatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(updated.drink).toBe('C');
  });

  it('throws on invalid input', () => {
    expect(() => makeEntry({ shop: '', drink: '' })).toThrow();
  });

  it('generates unique ids by default', () => {
    const a = makeEntry({ shop: 'A', drink: 'B' });
    const b = makeEntry({ shop: 'A', drink: 'B' });
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});
