/**
 * Purpose: Vite config — React, Tailwind v4, and a dev proxy so the SPA and
 *          the API share cookies without CORS ceremony. In production the
 *          API serves the built files itself; this proxy is dev-only.
 * Author(s): John Reed
 */

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API = 'http://localhost:3000';
const API_PREFIXES = [
  '/auth',
  '/teams',
  '/cycles',
  '/objectives',
  '/key-results',
  '/reminders',
  '/public',
  '/health',
  '/docs',
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: Object.fromEntries(API_PREFIXES.map((p) => [p, { target: API, changeOrigin: false }])),
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.tsx'],
  },
});
