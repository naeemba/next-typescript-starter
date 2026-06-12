import type { Resend as ResendType } from "resend"
import { loadOptionalPeer } from "../internal/optional-peer.js"
import type { EmailArgs } from "./console.js"

let _client: ResendType | null = null

function getClient(): ResendType {
  if (_client) return _client
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error("[@naeemba/next-starter] RESEND_API_KEY is required to use the Resend transport.")
  }
  const { Resend } = loadOptionalPeer<typeof import("resend")>("resend", "the Resend email transport (set RESEND_API_KEY)")
  _client = new Resend(key)
  return _client
}

export async function sendViaResend(args: EmailArgs): Promise<void> {
  const { error } = await getClient().emails.send({
    to: args.to,
    from: args.from,
    subject: args.subject,
    html: args.html,
    text: args.text,
  })
  if (error) {
    throw new Error(`[@naeemba/next-starter] Resend send failed: ${error.message}`)
  }
}
