import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createDb } from "../db/index.js"
import * as schema from "../schema/index.js"
import { sendMagicLink, type MagicLinkEmailFields } from "../email/index.js"
import { parseEnv } from "./config.js"

type DrizzleAdapterDb = Parameters<typeof drizzleAdapter>[0]

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
        sendMagicLink: async ({ email, url }) => {
          if (allowlist) {
            const allowed = await allowlist(email)
            if (!allowed) return
          }
          await sendMagicLink({
            to: email,
            url,
            expiresIn: magicLinkExpiresIn,
            template: customTemplate,
          })
        },
      }),
    ],
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
