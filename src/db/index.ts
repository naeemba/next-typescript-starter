import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
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
  const client = postgres(databaseUrl, {
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
 */
export function createDbOptionsFromEnv(
  source: Record<string, string | undefined> = process.env
): CreateDbOptions {
  const opts: CreateDbOptions = {}
  if (source.DATABASE_PREPARE === "false") opts.prepare = false
  if (source.DATABASE_PREPARE === "true") opts.prepare = true
  if (source.DATABASE_POOL_MAX) {
    const n = Number(source.DATABASE_POOL_MAX)
    if (Number.isFinite(n) && n > 0) opts.max = n
  }
  if (source.DATABASE_IDLE_TIMEOUT) {
    const n = Number(source.DATABASE_IDLE_TIMEOUT)
    if (Number.isFinite(n) && n >= 0) opts.idleTimeout = n
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
