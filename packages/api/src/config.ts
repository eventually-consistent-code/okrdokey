/**
 * Purpose: Environment-driven runtime config in one place. Everything the
 *          server needs from the outside world comes through here — no
 *          process.env reads scattered around the codebase.
 * Author(s): John Reed
 */

export interface AppConfig {
  port: number;
  host: string;
  dbPath: string;
}

// Pulls config from env with sane self-host defaults
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DB_PATH ?? './data/okrdokey.sqlite',
  };
}
