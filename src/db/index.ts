import { drizzle } from "drizzle-orm/postgres-js"
import type postgres from "postgres"
import { loadOptionalPeer } from "../internal/optional-peer.js"
import * as schema from "../schema/index.js"

type Db = ReturnType<typeof drizzle<typeof schema>>

export interface CreateDbOptions {
  /**
   * postgres.js prepared-statement mode. Defaults to `true`.
   *
   * Set to `false` when DATABASE_URL points at a transaction-pool pgBouncer
   * (Supabase pooler port 6543, Neon pooler URL): prepared statements don't
   * survive connection rotation in that mode and queries fail with
   * `prepared statement "..." does not exist`.
   */
  prepare?: boolean
  /** Max pool size. Defaults to `10`. */
  max?: number
  /**
   * Seconds an idle connection stays open before being closed. Defaults to
   * `20`. postgres.js's own default is `0` (no timeout) which leaks
   * connections across Next.js HMR reloads and serverless cold-starts.
   */
  idleTimeout?: number
}

export function createDb(databaseUrl: string, opts: CreateDbOptions = {}): Db {
  if (!databaseUrl?.trim()) {
    throw new Error(
      "[@naeemba/next-starter] createDb requires a non-empty DATABASE_URL connection string."
    )
  }
  const pg = loadOptionalPeer<typeof postgres>("postgres", "createDb / DATABASE_URL")
  const client = pg(databaseUrl, {
    prepare: opts.prepare ?? true,
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 20,
  })
  return drizzle(client, { schema })
}

/**
 * Reads pool tuning options from `process.env`. Lets the documented
 * `import { db }` proxy and `createAuth({})` honour `DATABASE_PREPARE`,
 * `DATABASE_POOL_MAX`, `DATABASE_IDLE_TIMEOUT` without making consumers
 * thread an opts object through every entry point.
 *
 * Throws on malformed values (`DATABASE_PREPARE=fals`, `DATABASE_POOL_MAX=abc`,
 * `DATABASE_POOL_MAX=-1`, etc). The `import { db }` proxy is the only
 * validator for these vars — silently falling back to defaults would
 * re-enable prepared statements against a transaction-pool pgBouncer in
 * prod with no boot-time signal. Fail loud instead.
 */
export function createDbOptionsFromEnv(
  source: Record<string, string | undefined> = process.env
): CreateDbOptions {
  const opts: CreateDbOptions = {}
  if (source.DATABASE_PREPARE !== undefined) {
    if (source.DATABASE_PREPARE !== "true" && source.DATABASE_PREPARE !== "false") {
      throw new Error(
        `[@naeemba/next-starter] DATABASE_PREPARE must be 'true' or 'false', got: ${JSON.stringify(source.DATABASE_PREPARE)}`,
      )
    }
    opts.prepare = source.DATABASE_PREPARE === "true"
  }
  if (source.DATABASE_POOL_MAX !== undefined) {
    const n = Number(source.DATABASE_POOL_MAX)
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      throw new Error(
        `[@naeemba/next-starter] DATABASE_POOL_MAX must be a positive integer, got: ${JSON.stringify(source.DATABASE_POOL_MAX)}`,
      )
    }
    opts.max = n
  }
  if (source.DATABASE_IDLE_TIMEOUT !== undefined) {
    const n = Number(source.DATABASE_IDLE_TIMEOUT)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error(
        `[@naeemba/next-starter] DATABASE_IDLE_TIMEOUT must be a non-negative integer, got: ${JSON.stringify(source.DATABASE_IDLE_TIMEOUT)}`,
      )
    }
    opts.idleTimeout = n
  }
  return opts
}

let _db: Db | null = null
function getDb(): Db {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "[@naeemba/next-starter] DATABASE_URL is required but not set. " +
        "Set it in your .env or environment before using the `db` client."
    )
  }
  _db = createDb(url, createDbOptionsFromEnv())
  return _db
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})
