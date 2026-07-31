/**
 * Purpose: API entrypoint — load config, build the app, start listening.
 * Author(s): John Reed
 */

import { buildApp } from './app.js';
import { loadConfig } from './config.js';

// Main

const config = loadConfig();
const app = await buildApp({ dbPath: config.dbPath, sessionSecret: config.sessionSecret });

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`docs live at http://localhost:${config.port}/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
