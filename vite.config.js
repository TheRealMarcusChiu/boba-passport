import { defineConfig } from 'vite';

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/,
// so assets must be resolved against that subpath. The Pages workflow sets
// BASE_PATH from the repository name; locally we default to the repo name too.
function resolveBase(raw) {
  const value = (raw ?? '/boba-passport/').trim() || '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export default defineConfig({
  base: resolveBase(process.env.BASE_PATH),
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    restoreMocks: true,
  },
});
