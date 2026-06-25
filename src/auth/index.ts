import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createDb, createDbOptionsFromEnv } from "../db/index.js"
import * as schema from "../schema/index.js"
import { sendMagicLink, type MagicLinkEmailFields, type EmailTransport } from "../email/index.js"
import { loadOptionalPeerAsync } from "../internal/optional-peer.js"
import { parseEnv } from "./config.js"

// `@better-auth/passkey` is loaded lazily so consumers who don't enable
// passkey (`createAuth({})` without the `passkey` block) neither install
// nor bundle it. Type-only structural shape — `typeof import(...)` would
// leak into our shipped `.d.ts` and force tsc resolution at consumer
// build time even when the dep is absent.
//
// Async load is the only viable path: from 1.6.x onwards `@better-auth/passkey`
// is ESM-only, so a sync `require()` from CJS contexts hits ERR_REQUIRE_ESM.
// `await import()` works for both CJS and ESM, so this is the future-proof seam.
interface PasskeyServerModule {
  passkey: (opts: {
    rpName: string
    rpID: string
    origin: string
    registration?: PasskeyRegistrationConfig
    authentication?: PasskeyAuthenticationConfig
  }) => NonNullable<BetterAuthOptions["plugins"]>[number]
}

// Structural subset of `@better-auth/passkey`'s `PasskeyRegistrationOptions` /
// `PasskeyAuthenticationOptions`, re-declared here rather than imported for the
// same reason `PasskeyServerModule` is hand-rolled: importing the plugin's
// types (even `import type`) would force tsc to resolve `@better-auth/passkey`
// at consumer build time even when passkey is disabled and the optional peer is
// not installed — re-introducing exactly the coupling the async-load seam
// avoids. `extensions` is typed against the DOM-lib
// `AuthenticationExtensionsClientInputs`, which structurally matches the
// `@simplewebauthn/server` type the plugin consumes, so a consumer's
// `{ extensions: { prf: {} } }` type-checks without the peer present. The whole
// object is forwarded verbatim to the plugin at runtime; we surface `extensions`
// because that's the documented passthrough (WebAuthn extensions such as PRF).
interface PasskeyRegistrationConfig {
  extensions?: AuthenticationExtensionsClientInputs
}
interface PasskeyAuthenticationConfig {
  extensions?: AuthenticationExtensionsClientInputs
}

type DrizzleAdapterDb = Parameters<typeof drizzleAdapter>[0]

function normalizeSingleAdmin(input: string | string[] | undefined): Set<string> | undefined {
  if (input === undefined) return undefined
  const list = Array.isArray(input) ? input : [input]
  const trimmed = list.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0)
  // Fail loud: silently treating empty input as "no allowlist" would invert
  // the user's intent ("lock to these emails") into "allow everyone" — a
  // security regression when `singleAdmin: process.env.ADMIN_EMAIL ?? ""`
  // resolves to empty.
  if (trimmed.length === 0) {
    throw new Error(
      "[@naeemba/next-starter] singleAdmin was set but contained no non-empty emails. " +
        "Pass at least one email or omit singleAdmin entirely.",
    )
  }
  return new Set(trimmed)
}

function matchesSingleAdmin(set: Set<string>, email: string): boolean {
  return set.has(email.trim().toLowerCase())
}

interface BuildSendMagicLinkOpts {
  magicLinkExpiresIn: number
  allowlist?: (email: string) => boolean | Promise<boolean>
  customTemplate?: (args: { to: string; url: string; expiresIn: number }) =>
    Promise<MagicLinkEmailFields> | MagicLinkEmailFields
  transport?: EmailTransport
}

function buildSendMagicLink(opts: BuildSendMagicLinkOpts) {
  return async ({ email, url }: { email: string; url: string }) => {
    if (opts.allowlist) {
      const allowed = await opts.allowlist(email)
      if (!allowed) return
    }
    await sendMagicLink({
      to: email,
      url,
      expiresIn: opts.magicLinkExpiresIn,
      template: opts.customTemplate,
      transport: opts.transport,
    })
  }
}

export const __testHooks = { buildSendMagicLink } as const

