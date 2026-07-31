/**
 * Purpose: Environment-driven runtime config in one place. Everything the
 *          server needs from the outside world comes through here — no
 *          process.env reads scattered around the codebase.
 * Author(s): John Reed
 */

// Generic OIDC provider — one issuer URL, discovery does the rest
export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// AI drafting — BYO-key, Anthropic only. aiEnabled is the kill switch.
export interface AiConfig {
  enabled: boolean;
  model: string;
  instanceKey: string | null;
  baseUrl: string | null; // test/mock override; null = Anthropic default
}

export interface AppConfig {
  port: number;
  host: string;
  dbPath: string;
  sessionSecret: string;
  oidc?: OidcConfig;
  allowedOrigins: string[];
  ai: AiConfig;
}

// OIDC is opt-in: all three core vars present → configured; all absent →
// password-only mode, no errors. A partial set is a misconfiguration.
function loadOidcConfig(env: NodeJS.ProcessEnv, port: number): OidcConfig | undefined {
  const issuerUrl = env.OIDC_ISSUER_URL;
  const clientId = env.OIDC_CLIENT_ID;
  const clientSecret = env.OIDC_CLIENT_SECRET;

  if (!issuerUrl && !clientId && !clientSecret) return undefined;
  if (!issuerUrl || !clientId || !clientSecret) {
    throw new Error(
      'OIDC config is partial — set all of OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET (or none)',
    );
  }

  const appUrl = env.APP_URL ?? `http://localhost:${port}`;
  return {
    issuerUrl,
    clientId,
    clientSecret,
    redirectUri: env.OIDC_REDIRECT_URI ?? `${appUrl}/auth/oidc/callback`,
  };
}

// Pulls config from env with sane self-host defaults
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (env.NODE_ENV === 'production' && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set (32+ chars) in production');
  }

  const port = Number(env.PORT ?? 3000);
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DB_PATH ?? './data/okrdokey.sqlite',
    sessionSecret: sessionSecret || 'dev-only-secret-do-not-use-in-production!!',
    oidc: loadOidcConfig(env, port),
    // extra origins the CSRF check trusts (dev: the vite server)
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ai: {
      enabled: env.AI_FEATURES !== 'off',
      model: env.AI_MODEL ?? 'claude-opus-4-8',
      instanceKey: env.ANTHROPIC_API_KEY ?? null,
      baseUrl: env.ANTHROPIC_BASE_URL_OVERRIDE ?? null,
    },
  };
}
