// Hash routes name a surface only. They never carry entry ids, filters, or search text,
// so a shared link reveals nothing about the journal behind it.

export const ROUTES = [
  { id: 'journal', label: 'Journal' },
  { id: 'new', label: 'Log a cup' },
  { id: 'archive', label: 'Archive' },
];

export const DEFAULT_ROUTE = 'journal';

const KNOWN = new Set(ROUTES.map((r) => r.id));

export function parseRoute(hash) {
  const match = /^#\/([a-z]+)\/?$/.exec(hash ?? '');
  return match && KNOWN.has(match[1]) ? match[1] : DEFAULT_ROUTE;
}

export function routeHref(id) {
  return `#/${id}`;
}
