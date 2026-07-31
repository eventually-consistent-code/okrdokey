/**
 * Purpose: Root Vitest config — two projects: node tests for api/shared,
 *          happy-dom component tests for the web package.
 * Author(s): John Reed
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/api/test/**/*.test.ts', 'packages/shared/test/**/*.test.ts'],
          environment: 'node',
        },
      },
      'packages/web/vite.config.ts',
    ],
  },
});
