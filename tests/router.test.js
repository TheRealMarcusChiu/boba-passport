import { describe, expect, it } from 'vitest';
import { ROUTES, DEFAULT_ROUTE, parseRoute, routeHref } from '../src/lib/router.js';

describe('router', () => {
  it('defines exactly three shareable surfaces', () => {
    expect(ROUTES.map((r) => r.id)).toEqual(['journal', 'new', 'archive']);
    expect(DEFAULT_ROUTE).toBe('journal');
  });

  it('parses known hashes', () => {
    expect(parseRoute('#/journal')).toBe('journal');
    expect(parseRoute('#/new')).toBe('new');
    expect(parseRoute('#/archive')).toBe('archive');
    expect(parseRoute('#/archive/')).toBe('archive');
  });

  it('falls back to the default for empty, unknown, retired, or data-bearing hashes', () => {
    expect(parseRoute('')).toBe('journal');
    expect(parseRoute('#')).toBe('journal');
    expect(parseRoute('#/nope')).toBe('journal');
    expect(parseRoute('#/log')).toBe('journal');
    expect(parseRoute('#/stats')).toBe('journal');
    expect(parseRoute('#/new?shop=secret')).toBe('journal');
    expect(parseRoute('#/journal/some-entry-id')).toBe('journal');
  });

  it('builds hrefs that contain only the route name', () => {
    ROUTES.forEach((r) => expect(routeHref(r.id)).toBe(`#/${r.id}`));
  });
});
