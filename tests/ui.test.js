import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../src/ui/app.js';
import { STORAGE_KEY } from '../src/lib/storage.js';
import { makeEntry } from '../src/lib/entry.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const seeded = (entries) =>
  memoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 1, entries }) });

const stored = (storage) => {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw).entries : [];
};

async function go(hash) {
  if (window.location.hash === hash) return;
  const changed = new Promise((resolve) => window.addEventListener('hashchange', resolve, { once: true }));
  window.location.hash = hash;
  await changed;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

let root;
let app;

function mount(options = {}) {
  app = mountApp(root, {
    storage: memoryStorage(),
    confirm: () => true,
    download: vi.fn(),
    ...options,
  });
  return app;
}

function accessibleName(control) {
  if (control.getAttribute('aria-label')) return control.getAttribute('aria-label');
  const labelledby = control.getAttribute('aria-labelledby');
  if (labelledby) {
    return labelledby
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
  }
  const labels = control.labels ? Array.from(control.labels) : [];
  return labels.map((l) => l.textContent).join(' ').trim();
}

function fill(form, values) {
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

const submit = (form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

beforeEach(async () => {
  await go('#/journal');
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
});

afterEach(() => {
  app?.destroy();
  app = undefined;
});

describe('routes and landmarks', () => {
  it('renders a skip link, a banner, labelled navigation, and a main landmark', () => {
    mount();
    expect(document.querySelector('a.skip-link[href="#main"]')).not.toBeNull();
    expect(root.querySelector('header')).not.toBeNull();
    expect(root.querySelector('nav[aria-label]')).not.toBeNull();
    expect(root.querySelector('main#main')).not.toBeNull();
    expect(root.querySelector('h1').textContent).toMatch(/Boba Passport/);
  });

  it('marks exactly one nav link as current and follows the hash', async () => {
    mount();
    const current = () => Array.from(root.querySelectorAll('nav a[aria-current="page"]'));
    expect(current().map((a) => a.getAttribute('href'))).toEqual(['#/journal']);
    await go('#/archive');
    expect(current().map((a) => a.getAttribute('href'))).toEqual(['#/archive']);
    expect(root.querySelector('main h2').textContent).toMatch(/archive/i);
    await go('#/new');
    expect(current().map((a) => a.getAttribute('href'))).toEqual(['#/new']);
    expect(root.querySelector('main form')).not.toBeNull();
  });

  it('leaves empty notice slots truly empty instead of printing "null"', async () => {
    mount();
    expect(root.textContent).not.toContain('null');
    await go('#/new');
    const form = root.querySelector('main form');
    submit(form);
    await tick();
    fill(form, { shop: 'A', drink: 'B', price: '-1' });
    submit(form);
    await tick();
    fill(form, { price: '' });
    submit(form);
    await tick();
    expect(root.textContent).not.toContain('null');
  });

  it('shows the journal for unknown hashes', async () => {
    mount();
    await go('#/definitely-not-a-route');
    expect(root.querySelector('nav a[aria-current="page"]').getAttribute('href')).toBe('#/journal');
  });

  it('strips extra data from the hash', async () => {
    mount();
    await go('#/archive?shop=secret');
    expect(window.location.hash).toBe('#/journal');
  });

  it('moves focus to the view heading after navigation', async () => {
    mount();
    await go('#/archive');
    expect(document.activeElement).toBe(root.querySelector('main h2'));
  });

  it('gives every form control on every view an accessible name', async () => {
    mount({ storage: seeded([makeEntry({ shop: 'A', drink: 'B' }, { id: 'a' })]) });
    for (const hash of ['#/journal', '#/new', '#/archive']) {
      await go(hash);
      const controls = root.querySelectorAll('input:not([type=hidden]), select, textarea, button');
      expect(controls.length).toBeGreaterThan(0);
      controls.forEach((control) => {
        const name = control.tagName === 'BUTTON' ? accessibleName(control) || control.textContent.trim() : accessibleName(control);
        expect(name, `${hash} ${control.outerHTML}`).not.toBe('');
      });
    }
  });

  it('never puts entry data into the URL', async () => {
    const storage = memoryStorage();
    mount({ storage });
    await go('#/new');
    const form = root.querySelector('main form');
    fill(form, { shop: 'Secret Spot', drink: 'Hidden Brew' });
    submit(form);
    await tick();
    root.querySelector('button[data-action="edit"]').click();
    await tick();
    expect(window.location.href).not.toMatch(/Secret|Hidden/);
    expect(window.location.hash).toBe('#/new');
  });
});

describe('journal', () => {
  it('shows a privacy notice and a helpful empty state', () => {
    mount();
    expect(root.textContent).toMatch(/only in this browser/i);
    const empty = root.querySelector('[data-empty-state]');
    expect(empty).not.toBeNull();
    expect(empty.querySelector('a[href="#/new"]')).not.toBeNull();
    expect(empty.querySelector('button[data-action="demo"]')).not.toBeNull();
  });

  it('keeps the optional demo separate from personal data', async () => {
    const storage = memoryStorage();
    mount({ storage });
    root.querySelector('button[data-action="demo"]').click();
    await tick();
    expect(root.querySelectorAll('[data-entry]').length).toBeGreaterThan(0);
    expect(root.textContent).toMatch(/sample/i);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(root.querySelector('button[data-action="edit"]')).toBeNull();
    root.querySelector('button[data-action="exit-demo"]').click();
    await tick();
    expect(root.querySelectorAll('[data-entry]').length).toBe(0);
    expect(root.querySelector('[data-empty-state]')).not.toBeNull();
  });

  it('renders user text as text, not markup', () => {
    const evil = '<img src=x onerror="window.__xss=1">';
    mount({ storage: seeded([makeEntry({ shop: evil, drink: evil, notes: evil }, { id: 'x' })]) });
    expect(root.querySelector('[data-entry] img')).toBeNull();
    expect(root.querySelector('[data-entry]').textContent).toContain(evil);
    expect(window.__xss).toBeUndefined();
  });

  it('filters cards with the search box and announces the result count', async () => {
    mount({
      storage: seeded([
        makeEntry({ shop: 'Moss Cup', drink: 'Matcha' }, { id: 'a' }),
        makeEntry({ shop: 'Amber Room', drink: 'Jasmine' }, { id: 'b' }),
      ]),
    });
    await go('#/archive');
    const search = root.querySelector('input[type="search"]');
    search.focus();
    search.value = 'moss';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(root.querySelectorAll('[data-entry]').length).toBe(1);
    expect(root.querySelector('[role="status"][data-result-count]').textContent).toMatch(/1 of 2/);
    expect(document.activeElement).toBe(root.querySelector('input[type="search"]'));
  });

  it('deletes only after confirmation', async () => {
    const storage = seeded([makeEntry({ shop: 'A', drink: 'B' }, { id: 'a' })]);
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    mount({ storage, confirm });
    root.querySelector('button[data-action="delete"]').click();
    await tick();
    expect(stored(storage)).toHaveLength(1);
    root.querySelector('button[data-action="delete"]').click();
    await tick();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(stored(storage)).toHaveLength(0);
  });
});

describe('log form', () => {
  it('flags missing required fields accessibly and saves nothing', async () => {
    const storage = memoryStorage();
    mount({ storage });
    await go('#/new');
    const form = root.querySelector('main form');
    submit(form);
    await tick();
    const shop = form.elements.namedItem('shop');
    expect(shop.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(shop.getAttribute('aria-describedby').split(' ').pop()).textContent).toMatch(/shop/i);
    expect(form.elements.namedItem('drink').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(shop);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps typed input after a failed submit and clears errors once fixed', async () => {
    const storage = memoryStorage();
    mount({ storage });
    await go('#/new');
    const form = root.querySelector('main form');
    fill(form, { drink: 'Kept drink', notes: 'kept notes' });
    submit(form);
    await tick();
    expect(root.querySelector('main form')).toBe(form);
    expect(form.elements.namedItem('drink').value).toBe('Kept drink');
    expect(form.elements.namedItem('drink').hasAttribute('aria-invalid')).toBe(false);
    fill(form, { shop: 'Now filled', price: '-3' });
    submit(form);
    await tick();
    expect(form.elements.namedItem('shop').hasAttribute('aria-invalid')).toBe(false);
    expect(form.elements.namedItem('price').getAttribute('aria-invalid')).toBe('true');
    expect(form.elements.namedItem('price').getAttribute('aria-describedby')).toBe('hint-price err-price');
    expect(form.querySelectorAll('.field-error')).toHaveLength(1);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('marks required fields as required', async () => {
    mount();
    await go('#/new');
    const form = root.querySelector('main form');
    expect(form.elements.namedItem('shop').required).toBe(true);
    expect(form.elements.namedItem('drink').required).toBe(true);
    expect(form.noValidate).toBe(true);
  });

  it('saves a new entry with optional fields and returns to the journal', async () => {
    const storage = memoryStorage();
    mount({ storage });
    await go('#/new');
    const form = root.querySelector('main form');
    fill(form, { shop: 'Leaf & Pearl', drink: 'Oolong milk tea', price: '6.25', place: 'Sunset' });
    form.querySelector('input[name="rating"][value="4"]').checked = true;
    form.querySelector('input[name="toppings"][value="Boba"]').checked = true;
    submit(form);
    await tick();
    const saved = stored(storage);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ shop: 'Leaf & Pearl', price: 6.25, rating: 4, toppings: ['Boba'], place: 'Sunset' });
    expect(window.location.hash).toBe('#/journal');
    expect(root.querySelector('[data-entry]').textContent).toContain('Leaf & Pearl');
  });

  it('edits an existing entry in place', async () => {
    const storage = seeded([makeEntry({ shop: 'A', drink: 'Old', tags: ['Cozy'] }, { id: 'keep' })]);
    mount({ storage });
    root.querySelector('button[data-action="edit"]').click();
    await tick();
    const form = root.querySelector('main form');
    expect(form.elements.namedItem('shop').value).toBe('A');
    expect(form.querySelector('input[name="tags"][value="Cozy"]').checked).toBe(true);
    fill(form, { drink: 'New' });
    submit(form);
    await tick();
    const saved = stored(storage);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'keep', drink: 'New', tags: ['Cozy'] });
  });
});

describe('journal dashboard', () => {
  it('explains that stats need entries when there are none', async () => {
    mount();
    expect(root.querySelector('main').textContent).toMatch(/no entries/i);
    expect(root.querySelector('main').textContent).not.toMatch(/NaN|undefined|null/);
  });

  it('shows derived numbers from real entries', async () => {
    mount({
      storage: seeded([
        makeEntry({ shop: 'A', drink: 'x', rating: 5, price: 6, toppings: ['Boba'] }, { id: 'a' }),
        makeEntry({ shop: 'B', drink: 'y', rating: 4, price: 4, toppings: ['Boba'] }, { id: 'b' }),
      ]),
    });
    const text = root.querySelector('main').textContent;
    expect(text).toContain('4.5');
    expect(text).toMatch(/Boba/);
    expect(text).toContain('5.00');
  });

  it('lists only the three most recent cups and links to the full archive', () => {
    mount({
      storage: seeded(
        ['2026-01-01', '2026-03-01', '2026-02-01', '2026-04-01'].map((visitDate, i) =>
          makeEntry({ shop: `Shop ${i}`, drink: 'x', visitDate }, { id: `e${i}` }),
        ),
      ),
    });
    const cards = Array.from(root.querySelectorAll('main [data-entry]'));
    expect(cards.map((c) => c.dataset.entry)).toEqual(['e3', 'e1', 'e2']);
    expect(root.querySelector('main a[href="#/archive"]').textContent).toMatch(/all 4/i);
  });
});

describe('archive', () => {
  it('sorts every entry with the sort menu', async () => {
    mount({
      storage: seeded([
        makeEntry({ shop: 'Cedar', drink: 'x', visitDate: '2026-03-01' }, { id: 'c' }),
        makeEntry({ shop: 'Amber', drink: 'x', visitDate: '2026-01-01' }, { id: 'a' }),
        makeEntry({ shop: 'Birch', drink: 'x', visitDate: '2026-02-01' }, { id: 'b' }),
      ]),
    });
    await go('#/archive');
    const ids = () => Array.from(root.querySelectorAll('main [data-entry]')).map((c) => c.dataset.entry);
    expect(ids()).toEqual(['c', 'b', 'a']);
    const sort = root.querySelector('select[name="sort"]');
    sort.value = 'shop';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('points to the log form when the archive is empty', async () => {
    mount();
    await go('#/archive');
    expect(root.querySelector('main [data-empty-state] a[href="#/new"]')).not.toBeNull();
  });
});

describe('backup', () => {
  it('exports only personal entries, even while the demo is showing', async () => {
    const download = vi.fn();
    const storage = seeded([makeEntry({ shop: 'Mine', drink: 'x' }, { id: 'mine' })]);
    mount({ storage, download });
    const demoButton = root.querySelector('button[data-action="demo"]');
    demoButton?.click();
    await tick();
    root.querySelector('button[data-action="export"]').click();
    expect(download).toHaveBeenCalledTimes(1);
    const [filename, text] = download.mock.calls[0];
    expect(filename).toMatch(/^boba-passport-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(text);
    expect(data.entries.map((x) => x.id)).toEqual(['mine']);
  });

  async function chooseFile(contents) {
    const input = root.querySelector('input[type="file"]');
    const file = new File([contents], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(root.querySelector('[data-import-result]')).not.toBeNull());
  }

  it('rejects an invalid backup with an alert and leaves data untouched', async () => {
    const storage = seeded([makeEntry({ shop: 'Mine', drink: 'x' }, { id: 'mine' })]);
    mount({ storage });
    await chooseFile('{"app":"something-else"}');
    expect(root.querySelector('[role="alert"][data-import-result]')).not.toBeNull();
    expect(stored(storage).map((x) => x.id)).toEqual(['mine']);
  });

  it('previews a valid backup and merges only after the user chooses', async () => {
    const storage = seeded([makeEntry({ shop: 'Mine', drink: 'x' }, { id: 'mine' })]);
    mount({ storage });
    const backup = { app: 'boba-passport', version: 1, entries: [makeEntry({ shop: 'Theirs', drink: 'y' }, { id: 'theirs' })] };
    await chooseFile(JSON.stringify(backup));
    expect(stored(storage)).toHaveLength(1);
    root.querySelector('button[data-action="import-merge"]').click();
    await tick();
    expect(stored(storage).map((x) => x.id).sort()).toEqual(['mine', 'theirs']);
  });
});
