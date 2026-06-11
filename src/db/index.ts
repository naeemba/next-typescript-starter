import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "../schema/index.js"

type Db = ReturnType<typeof drizzle<typeof schema>>

export function createDb(databaseUrl: string): Db {
  if (!databaseUrl) {
    throw new Error(
      "[@naeemba/next-starter] createDb requires a non-empty DATABASE_URL connection string."
    )
  }
  return drizzle(new Pool({ connectionString: databaseUrl }), { schema })
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
  _db = createDb(url)
  return _db
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})
