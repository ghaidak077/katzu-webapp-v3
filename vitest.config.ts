import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // `e2e/**` is the Playwright suite: it needs a browser and a running preview,
    // so it must never be picked up by the unit runner (which has neither).
    // `.tmp/**` is local scratch space (screenshot rigs, probe files): never gate input.
    exclude: [...configDefaults.exclude, 'e2e/**', '.tmp/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
