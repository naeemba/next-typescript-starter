import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { passkey as passkeyPlugin } from "@better-auth/passkey"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createDb, createDbOptionsFromEnv } from "../db/index.js"
import * as schema from "../schema/index.js"
import { sendMagicLink, type MagicLinkEmailFields } from "../email/index.js"
import { parseEnv } from "./config.js"

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
}

export function createAuth(opts: CreateAuthOptions = {}): Auth {
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
    const url = new URL(env.BETTER_AUTH_URL)
    // url.origin strips path + trailing slash; @simplewebauthn/server does a
    // strict equality check against the browser-sent RFC 6454 origin, which
    // also has no path or trailing slash.
    const plugin = passkeyPlugin({
      rpName: opts.passkey.rpName ?? url.hostname,
      rpID: opts.passkey.rpID ?? url.hostname,
      origin: opts.passkey.origin ?? url.origin,
    })
    config.plugins = [...(config.plugins ?? []), plugin as unknown as NonNullable<BetterAuthOptions["plugins"]>[number]]
  }

  if (opts.session) {
    config.session = {
      ...(opts.session.expiresIn !== undefined && { expiresIn: opts.session.expiresIn }),
      ...(opts.session.updateAge !== undefined && { updateAge: opts.session.updateAge }),
    }
  }

  return betterAuth(config) as unknown as Auth
}

export type { Auth }
