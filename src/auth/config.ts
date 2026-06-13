import { z } from "zod"

// Per-field helpers: each preprocesses `""` → `undefined` so CI platforms
// (GitHub Actions, Vercel, Fly, Render) and our own `.env.example` —
// which all emit unset values as the empty string — get the same
// `"is required"` / `undefined` semantics as an actually-absent var,
// instead of the user-hostile `"Invalid email"` / `"must be a valid URL"`
// branch.
//
// Encoding the empty-to-undefined rule WITH each field (instead of a
// hand-maintained parallel list of optional vars) means adding a new
// var — `MICROSOFT_CLIENT_ID: optionalString()` — automatically gets
// the right behavior; you can't forget to add it to the sweep.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v)

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().optional())

const optionalEmail = () =>
  z.preprocess(emptyToUndefined, z.string().email().optional())

const requiredString = (message: string) =>
  z.preprocess(emptyToUndefined, z.string({ error: message }).min(1, message))

// `.refine` callbacks run AFTER `.min(1)` so an empty input surfaces the
// `"is required"` message from `requiredString` rather than the refine's
// shape-specific complaint.
const databaseUrl = () =>
  z.preprocess(
    emptyToUndefined,
    z
      .string({ error: "DATABASE_URL is required" })
      .min(1, "DATABASE_URL is required")
      .refine(
        (s) => s.startsWith("postgres://") || s.startsWith("postgresql://"),
        "DATABASE_URL must be a Postgres connection string (postgres:// or postgresql://)"
      )
  )

const requiredUrl = (message: string) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string({ error: message })
      .min(1, message)
      .url(`${message.replace(/ is required$/, "")} must be a valid URL (e.g. https://app.example.com)`)
  )

const requiredSecret = (message: string, minLength: number) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string({ error: message })
      .min(1, message)
      .min(minLength, `${message.replace(/ is required$/, "")} must be at least ${minLength} characters`)
  )

const EnvSchema = z.object({
  DATABASE_URL: databaseUrl(),
  BETTER_AUTH_SECRET: requiredSecret("BETTER_AUTH_SECRET is required", 32),
  BETTER_AUTH_URL: requiredUrl("BETTER_AUTH_URL is required"),
  EMAIL_FROM: optionalEmail(),
  RESEND_API_KEY: optionalString(),
  GOOGLE_CLIENT_ID: optionalString(),
  GOOGLE_CLIENT_SECRET: optionalString(),
  // DATABASE_PREPARE / DATABASE_POOL_MAX / DATABASE_IDLE_TIMEOUT are validated
  // by createDbOptionsFromEnv (src/db/index.ts), the single reader for those
  // vars. Do NOT add a parallel Zod entry here — it would let the two
  // definitions drift.
})

export type Env = z.infer<typeof EnvSchema>

export type EnvOverrides = Partial<Record<keyof Env, string | undefined>>

export function parseEnv(
  input: Record<string, string | undefined> = process.env,
  overrides: EnvOverrides = {}
): Env {
  const merged: Record<string, string | undefined> = { ...input }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) merged[k] = v
  }
  const result = EnvSchema.safeParse(merged)
  if (result.success) return result.data
  const formatted = result.error.issues
    .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n")
  throw new Error(
    "[@naeemba/next-starter] Invalid environment configuration:\n" + formatted
  )
}
