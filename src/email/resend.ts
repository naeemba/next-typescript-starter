import { Resend } from "resend"
import type { EmailArgs } from "./console.js"

let _client: Resend | null = null

function getClient(): Resend {
  if (_client) return _client
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error("[@naeemba/next-starter] RESEND_API_KEY is required to use the Resend transport.")
  }
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
