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

const optionalUrl = () =>
  z.preprocess(emptyToUndefined, z.string().url().optional())

const requiredString = (message: string) =>
  z.preprocess(emptyToUndefined, z.string({ error: message }).min(1, message))

// `.refine` callbacks run AFTER `.min(1)` so an empty input surfaces the
// `"is required"` message from `requiredString` rather than the refine's
// shape-specific complaint.
//
// Scheme match is case-insensitive: RFC 3986 §3.1 makes URL schemes
// case-insensitive, the WHATWG URL parser postgres-js uses normalizes
// `Postgres://` → `postgres:`, and Supabase/Heroku dashboards copy out
// connection strings with the scheme capitalized. Rejecting `Postgres://`
// with "must be a Postgres connection string" is misleading.
const databaseUrl = () =>
  z.preprocess(
    emptyToUndefined,
    z
      .string({ error: "DATABASE_URL is required" })
      .min(1, "DATABASE_URL is required")
      .refine(
        (s) => /^postgres(ql)?:\/\//i.test(s),
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
  EMAIL_TRANSPORT: z.preprocess(
    emptyToUndefined,
    z.enum(["resend", "postal", "console"]).optional()
  ),
  POSTAL_API_URL: optionalUrl(),
  POSTAL_API_KEY: optionalString(),
  // DATABASE_PREPARE / DATABASE_POOL_MAX / DATABASE_IDLE_TIMEOUT are validated
  // by createDbOptionsFromEnv (src/db/index.ts), the single reader for those
  // vars. Do NOT add a parallel Zod entry here — it would let the two
  // definitions drift.
}).superRefine((val, ctx) => {
  // A provider's credentials are required only when that provider is
  // explicitly selected. When EMAIL_TRANSPORT is unset the auto heuristic
  // applies and nothing here is enforced — preserving prior behavior.
  if (val.EMAIL_TRANSPORT === "postal") {
    for (const key of ["POSTAL_API_URL", "POSTAL_API_KEY"] as const) {
      if (!val[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when EMAIL_TRANSPORT=postal`,
        })
      }
    }
  } else if (val.EMAIL_TRANSPORT === "resend") {
    if (!val.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required when EMAIL_TRANSPORT=resend",
      })
    }
  }
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
