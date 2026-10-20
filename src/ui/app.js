import {
  ATMOSPHERE_TAGS,
  ICE_LEVELS,
  SWEETNESS_LEVELS,
  TEA_BASES,
  TEXTURE_OPTIONS,
  LIMITS,
  makeEntry,
  validateEntry,
} from '../lib/entry.js';
import { computeStats } from '../lib/stats.js';
import { SORTS, applyQuery, collectFacets } from '../lib/query.js';
import {
  buildExport,
  exportFileName,
  loadEntries,
  mergeEntries,
  parseBackup,
  saveEntries,
} from '../lib/storage.js';
import { ROUTES, parseRoute, routeHref } from '../lib/router.js';
import { DEMO_ENTRIES } from '../lib/demo.js';
import { ICONS, h } from './dom.js';

const EMPTY_FILTERS = { search: '', minRating: 0, tag: '', texture: '', sort: 'recent' };
const RECENT_COUNT = 3;

const formatPrice = (n) => n.toFixed(2);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function localToday(now) {
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function defaultDownload(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: filename, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function uniqueCaseless(...lists) {
  const seen = new Map();
  for (const item of lists.flat()) {
    const key = item.toLowerCase();
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

/** Replace a slot's content; `null` empties it (raw replaceChildren(null) would print "null"). */
function setSlot(slot, node) {
  if (node) slot.replaceChildren(node);
  else slot.replaceChildren();
}

function ratingLabel(rating) {
  return rating ? `Rated ${rating} of 5` : 'Not rated';
}

function stars(rating) {
  return h(
    'span',
    { class: 'stars', role: 'img', 'aria-label': ratingLabel(rating) },
    [1, 2, 3, 4, 5].map((i) => h('span', { class: i <= rating ? 'star on' : 'star', 'aria-hidden': 'true' }, '★')),
  );
}

/**
 * Mount the app into `root`.
 * Options are injectable for tests: storage, confirm, download, now.
 */
export function mountApp(
  root,
  {
    storage = window.localStorage,
    confirm = (message) => window.confirm(message),
    download = defaultDownload,
    now = () => new Date(),
  } = {},
) {
  const loaded = loadEntries(storage);
  const state = {
    entries: loaded.entries,
    warning: loaded.warning,
    demo: false,
    editingId: null,
    filters: { ...EMPTY_FILTERS },
    importPreview: null,
    route: null,
  };

  const visibleEntries = () => (state.demo ? DEMO_ENTRIES : state.entries);

  // ---------- shell ----------
  const status = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const toast = h('p', { class: 'toast', 'aria-hidden': 'true', hidden: true });
  const navLinks = new Map();
  const nav = h(
    'nav',
    { 'aria-label': 'Sections', class: 'tabs' },
    h(
      'ul',
      {},
      ROUTES.map((route) => {
        const link = h('a', { href: routeHref(route.id), class: 'tab' }, route.label);
        navLinks.set(route.id, link);
        return h('li', {}, link);
      }),
    ),
  );
  const warningSlot = h('div', { class: 'warning-slot' });
  const demoSlot = h('div', { class: 'demo-slot' });
  const main = h('main', { id: 'main', tabindex: '-1', class: 'view' });
  const dataSlot = h('div', { class: 'data-slot' });

  root.replaceChildren(
    h('a', { class: 'skip-link', href: '#main', onclick: skipToMain }, 'Skip to content'),
    h(
      'header',
      { class: 'masthead' },
      h(
        'div',
        { class: 'brand' },
        h('span', { class: 'brand-mark' }, ICONS.cup()),
        h('div', {}, h('p', { class: 'eyebrow' }, 'A private tea journal'), h('h1', {}, 'Boba Passport')),
      ),
      nav,
    ),
    h(
      'p',
      { class: 'privacy-note' },
      ICONS.lock(),
      h(
        'span',
        {},
        h('strong', {}, 'Private by design. '),
        'Your entries are saved only in this browser (localStorage). Nothing is uploaded, and clearing site data erases them — export a backup to keep a copy.',
      ),
    ),
    warningSlot,
    demoSlot,
    main,
    h('footer', { class: 'colophon' }, dataSlot, h('p', { class: 'fine-print' }, 'No accounts, no tracking, no network requests. Just your cups.')),
    status,
    toast,
  );

  function skipToMain(event) {
    // Keep the route hash intact; just move focus.
    event.preventDefault();
    main.focus();
  }

  let toastTimer;
  function announce(message) {
    status.textContent = '';
    // Re-set on the next frame so repeated identical messages are still announced.
    setTimeout(() => {
      status.textContent = message;
    }, 0);
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  function persist(next, message) {
    const result = saveEntries(storage, next);
    if (!result.ok) {
      state.warning = result.error;
      renderChrome();
      return false;
    }
    state.entries = next;
    if (message) announce(message);
    return true;
  }

  function navigate(route) {
    const href = routeHref(route);
    if (window.location.hash !== href) window.location.hash = href;
    render({ focus: true });
  }

  // ---------- chrome: nav, warnings, demo banner, data panel ----------
  function renderChrome() {
    for (const [id, link] of navLinks) {
      if (id === state.route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    setSlot(
      warningSlot,
      state.warning
        ? h(
            'div',
            { class: 'callout callout-warn', role: 'alert' },
            h('p', {}, state.warning),
            h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => ((state.warning = null), renderChrome()) }, 'Dismiss'),
          )
        : null,
    );

    setSlot(
      demoSlot,
      state.demo
        ? h(
            'div',
            { class: 'callout callout-demo' },
            h(
              'p',
              {},
              h('strong', {}, 'Sample journal. '),
              'You’re previewing made-up sample entries. They aren’t saved and never mix with your own data.',
            ),
            h('button', { type: 'button', class: 'btn', dataset: { action: 'exit-demo' }, onclick: exitDemo }, 'Exit sample'),
          )
        : null,
    );

    renderDataPanel();
  }

  function renderDataPanel() {
    const count = state.entries.length;
    const fileInput = h('input', {
      type: 'file',
      id: 'import-file',
      accept: 'application/json,.json',
      class: 'visually-hidden file-input',
      onchange: onImportFile,
    });
    dataSlot.replaceChildren(
      h(
        'section',
        { class: 'data-panel', 'aria-labelledby': 'data-heading' },
        h('h2', { id: 'data-heading', class: 'section-title' }, 'Your data'),
        h(
          'p',
          { class: 'muted' },
          count
            ? `${plural(count, 'entry', 'entries')} saved in this browser.`
            : 'Nothing saved yet in this browser.',
        ),
        h(
          'div',
          { class: 'button-row' },
          h(
            'button',
            { type: 'button', class: 'btn', dataset: { action: 'export' }, disabled: count === 0, onclick: onExport },
            'Export backup (JSON)',
          ),
          h('span', { class: 'file-picker' }, fileInput, h('label', { for: 'import-file', class: 'btn' }, 'Import backup…')),
          state.demo
            ? null
            : h('button', { type: 'button', class: 'btn btn-quiet', dataset: { action: 'demo' }, onclick: enterDemo }, 'Preview sample journal'),
        ),
        renderImportPreview(),
      ),
    );
  }

  function renderImportPreview() {
    const preview = state.importPreview;
    if (!preview) return null;
    if (preview.error) {
      return h(
        'div',
        { class: 'callout callout-warn', role: 'alert', dataset: { importResult: 'error' } },
        h('p', {}, `Import cancelled: ${preview.error} Your journal was not changed.`),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: clearImport }, 'Dismiss'),
      );
    }
    const existingIds = new Set(state.entries.map((e) => e.id));
    const updates = preview.entries.filter((e) => existingIds.has(e.id)).length;
    const additions = preview.entries.length - updates;
    return h(
      'div',
      { class: 'callout', role: 'group', 'aria-labelledby': 'import-heading', dataset: { importResult: 'ready' } },
      h('h3', { id: 'import-heading', tabindex: '-1' }, `Backup “${preview.name}” is valid`),
      h(
        'p',
        {},
        `It contains ${plural(preview.entries.length, 'entry', 'entries')}: ${additions} new, ${updates} matching existing ${updates === 1 ? 'entry' : 'entries'}.`,
      ),
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-gold', dataset: { action: 'import-merge' }, onclick: () => applyImport('merge') }, 'Merge into journal'),
        h('button', { type: 'button', class: 'btn', dataset: { action: 'import-replace' }, onclick: () => applyImport('replace') }, 'Replace journal'),
        h('button', { type: 'button', class: 'btn btn-quiet', dataset: { action: 'import-cancel' }, onclick: clearImport }, 'Cancel'),
      ),
    );
  }

  function onExport() {
    const text = JSON.stringify(buildExport(state.entries, now()), null, 2);
    download(exportFileName(now()), text);
    announce(`Exported ${plural(state.entries.length, 'entry', 'entries')}.`);
  }

  async function onImportFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      text = null;
    }
    const result = parseBackup(text, { now: now() });
    state.importPreview = result.ok ? { entries: result.entries, name: file.name } : { error: result.error };
    renderDataPanel();
    dataSlot.querySelector('#import-heading')?.focus();
  }

  function applyImport(mode) {
    const incoming = state.importPreview?.entries;
    if (!incoming) return;
    if (mode === 'replace' && state.entries.length && !confirm(`Replace all ${plural(state.entries.length, 'entry', 'entries')} in this browser with the backup? This can’t be undone.`)) {
      return;
    }
    const next = mergeEntries(state.entries, incoming, mode);
    if (persist(next, `Imported ${plural(incoming.length, 'entry', 'entries')}.`)) {
      state.importPreview = null;
      state.demo = false;
      render();
    }
  }

  function clearImport() {
    state.importPreview = null;
    renderDataPanel();
  }

  function enterDemo() {
    state.demo = true;
    state.filters = { ...EMPTY_FILTERS };
    render();
    announce('Showing the sample journal. Your own data is untouched.');
  }

  function exitDemo() {
    state.demo = false;
    state.filters = { ...EMPTY_FILTERS };
    render();
    announce('Left the sample journal.');
  }

  // ---------- journal (dashboard) ----------
  function renderJournal() {
    const entries = visibleEntries();
    const heading = h('h2', { tabindex: '-1', class: 'view-title' }, state.demo ? 'Sample journal' : 'Your journal');

    if (!entries.length) {
      return [
        heading,
        h(
          'div',
          { class: 'empty-state', dataset: { emptyState: '' } },
          h('div', { class: 'empty-mark', 'aria-hidden': 'true' }, ICONS.cup()),
          h('h3', {}, 'No entries yet'),
          h(
            'p',
            {},
            'Log the next cup you love (or don’t): the shop, what you ordered, and as much or as little detail as you like. Stats build up from your own entries.',
          ),
          h(
            'div',
            { class: 'button-row center' },
            h('a', { href: routeHref('new'), class: 'btn btn-gold' }, 'Log your first cup'),
            h('button', { type: 'button', class: 'btn', dataset: { action: 'demo' }, onclick: enterDemo }, 'Preview sample journal'),
          ),
          h('p', { class: 'muted small' }, 'The sample is read-only and is never saved alongside your entries.'),
        ),
      ];
    }

    const recent = applyQuery(entries, { sort: 'recent' }).slice(0, RECENT_COUNT);
    return [
      heading,
      ...renderDashboard(entries),
      h(
        'section',
        { class: 'recent', 'aria-labelledby': 'recent-heading' },
        h('h3', { id: 'recent-heading', class: 'section-title' }, 'Recent cups'),
        h('ul', { class: 'cards', role: 'list' }, recent.map((entry) => h('li', {}, renderCard(entry, 'h4')))),
        h('p', { class: 'see-all' }, h('a', { href: routeHref('archive'), class: 'btn' }, `See all ${plural(entries.length, 'entry', 'entries')} in the archive`)),
      ),
    ];
  }

  // ---------- archive ----------
  let resultsSlot;
  let countSlot;

  function renderArchive() {
    const entries = visibleEntries();
    const heading = h('h2', { tabindex: '-1', class: 'view-title' }, state.demo ? 'Sample archive' : 'Archive');

    if (!entries.length) {
      return [
        heading,
        h(
          'div',
          { class: 'empty-state', dataset: { emptyState: '' } },
          h('h3', {}, 'No entries yet'),
          h('p', {}, 'Every cup you log lands here, ready to search, filter, and sort.'),
          h('div', { class: 'button-row center' }, h('a', { href: routeHref('new'), class: 'btn btn-gold' }, 'Log a cup')),
        ),
      ];
    }

    countSlot = h('p', { role: 'status', class: 'result-count', dataset: { resultCount: '' } });
    resultsSlot = h('div', { class: 'results' });
    const view = [heading, renderFilters(entries), countSlot, resultsSlot];
    renderResults();
    return view;
  }

  function renderFilters(entries) {
    const facets = collectFacets(entries);
    const f = state.filters;
    const update = (key) => (event) => {
      state.filters = { ...state.filters, [key]: event.target.value };
      renderResults();
    };
    const select = (id, label, key, options) => {
      const el = h(
        'select',
        { id, name: key, onchange: update(key) },
        options.map(([value, text]) => h('option', { value: String(value) }, text)),
      );
      el.value = String(f[key]);
      return h('div', { class: 'field compact' }, h('label', { for: id }, label), el);
    };

    return h(
      'form',
      { class: 'filters', role: 'search', 'aria-label': 'Filter journal', onsubmit: (e) => e.preventDefault() },
      h(
        'div',
        { class: 'field compact grow' },
        h('label', { for: 'filter-search' }, 'Search'),
        h('input', {
          id: 'filter-search',
          type: 'search',
          name: 'search',
          value: f.search,
          placeholder: 'Shop, drink, place, notes…',
          autocomplete: 'off',
          oninput: update('search'),
        }),
      ),
      select('filter-sort', 'Sort', 'sort', SORTS.map((s) => [s.value, s.label])),
      select('filter-rating', 'Rating', 'minRating', [
        [0, 'Any rating'],
        [5, '5 stars'],
        [4, '4+ stars'],
        [3, '3+ stars'],
        [2, '2+ stars'],
      ]),
      facets.textures.length
        ? select('filter-texture', 'Texture', 'texture', [['', 'Any texture'], ...facets.textures.map((t) => [t, t])])
        : null,
      facets.tags.length ? select('filter-tag', 'Atmosphere', 'tag', [['', 'Any atmosphere'], ...facets.tags.map((t) => [t, t])]) : null,
    );
  }

  function filtersActive() {
    const f = state.filters;
    return Boolean(f.search.trim() || Number(f.minRating) || f.tag || f.texture);
  }

  function renderResults() {
    const all = visibleEntries();
    const shown = applyQuery(all, state.filters);
    countSlot.textContent = filtersActive()
      ? `Showing ${shown.length} of ${plural(all.length, 'entry', 'entries')}`
      : `${plural(all.length, 'entry', 'entries')}`;

    if (!shown.length) {
      resultsSlot.replaceChildren(
        h(
          'div',
          { class: 'no-results' },
          h('p', {}, 'Nothing matches those filters.'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => {
                state.filters = { ...EMPTY_FILTERS };
                render({ focus: true });
              },
            },
            'Clear filters',
          ),
        ),
      );
      return;
    }
    resultsSlot.replaceChildren(h('ul', { class: 'cards', role: 'list' }, shown.map((entry) => h('li', {}, renderCard(entry)))));
  }

  function renderCard(entry, headingTag = 'h3') {
    const label = `${entry.drink} at ${entry.shop}`;
    const meta = [entry.visitDate ? h('time', { datetime: entry.visitDate }, formatDate(entry.visitDate)) : null, entry.place || null, entry.price !== null ? formatPrice(entry.price) : null].filter(Boolean);
    const details = [entry.teaBase && `${entry.teaBase} tea`, entry.sweetness && `${entry.sweetness} sweet`, entry.ice].filter(Boolean);

    return h(
      'article',
      { class: 'card', dataset: { entry: entry.id }, 'aria-label': label },
      h(
        'div',
        { class: 'card-head' },
        h('div', {}, h(headingTag, { class: 'card-shop' }, entry.shop), h('p', { class: 'card-drink' }, entry.drink)),
        entry.rating ? stars(entry.rating) : h('span', { class: 'unrated' }, 'Unrated'),
      ),
      meta.length ? h('p', { class: 'card-meta' }, meta.flatMap((m, i) => (i ? [h('span', { 'aria-hidden': 'true', class: 'dot' }, ' · '), m] : [m]))) : null,
      details.length ? h('p', { class: 'card-details' }, details.join(' · ')) : null,
      entry.toppings.length || entry.tags.length
        ? h(
            'ul',
            { class: 'chips', 'aria-label': 'Textures and atmosphere' },
            entry.toppings.map((t) => h('li', { class: 'chip chip-texture' }, t)),
            entry.tags.map((t) => h('li', { class: 'chip chip-tag' }, t)),
          )
        : null,
      entry.notes ? h('p', { class: 'card-notes' }, entry.notes) : null,
      state.demo
        ? null
        : h(
            'div',
            { class: 'card-actions' },
            h('button', { type: 'button', class: 'btn btn-quiet', dataset: { action: 'edit' }, 'aria-label': `Edit ${label}`, onclick: () => startEdit(entry.id) }, 'Edit'),
            h('button', { type: 'button', class: 'btn btn-quiet btn-danger', dataset: { action: 'delete' }, 'aria-label': `Delete ${label}`, onclick: () => deleteEntry(entry) }, 'Delete'),
          ),
    );
  }

  function startEdit(id) {
    state.editingId = id;
    navigate('new');
  }

  function deleteEntry(entry) {
    if (!confirm(`Delete “${entry.drink}” at ${entry.shop}? This can’t be undone.`)) return;
    if (persist(state.entries.filter((e) => e.id !== entry.id), `Deleted ${entry.drink} at ${entry.shop}.`)) {
      render({ focus: true });
    }
  }

  // ---------- log form ----------
  function renderLog() {
    const editing = state.editingId ? state.entries.find((e) => e.id === state.editingId) : null;
    if (!editing) state.editingId = null;
    const values = editing ?? { visitDate: localToday(now()), toppings: [], tags: [] };
    const facets = collectFacets(state.entries);
    const optional = () => h('span', { class: 'opt' }, ' (optional)');

    // Each validatable field has a [data-field] wrapper; showErrors() fills it in place.
    const textField = (name, label, { required = false, hint, type = 'text', list, attrs = {} } = {}) =>
      h(
        'div',
        { class: 'field', dataset: { field: name } },
        h('label', { for: `f-${name}` }, label, required ? h('span', { class: 'req' }, ' (required)') : optional()),
        h('input', {
          id: `f-${name}`,
          name,
          type,
          value: values[name] === null || values[name] === undefined ? '' : String(values[name]),
          required,
          list,
          'aria-describedby': hint ? `hint-${name}` : null,
          ...attrs,
        }),
        hint ? h('p', { id: `hint-${name}`, class: 'hint' }, hint) : null,
      );

    const choiceGroup = (name, legend, type, options, isChecked, extraClass = '') =>
      h(
        'fieldset',
        { class: `field choice-group ${extraClass}`.trim(), dataset: { field: name } },
        h('legend', {}, legend, optional()),
        h(
          'div',
          { class: 'chip-options' },
          options.map(([value, text], i) => {
            const id = `f-${name}-${i}`;
            return h(
              'span',
              { class: 'chip-option' },
              h('input', { type, id, name, value, checked: isChecked(value) }),
              h('label', { for: id }, text),
            );
          }),
        ),
      );

    const radioGroup = (name, legend, options) =>
      choiceGroup(name, legend, 'radio', [['', 'Not noted'], ...options.map((o) => [o, o])], (v) => String(values[name] ?? '') === v);

    const checkGroup = (name, legend, options, otherLabel) => {
      const chosen = new Set(values[name].map((s) => s.toLowerCase()));
      const group = choiceGroup(name, legend, 'checkbox', options.map((o) => [o, o]), (v) => chosen.has(v.toLowerCase()), 'wide');
      delete group.dataset.field;
      group.append(
        h(
          'div',
          { class: 'field inline-other', dataset: { field: name } },
          h('label', { for: `f-${name}Other` }, otherLabel),
          h('input', { id: `f-${name}Other`, name: `${name}Other`, type: 'text', autocomplete: 'off', 'aria-describedby': `hint-${name}` }),
          h('p', { id: `hint-${name}`, class: 'hint' }, 'Separate with commas.'),
        ),
      );
      return group;
    };

    const ratingOptions = [['', 'None'], ...[1, 2, 3, 4, 5].map((n) => [String(n), [h('span', { 'aria-hidden': 'true' }, '★'.repeat(n)), h('span', { class: 'visually-hidden' }, `${n} of 5`)]])];

    const shops = uniqueCaseless(state.entries.map((e) => e.shop));
    const places = uniqueCaseless(state.entries.map((e) => e.place).filter(Boolean));
    const teas = uniqueCaseless(TEA_BASES, state.entries.map((e) => e.teaBase).filter(Boolean));

    const form = h(
      'form',
      { class: 'entry-form', noValidate: true, 'aria-labelledby': 'log-title', onsubmit: onSubmit },
      h('div', { class: 'error-summary-slot' }),
      h(
        'div',
        { class: 'form-grid' },
        textField('shop', 'Shop', { required: true, list: 'shop-options', attrs: { autocomplete: 'off', maxlength: String(LIMITS.shop) } }),
        textField('drink', 'Drink or order', { required: true, attrs: { autocomplete: 'off', maxlength: String(LIMITS.drink) } }),
        textField('visitDate', 'Visit date', { type: 'date' }),
        textField('place', 'City or neighborhood', { list: 'place-options', attrs: { autocomplete: 'off', maxlength: String(LIMITS.place) } }),
        textField('price', 'Price', { type: 'number', hint: 'Any currency; numbers only.', attrs: { min: '0', step: '0.01', inputmode: 'decimal' } }),
        textField('teaBase', 'Tea base', { list: 'tea-options', attrs: { autocomplete: 'off', maxlength: String(LIMITS.teaBase) } }),
        radioGroup('sweetness', 'Sweetness', SWEETNESS_LEVELS),
        radioGroup('ice', 'Ice', ICE_LEVELS),
        checkGroup('toppings', 'Toppings & texture', uniqueCaseless(TEXTURE_OPTIONS, facets.textures, values.toppings), 'Other toppings'),
        checkGroup('tags', 'Atmosphere', uniqueCaseless(ATMOSPHERE_TAGS, facets.tags, values.tags), 'Other atmosphere tags'),
        choiceGroup('rating', 'Rating', 'radio', ratingOptions, (v) => String(values.rating ?? '') === v, 'rating-group wide'),
        h(
          'div',
          { class: 'field wide', dataset: { field: 'notes' } },
          h('label', { for: 'f-notes' }, 'Notes', optional()),
          h('textarea', { id: 'f-notes', name: 'notes', rows: '4', maxlength: String(LIMITS.notes) }, values.notes ?? ''),
        ),
      ),
      h('datalist', { id: 'shop-options' }, shops.map((s) => h('option', { value: s }))),
      h('datalist', { id: 'place-options' }, places.map((s) => h('option', { value: s }))),
      h('datalist', { id: 'tea-options' }, teas.map((s) => h('option', { value: s }))),
      h(
        'div',
        { class: 'button-row form-actions' },
        h('button', { type: 'submit', class: 'btn btn-gold' }, editing ? 'Save changes' : 'Save to journal'),
        editing ? h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => navigate('journal') }, 'Cancel') : null,
      ),
    );

    return [
      h('h2', { id: 'log-title', tabindex: '-1', class: 'view-title' }, editing ? 'Edit entry' : 'Log a cup'),
      h(
        'p',
        { class: 'muted lede' },
        editing ? `Editing ${editing.drink} at ${editing.shop}.` : 'Only the shop and what you ordered are required. Everything else is for future you.',
      ),
      form,
    ];
  }

  /** Mark invalid fields in place so the user's input and position are preserved. */
  function showErrors(form, errors) {
    form.querySelectorAll('.field-error').forEach((node) => node.remove());
    form.querySelectorAll('[aria-invalid]').forEach((node) => {
      node.removeAttribute('aria-invalid');
      const ids = (node.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && !id.startsWith('err-'));
      if (ids.length) node.setAttribute('aria-describedby', ids.join(' '));
      else node.removeAttribute('aria-describedby');
    });

    const entries = Object.entries(errors);
    const slot = form.querySelector('.error-summary-slot');
    setSlot(
      slot,
      entries.length
        ? h(
            'div',
            { class: 'callout callout-warn', role: 'alert' },
            h('p', {}, h('strong', {}, `Please fix ${plural(entries.length, 'field')}:`)),
            h('ul', {}, entries.map(([, message]) => h('li', {}, message))),
          )
        : null,
    );

    let first = null;
    for (const [name, message] of entries) {
      const wrapper = form.querySelector(`[data-field="${name}"]`);
      if (!wrapper) continue;
      const errorId = `err-${name}`;
      wrapper.append(h('p', { id: errorId, class: 'field-error' }, message));
      const control = wrapper.matches('fieldset') ? wrapper : wrapper.querySelector('input, textarea, select');
      control.setAttribute('aria-invalid', 'true');
      const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
      control.setAttribute('aria-describedby', [...ids, errorId].join(' '));
      first ??= wrapper.matches('fieldset') ? wrapper.querySelector('input') : control;
    }
    first?.focus();
  }

  function readForm(form) {
    const data = new FormData(form);
    const list = (name) => [...data.getAll(name).map(String), ...String(data.get(`${name}Other`) ?? '').split(',')];
    const text = (name) => String(data.get(name) ?? '');
    return {
      shop: text('shop'),
      drink: text('drink'),
      visitDate: text('visitDate'),
      place: text('place'),
      price: text('price'),
      teaBase: text('teaBase'),
      sweetness: text('sweetness'),
      ice: text('ice'),
      toppings: list('toppings'),
      tags: list('tags'),
      notes: text('notes'),
      rating: text('rating'),
    };
  }

  function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = validateEntry(readForm(form));
    if (!result.ok) {
      showErrors(form, result.errors);
      return;
    }

    const previous = state.editingId ? state.entries.find((e) => e.id === state.editingId) : null;
    const entry = makeEntry(result.value, { now: now(), previous: previous ?? undefined });
    const next = previous ? state.entries.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...state.entries];
    if (persist(next, `${previous ? 'Updated' : 'Saved'} ${entry.drink} at ${entry.shop}.`)) {
      state.editingId = null;
      state.demo = false;
      navigate('journal');
    }
  }

  // ---------- dashboard stats ----------
  function renderDashboard(entries) {
    const s = computeStats(entries);
    const tile = (label, value, note, wide = false) =>
      h('div', { class: `tile${wide ? ' wide' : ''}` }, h('dt', {}, label), h('dd', { class: 'tile-value' }, value), note ? h('dd', { class: 'tile-note' }, note) : null);

    const tiles = [
      tile('Cups logged', String(s.total), s.total === 1 ? 'Your first entry' : null),
      tile('Places', String(s.places), 'Distinct shop + neighborhood pairs'),
      tile(
        'Average rating',
        s.averageRating === null ? '—' : s.averageRating.toFixed(1),
        s.averageRating === null ? 'Rate a cup to see this' : `From ${plural(s.ratedCount, 'rated cup')}`,
      ),
      tile(
        'Favorite texture',
        s.favoriteTexture ? s.favoriteTexture.name : '—',
        s.favoriteTexture ? `In ${plural(s.favoriteTexture.count, 'cup')}` : 'Add toppings to see this',
      ),
      tile(
        'Favorite atmosphere',
        s.favoriteTag ? s.favoriteTag.name : '—',
        s.favoriteTag ? `Tagged ${plural(s.favoriteTag.count, 'time')}` : 'Add atmosphere tags to see this',
      ),
      s.topShop ? tile('Most revisited', s.topShop.name, `${plural(s.topShop.count, 'visit')}`) : null,
    ];

    const priceBlock = s.price
      ? h(
          'section',
          { class: 'panel', 'aria-labelledby': 'price-heading' },
          h('h4', { id: 'price-heading' }, 'Price summary'),
          h(
            'dl',
            { class: 'price-grid' },
            [
              ['Average', formatPrice(s.price.average)],
              ['Median', formatPrice(s.price.median)],
              ['Lowest', formatPrice(s.price.min)],
              ['Highest', formatPrice(s.price.max)],
            ].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
          ),
          h('p', { class: 'muted small' }, `From ${plural(s.price.count, 'cup')} with a price, in whatever currency you logged.`),
        )
      : h(
          'section',
          { class: 'panel', 'aria-labelledby': 'price-heading' },
          h('h4', { id: 'price-heading' }, 'Price summary'),
          h('p', { class: 'muted' }, 'Add a price to an entry to see spending here.'),
        );

    return [
      h(
        'section',
        { class: 'dashboard', 'aria-labelledby': 'glance-heading' },
        h('h3', { id: 'glance-heading', class: 'section-title' }, 'At a glance'),
        h('dl', { class: 'tiles' }, tiles.filter(Boolean)),
        h('div', { class: 'panels' }, renderRatingSpread(entries), priceBlock),
      ),
    ];
  }

  function renderRatingSpread(entries) {
    const counts = [5, 4, 3, 2, 1].map((r) => [r, entries.filter((e) => e.rating === r).length]);
    const max = Math.max(...counts.map(([, c]) => c));
    return h(
      'section',
      { class: 'panel', 'aria-labelledby': 'spread-heading' },
      h('h4', { id: 'spread-heading' }, 'Rating spread'),
      max
        ? h(
            'ul',
            { class: 'spread', role: 'list' },
            counts.map(([rating, count]) =>
              h(
                'li',
                { class: 'spread-row' },
                h('span', { class: 'spread-label' }, `${rating}★`),
                h('span', { class: 'spread-track', 'aria-hidden': 'true' }, h('span', { class: 'spread-bar', style: `--w:${max ? (count / max) * 100 : 0}%` })),
                h('span', { class: 'spread-count' }, h('span', { class: 'visually-hidden' }, `${rating} star: `), plural(count, 'cup')),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'No ratings yet.'),
    );
  }

  // ---------- render loop ----------
  function render({ focus = false } = {}) {
    const route = parseRoute(window.location.hash);
    if (route !== 'new') state.editingId = null;
    state.route = route;
    renderChrome();
    const view = route === 'new' ? renderLog() : route === 'archive' ? renderArchive() : renderJournal();
    main.replaceChildren(...view);
    if (focus) main.querySelector('h2')?.focus();
  }

  function onHashChange() {
    const hash = window.location.hash;
    const route = parseRoute(hash);
    // Normalize unknown or data-bearing hashes so nothing extra lingers in the URL.
    if (hash && hash !== routeHref(route)) {
      history.replaceState(null, '', routeHref(route));
    }
    if (route === state.route) return;
    render({ focus: true });
  }

  window.addEventListener('hashchange', onHashChange);
  if (window.location.hash && window.location.hash !== routeHref(parseRoute(window.location.hash))) {
    history.replaceState(null, '', routeHref(parseRoute(window.location.hash)));
  }
  render();

  return {
    destroy() {
      window.removeEventListener('hashchange', onHashChange);
      clearTimeout(toastTimer);
      root.replaceChildren();
    },
  };
}