export interface CreateAuthOptions {
  databaseUrl?: string
  secret?: string
  baseURL?: string
  /**
   * Pre-built Drizzle client. If provided, DATABASE_URL is not required.
   * The package always uses better-auth's "pg" provider, so this must be
   * a postgres-js compatible drizzle client (`drizzle-orm/postgres-js`).
   */
  db?: DrizzleAdapterDb
  session?: {
    expiresIn?: number
    updateAge?: number
  }
  magicLink?: {
    expiresIn?: number
    allowlist?: (email: string) => boolean | Promise<boolean>
    email?: (args: { to: string; url: string; expiresIn: number }) =>
      Promise<MagicLinkEmailFields> | MagicLinkEmailFields
  }
  google?: {
    clientId?: string
    clientSecret?: string
    scopes?: string[]
    allowlist?: (profile: { email: string; emailVerified: boolean }) =>
      boolean | Promise<boolean>
  }
  passkey?: {
    rpName?: string
    rpID?: string
    origin?: string
    /**
     * Forwarded verbatim to the passkey plugin's `registration` option. Use
     * `registration.extensions` to enable WebAuthn extensions at passkey
     * registration — e.g. `{ extensions: { prf: {} } }` to turn on the PRF
     * extension so a passkey can derive a stable client-side secret.
     */
    registration?: PasskeyRegistrationConfig
    /**
     * Forwarded verbatim to the passkey plugin's `authentication` option. Use
     * `authentication.extensions` to set per-assertion WebAuthn extension
     * defaults (e.g. PRF `eval`) at passkey authentication time.
     */
    authentication?: PasskeyAuthenticationConfig
  }
  accountLinking?: false | { trustedProviders: string[] }
  /**
   * Shortcut for locking sign-in to one or more specific emails. Applied as
   * a case-insensitive exact-match default for `magicLink.allowlist` and
   * `google.allowlist`. If an explicit allowlist is also passed for a
   * provider, the explicit callback wins for that provider.
   *
   * For google, an emailVerified=false profile is rejected even when the
   * email matches.
   */
  singleAdmin?: string | string[]
  /**
   * Better-auth rate-limit knob. Pass `false` to disable entirely.
   * Pass an object to set `window` / `max` / `storage`.
   * Omit to inherit better-auth's defaults (enabled in production,
   * `window: 10`, `max: 100`, plus the magic-link plugin's own internal
   * 5-per-60s ceiling on `/sign-in/magic-link`).
   *
   * The env var `BETTER_AUTH_RATE_LIMIT_DISABLED=1` forces `enabled: false`
   * regardless of opts at the time `createAuth()` runs, unless
   * `opts.rateLimit.enabled === true` is explicit — the env override is
   * meant as a local-dev escape hatch, not a way to silently downgrade a
   * production config the consumer thought they enabled. Because
   * `createAuth()` typically runs once at module init, a long-running
   * server must be restarted for a toggled env var to take effect
   * (`npm run dev` re-reads it on each restart).
   */
  rateLimit?: false | {
    enabled?: boolean
    window?: number
    max?: number
    storage?: "memory" | "secondary-storage"
  }
  /**
   * BYO email transport for magic-link mail. When set, the built-in Resend
   * / console dispatch is skipped entirely — your function receives the
   * fully rendered fields (subject, html, text, to, from) and is
   * responsible for delivery. Useful when the consumer already has a
   * Postmark / Mailgun / SES wrapper and doesn't want a second email
   * client in the process.
   */
  transport?: EmailTransport
}

