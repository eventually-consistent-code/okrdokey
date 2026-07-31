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
  sessionSecret: string;
}

// Pulls config from env with sane self-host defaults
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (env.NODE_ENV === 'production' && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set (32+ chars) in production');
  }

  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DB_PATH ?? './data/okrdokey.sqlite',
    sessionSecret: sessionSecret || 'dev-only-secret-do-not-use-in-production!!',
  };
}
