/**
 * Shared scaffolding for `tests/auth-factory-*.test.ts` files. Each provider
 * test needs the same `process.env` snapshot/restore pattern plus typed
 * pokes at better-auth's internal `auth.options` shape; this module is the
 * single source of truth so a future addition (microsoft, apple, etc) can
 * `setupAuthEnv({ MICROSOFT_CLIENT_ID: undefined, ... })` instead of
 * copy-pasting the block.
 */
const ORIGINAL_ENV = { ...process.env }

export const BASE_ENV: Record<string, string | undefined> = {
  DATABASE_URL: "postgres://u:p@h/d",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://app.example.com",
  EMAIL_FROM: "auth@example.com",
}

export function setupAuthEnv(extra: Record<string, string | undefined> = {}): void {
  process.env = { ...ORIGINAL_ENV, ...BASE_ENV, ...extra }
}

export function restoreAuthEnv(): void {
  process.env = { ...ORIGINAL_ENV }
}

interface BetterAuthLike {
  options: {
    plugins?: Array<{ id?: string; options?: Record<string, unknown> }>
  }
}

export function pluginIds(auth: unknown): string[] {
  return ((auth as BetterAuthLike).options.plugins ?? []).map((p) => p.id ?? "")
}

export function findPlugin(
  auth: unknown,
  id: string,
): { options?: Record<string, unknown> } | undefined {
  return ((auth as BetterAuthLike).options.plugins ?? []).find((p) => p.id === id)
}

export function authOpts<T>(auth: unknown): T {
  return (auth as { options: T }).options
}
