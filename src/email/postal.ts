import type { EmailArgs } from "./console.js"

/**
 * Deliver a rendered email through a self-hosted Postal server's HTTPS API.
 * Dependency-free (native fetch), mirroring the Resend transport's no-SMTP
 * posture. Selected when EMAIL_TRANSPORT=postal (or a custom transport is not
 * supplied and this provider is resolved).
 *
 * Env:
 *   POSTAL_API_URL  e.g. https://postal.example.com
 *   POSTAL_API_KEY  a Postal server API credential key
 */
export async function sendViaPostal(args: EmailArgs): Promise<void> {
  const url = process.env.POSTAL_API_URL
  const key = process.env.POSTAL_API_KEY
  if (!url) {
    throw new Error("[@naeemba/next-starter] POSTAL_API_URL is required to use the Postal transport.")
  }
  if (!key) {
    throw new Error("[@naeemba/next-starter] POSTAL_API_KEY is required to use the Postal transport.")
  }

  const response = await fetch(`${url}/api/v1/send/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Server-API-Key": key,
    },
    body: JSON.stringify({
      to: [args.to],
      from: args.from,
      subject: args.subject,
      html_body: args.html,
      plain_body: args.text,
    }),
  })

  // Postal answers HTTP 200 even on failure, distinguishing outcomes via a
  // JSON `status` field ('success' | 'error' | 'parameter-error').
  const body = (await response.json().catch(() => null)) as { status?: string } | null
  if (!response.ok || body?.status !== "success") {
    throw new Error(
      `[@naeemba/next-starter] Postal send failed (HTTP ${response.status}): ${JSON.stringify(body)}`
    )
  }
}
