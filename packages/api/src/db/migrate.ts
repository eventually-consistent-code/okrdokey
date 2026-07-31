/**
 * Purpose: Standalone migration runner — `npm run db:migrate`. createDb()
 *          already migrates on open, so this exists for CI and for admins who
 *          want to migrate without starting the server.
 * Author(s): John Reed
 */

import { loadConfig } from '../config.js';
import { createDb } from './index.js';

// Main

console.log('applying migrations...');
const config = loadConfig();
createDb(config.dbPath);
console.log('migrations applied.');
