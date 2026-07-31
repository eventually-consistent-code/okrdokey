/**
 * Purpose: Playwright config — one smoke spec against the REAL built app:
 *          vite build served by Fastify, throwaway SQLite. The wiring test
 *          nothing else exercises.
 * Author(s): John Reed
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3999' },
  webServer: [
    {
      command: 'node e2e/mock-anthropic.cjs',
      url: 'http://localhost:3998/v1/models',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        'npm run build --workspace packages/web && DB_PATH=/tmp/okrdokey-e2e.sqlite PORT=3999 ANTHROPIC_API_KEY=sk-ant-e2e-instance-key-000000 ANTHROPIC_BASE_URL_OVERRIDE=http://localhost:3998 npx tsx packages/api/src/main.ts',
      url: 'http://localhost:3999/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
