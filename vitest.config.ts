/**
 * Purpose: Root Vitest config — one runner for every workspace package.
 * Author(s): John Reed
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
