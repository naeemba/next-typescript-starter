import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./node_modules/@naeemba/next-starter/dist/schema/index.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
