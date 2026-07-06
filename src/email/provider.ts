/** Built-in email delivery providers, selected by EMAIL_TRANSPORT. */
export type EmailProvider = "resend" | "postal" | "console"

/**
 * Resolve which built-in provider `sendEmail` should use.
 *
 * - An explicit, recognized `EMAIL_TRANSPORT` always wins.
 * - When unset (or unrecognized), fall back to the historical heuristic:
 *   a present `RESEND_API_KEY` selects Resend, otherwise console. This keeps
 *   existing consumers — who never set `EMAIL_TRANSPORT` — behaving exactly
 *   as before.
 *
 * A custom `transport` passed to `sendEmail` bypasses this entirely; it is
 * resolved by the caller before this function is consulted.
 */
export function resolveProvider(env: {
  EMAIL_TRANSPORT?: string
  RESEND_API_KEY?: string
}): EmailProvider {
  const explicit = env.EMAIL_TRANSPORT
  if (explicit === "resend" || explicit === "postal" || explicit === "console") {
    return explicit
  }
  return env.RESEND_API_KEY ? "resend" : "console"
}
