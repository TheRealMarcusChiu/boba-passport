// Tiny element builder. Children are appended as text nodes unless they are
// already nodes, so user-provided strings can never be interpreted as markup.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Decorative inline SVG from a list of [tag, attrs] pairs. */
export function icon(name, parts, size = 20) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon icon-${name}`);
  for (const [tag, attrs] of parts) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}

export const ICONS = {
  cup: () =>
    icon('cup', [
      ['path', { d: 'M6 7h12l-1.4 12.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6 7z' }],
      ['path', { d: 'M5 7h14M12 7 14.5 2.5' }],
      ['circle', { cx: '10', cy: '17', r: '1' }],
      ['circle', { cx: '13.5', cy: '16', r: '1' }],
      ['circle', { cx: '12', cy: '18.6', r: '1' }],
    ], 28),
  lock: () =>
    icon('lock', [
      ['rect', { x: '5', y: '11', width: '14', height: '10', rx: '2' }],
      ['path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }],
    ], 18),
  star: () => icon('star', [['path', { d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z' }]], 16),
};
