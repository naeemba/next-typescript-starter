import { z } from "zod"

const EnvSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required")
    .refine(
      (s) => s.startsWith("postgres://") || s.startsWith("postgresql://"),
      "DATABASE_URL must be a Postgres connection string (postgres:// or postgresql://)"
    ),
  BETTER_AUTH_SECRET: z
    .string({ error: "BETTER_AUTH_SECRET is required" })
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z
    .string({ error: "BETTER_AUTH_URL is required" })
    .url("BETTER_AUTH_URL must be a valid URL (e.g. https://app.example.com)"),
  EMAIL_FROM: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
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
