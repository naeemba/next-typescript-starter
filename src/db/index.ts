import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "../schema/index.js"

type Db = ReturnType<typeof drizzle<typeof schema>>

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
  _db = drizzle(new Pool({ connectionString: url }), { schema })
  return _db
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})
