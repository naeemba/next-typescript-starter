import { betterAuth, type Auth } from "better-auth"
import { magicLink } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "../db/index.js"
import * as schema from "../schema/index.js"
import { sendMagicLink } from "../email/index.js"
import { parseEnv } from "./config.js"

const env = parseEnv(process.env)

export const auth: Auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLink({ to: email, url })
      },
      expiresIn: 60 * 10,
    }),
  ],
}) as unknown as Auth

export type { Auth }