export async function createAuth(opts: CreateAuthOptions = {}): Promise<Auth> {
  const overrides: Parameters<typeof parseEnv>[1] = {
    BETTER_AUTH_SECRET: opts.secret,
    BETTER_AUTH_URL: opts.baseURL,
  }
  if (opts.databaseUrl) overrides.DATABASE_URL = opts.databaseUrl
  // When opts.db is provided, DATABASE_URL is not needed. Force a placeholder
  // override regardless of what's in process.env — otherwise a stale/malformed
  // DATABASE_URL (e.g. a non-postgres URL from a consumer using a different
  // driver) would still fail parseEnv even though opts.db means we never read it.
  if (opts.db && !overrides.DATABASE_URL) {
    overrides.DATABASE_URL = "postgres://unused:unused@localhost/unused"
  }

  const env = parseEnv(process.env, overrides)

  // Pure-validation gate: every synchronous input-shape check runs before
  // any side-effecting resource construction so a config error never
  // leaves a freshly-built postgres-js client + drizzle wrapper dangling.
  // Add new preconditions here, not below createDb.
  const singleAdminSet = normalizeSingleAdmin(opts.singleAdmin)
  let resolvedGoogle: { clientId: string; clientSecret: string } | undefined
  if (opts.google) {
    const clientId = opts.google.clientId ?? env.GOOGLE_CLIENT_ID
    const clientSecret = opts.google.clientSecret ?? env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error(
        "[@naeemba/next-starter] createAuth({ google }) requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET " +
          "(either as opts.google.clientId/clientSecret or in process.env)."
      )
    }
    resolvedGoogle = { clientId, clientSecret }
  }
  // Passkey block validates `new URL(env.BETTER_AUTH_URL)` — parseEnv already
  // accepts only URL-shaped values so the URL constructor cannot throw here.

  const db = opts.db ?? createDb(env.DATABASE_URL, createDbOptionsFromEnv(process.env))
  const magicLinkExpiresIn = opts.magicLink?.expiresIn ?? 600
  const allowlist =
    opts.magicLink?.allowlist ??
    (singleAdminSet ? (email: string) => matchesSingleAdmin(singleAdminSet, email) : undefined)
  const customTemplate = opts.magicLink?.email

  const config: BetterAuthOptions = {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    plugins: [
      magicLink({
        expiresIn: magicLinkExpiresIn,
        sendMagicLink: buildSendMagicLink({
          magicLinkExpiresIn,
          allowlist,
          customTemplate,
          transport: opts.transport,
        }),
      }),
    ],
  }

  if (opts.google && resolvedGoogle) {
    type GoogleConfig = NonNullable<NonNullable<BetterAuthOptions["socialProviders"]>["google"]>
    // `satisfies` (not `as`) so an upstream rename of `mapProfileToUser` /
    // `scopes` etc. surfaces as a compile error on the next better-auth
    // bump instead of silently no-opping at runtime.
    const baseGoogle = {
      clientId: resolvedGoogle.clientId,
      clientSecret: resolvedGoogle.clientSecret,
      ...(opts.google.scopes ? { scopes: opts.google.scopes } : {}),
    } satisfies GoogleConfig
    const googleAllowlist =
      opts.google.allowlist ??
      (singleAdminSet
        ? (profile: { email: string; emailVerified: boolean }) =>
            profile.emailVerified && matchesSingleAdmin(singleAdminSet, profile.email)
        : undefined)
    const googleConfig = googleAllowlist
      ? ({
          ...baseGoogle,
          // Gate inside the Google getUserInfo path so the check fires for
          // both first-time signup AND account linking (linkAccount never
          // reaches the global user.create.before hook), and does NOT fire
          // for magic-link signups.
          mapProfileToUser: async (profile: { email: string; email_verified: boolean }) => {
            const ok = await googleAllowlist({
              email: profile.email,
              emailVerified: profile.email_verified,
            })
            if (!ok) {
              throw new Error(
                "[@naeemba/next-starter] Sign-in rejected by google.allowlist."
              )
            }
            return {}
          },
        } satisfies GoogleConfig)
      : baseGoogle
    config.socialProviders = {
      ...(config.socialProviders ?? {}),
      google: googleConfig,
    }
  }

  // accountLinking is independent of opts.google: a consumer may set it to
  // pre-configure trustedProviders for a provider they'll add later. When
  // google is enabled, it's auto-added to the trusted set rather than
  // silently dropped by a verbatim override.
  //
  // Note: this stays as `!== false` rather than the `?? true` form used in
  // createDb / createAuthClient because `accountLinking`'s type is a
  // discriminated union (`false | { trustedProviders } | undefined`), and
  // `!== false` is the form that lets TS narrow the union inside the block.
  if (opts.accountLinking !== false) {
    const trustedProviders = new Set<string>([
      ...(opts.accountLinking?.trustedProviders ?? []),
      ...(opts.google ? ["google"] : []),
    ])
    if (trustedProviders.size > 0) {
      config.account = {
        ...(config.account ?? {}),
        accountLinking: {
          enabled: true,
          trustedProviders: [...trustedProviders],
        },
      }
    }
  }

  if (opts.passkey) {
    const passkeyMod = await loadOptionalPeerAsync<PasskeyServerModule>(
      "@better-auth/passkey",
      () =>
        import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ "@better-auth/passkey"
        ) as Promise<PasskeyServerModule>,
      "createAuth({ passkey })",
    )
    const url = new URL(env.BETTER_AUTH_URL)
    // url.origin strips path + trailing slash; @simplewebauthn/server does a
    // strict equality check against the browser-sent RFC 6454 origin, which
    // also has no path or trailing slash.
    const plugin = passkeyMod.passkey({
      rpName: opts.passkey.rpName ?? url.hostname,
      rpID: opts.passkey.rpID ?? url.hostname,
      origin: opts.passkey.origin ?? url.origin,
      // Conditional spread so consumers passing only rpName/rpID/origin keep
      // an identical plugin config — these never appear unless explicitly set.
      ...(opts.passkey.registration && { registration: opts.passkey.registration }),
      ...(opts.passkey.authentication && { authentication: opts.passkey.authentication }),
    })
    config.plugins = [...(config.plugins ?? []), plugin]
  }

  if (opts.session) {
    config.session = {
      ...(opts.session.expiresIn !== undefined && { expiresIn: opts.session.expiresIn }),
      ...(opts.session.updateAge !== undefined && { updateAge: opts.session.updateAge }),
    }
  }

  // The env-var escape hatch is intentionally a *force-disable*, not a
  // "set the default to disabled". A consumer who explicitly opted into
  // `{ enabled: true }` shouldn't get silently downgraded by an env var
  // they may have inherited from a parent process or a CI runner. The
  // value comparison is `=== "1"` (not truthy) so an unintentional
  // export of `BETTER_AUTH_RATE_LIMIT_DISABLED=` (empty string) doesn't
  // trip the disable path either.
  const envForceDisable = process.env.BETTER_AUTH_RATE_LIMIT_DISABLED === "1"

  if (opts.rateLimit === false) {
    config.rateLimit = { enabled: false }
  } else if (opts.rateLimit !== undefined) {
    config.rateLimit =
      envForceDisable && opts.rateLimit.enabled !== true
        ? { ...opts.rateLimit, enabled: false }
        : { ...opts.rateLimit }
  } else if (envForceDisable) {
    config.rateLimit = { enabled: false }
  }

  return betterAuth(config) as unknown as Auth
}

export type { Auth }
