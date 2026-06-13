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
  const pg = loadOptionalPeer<typeof postgres>("postgres", "the createDb client (DATABASE_URL)")
  const client = pg(databaseUrl, {
    prepare: opts.prepare ?? true,
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 20,
  })
  return drizzle(client, { schema })
}

function assertPositiveInteger(name: string, raw: string, footgun?: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    const note = footgun ? ` (${footgun})` : ""
    throw new Error(
      `[@naeemba/next-starter] ${name} must be a positive integer${note}, got: ${JSON.stringify(raw)}`,
    )
  }
  return n
}

/**
 * Reads pool tuning options from `process.env`. Lets the documented
 * `import { db }` proxy and `createAuth({})` honour `DATABASE_PREPARE`,
 * `DATABASE_POOL_MAX`, `DATABASE_IDLE_TIMEOUT` without making consumers
 * thread an opts object through every entry point.
 *
 * Throws on malformed values (`DATABASE_PREPARE=fals`, `DATABASE_POOL_MAX=abc`,
 * `DATABASE_POOL_MAX=-1`, etc) — but ONLY at the first `db`-proxy access
 * (or the first `createAuth()` call) that triggers `createDb`, not at
 * module import. Silently falling back to defaults would re-enable
 * prepared statements against a transaction-pool pgBouncer in prod with
 * no signal; loud refusal lets the consumer correct the env value before
 * the next request. Consumers who want boot-time validation can call
 * `createDbOptionsFromEnv()` themselves at module load.
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
    opts.max = assertPositiveInteger("DATABASE_POOL_MAX", source.DATABASE_POOL_MAX)
  }
  if (source.DATABASE_IDLE_TIMEOUT !== undefined) {
    // Rejecting 0 (not just negatives): postgres.js maps idle_timeout=0 to
    // "never close idle connections", which is the connection-leak mode
    // this env var exists to OVERRIDE. Accepting it would silently invert
    // the user's intent on a typo'd "disable" attempt.
    opts.idleTimeout = assertPositiveInteger(
      "DATABASE_IDLE_TIMEOUT",
      source.DATABASE_IDLE_TIMEOUT,
      "postgres.js's '0 = no timeout' default is the connection-leak mode this var exists to override",
    )
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
