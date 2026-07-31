/**
 * Purpose: drizzle-kit config — where the schema lives and where generated
 *          SQL migrations go.
 * Author(s): John Reed
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
