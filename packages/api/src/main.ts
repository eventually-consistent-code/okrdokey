/**
 * Purpose: API entrypoint — load config, build the app, start listening.
 * Author(s): John Reed
 */

import { buildApp } from './app.js';
import { startScheduler } from './cadence/engine.js';
import { loadConfig } from './config.js';

// Main

const config = loadConfig();
const app = await buildApp({
  dbPath: config.dbPath,
  sessionSecret: config.sessionSecret,
  oidc: config.oidc,
  allowedOrigins: config.allowedOrigins,
});

try {
  await app.listen({ port: config.port, host: config.host });
  startScheduler(app, config.sessionSecret);
  app.log.info(`docs live at http://localhost:${config.port}/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
