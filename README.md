# Boba Passport

A private, local-first journal for the tea and café drinks you try. It runs entirely in your browser: no accounts, no server, no analytics, no network requests.

## Features

- **Log a cup**: record the shop, drink, visit date, neighborhood, price, tea base, sweetness, ice, toppings and texture, atmosphere tags, notes, and a 1–5 rating. Only the shop and drink are required.
- **Edit and delete** entries. Deleting asks for confirmation first.
- **Journal dashboard**: stats derived only from your own entries (cups logged, distinct places, average rating, favorite texture and atmosphere, most revisited shop, rating spread, price summary), plus your most recent cups.
- **Archive**: every entry, with free-text search, filters for minimum rating, texture, and atmosphere, and sorting by date, rating, price, or shop.
- **Backup**: export all entries to a JSON file and import them again. Imports are validated all-or-nothing before anything changes. You choose whether to merge into the journal or replace it, and replacing an existing journal asks for confirmation.
- **Optional sample journal**: preview made-up entries without touching your data. Sample entries are read-only and are never saved or exported.

## Views

Each view has its own hash route. Routes only name a view; entry ids, search text, and filters never go into the URL.

| Hash         | View                                  |
| ------------ | ------------------------------------- |
| `#/journal`  | Dashboard stats and recent cups (default) |
| `#/new`      | Log a new cup, or edit an existing one |
| `#/archive`  | Search, filter, and sort all entries  |

## Privacy and storage

Entries live only in this browser's `localStorage`, under the key `boba-passport:v1:entries`. Clearing site data erases them, so export a backup regularly. If saved data turns out to be unreadable, the app keeps the raw copy under `boba-passport:v1:recovered` instead of discarding it.

## Accessibility

The app uses semantic landmarks, includes a skip link, and gives every form control a label. Validation errors are announced and linked to their fields. Focus moves to the heading when you change views. The UI is a warm dark theme that works on mobile, keeps focus outlines visible, and respects `prefers-reduced-motion` and forced-colors modes.

## Development

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev          # local dev server
npm test -- --run    # run the Vitest suite once
npm run build        # production build into dist/
npm run preview      # serve the production build
```

## Deployment (GitHub Pages)

`vite.config.js` sets `base` to a repository subpath, because GitHub Pages serves project sites from `https://<user>.github.io/<repo>/`. The default is `/boba-passport/`. To override it, set `BASE_PATH`:

```sh
BASE_PATH=/my-fork/ npm run build
```

The workflow in `.github/workflows/deploy.yml` runs on every push to `main`. It runs the tests, builds with `BASE_PATH` set to the repository name, and deploys `dist/` with the official Pages actions. To enable it, open **Settings → Pages** in the repository and set **Source** to **GitHub Actions**.

## License

MIT
