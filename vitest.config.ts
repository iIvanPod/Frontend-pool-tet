import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the client unit tests (QA matrix §2: client-side
 * interpolation). Tests live under `test/` — outside the `src` tree that the
 * production build type-checks — so `tsc --noEmit && vite build` stays untouched.
 * Runs in the Node environment; the only browser API the buffer needs
 * (`performance.now`) exists there and is stubbed per-test for a deterministic clock.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
