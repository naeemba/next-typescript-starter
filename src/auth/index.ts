import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { passkey as passkeyPlugin } from "@better-auth/passkey"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createDb } from "../db/index.js"
import * as schema from "../schema/index.js"
import { sendMagicLink, type MagicLinkEmailFields } from "../email/index.js"
import { parseEnv } from "./config.js"

type DrizzleAdapterDb = Parameters<typeof drizzleAdapter>[0]

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
   * a node-postgres or postgres-js compatible drizzle client.
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
}

export function createAuth(opts: CreateAuthOptions = {}): Auth {
  const overrides: Parameters<typeof parseEnv>[1] = {
    BETTER_AUTH_SECRET: opts.secret,
    BETTER_AUTH_URL: opts.baseURL,
  }
  if (opts.databaseUrl) overrides.DATABASE_URL = opts.databaseUrl
  // When opts.db is provided, DATABASE_URL is not needed. Use a placeholder
  // that satisfies the URL schema so parseEnv stops complaining about it.
  // (We never read env.DATABASE_URL after this when opts.db is set.)
  if (opts.db && !overrides.DATABASE_URL && !process.env.DATABASE_URL) {
    overrides.DATABASE_URL = "postgres://unused:unused@localhost/unused"
  }

  const env = parseEnv(process.env, overrides)
  const db = opts.db ?? createDb(env.DATABASE_URL)
  const magicLinkExpiresIn = opts.magicLink?.expiresIn ?? 600
  const allowlist = opts.magicLink?.allowlist
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

  if (opts.google) {
    const clientId = opts.google.clientId ?? env.GOOGLE_CLIENT_ID
    const clientSecret = opts.google.clientSecret ?? env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error(
        "[@naeemba/next-starter] createAuth({ google }) requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET " +
          "(either as opts.google.clientId/clientSecret or in process.env)."
      )
    }
    config.socialProviders = {
      ...(config.socialProviders ?? {}),
      google: {
        clientId,
        clientSecret,
        ...(opts.google.scopes ? { scopes: opts.google.scopes } : {}),
      },
    }

    if (opts.accountLinking !== false) {
      config.account = {
        ...(config.account ?? {}),
        accountLinking: {
          enabled: true,
          trustedProviders:
            opts.accountLinking?.trustedProviders ?? ["google"],
        },
      }
    }

    if (opts.google.allowlist) {
      const googleAllowlist = opts.google.allowlist
      config.databaseHooks = {
        ...(config.databaseHooks ?? {}),
        user: {
          ...(config.databaseHooks?.user ?? {}),
          create: {
            ...(config.databaseHooks?.user?.create ?? {}),
            before: async (user) => {
              const ok = await googleAllowlist({
                email: user.email,
                emailVerified: (user as { emailVerified?: boolean }).emailVerified ?? false,
              })
              if (!ok) {
                throw new Error(
                  "[@naeemba/next-starter] Sign-up rejected by google.allowlist."
                )
              }
            },
          },
        },
      }
    }
  }

  if (opts.passkey) {
    const url = new URL(env.BETTER_AUTH_URL)
    const plugin = passkeyPlugin({
      rpName: opts.passkey.rpName ?? url.hostname,
      rpID: opts.passkey.rpID ?? url.hostname,
      origin: opts.passkey.origin ?? env.BETTER_AUTH_URL,
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
