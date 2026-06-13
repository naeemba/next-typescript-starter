import type { ReactElement } from "react"
import { loadOptionalPeerAsync } from "../internal/optional-peer.js"
import { sendViaConsole, type EmailArgs as TransportArgs } from "./console.js"
import { sendViaResend } from "./resend.js"

/**
 * BYO email transport. Receives the fully rendered email (template already
 * applied, react-email already rendered, recipient list already joined),
 * and is responsible for actually delivering it. When set, the built-in
 * Resend / console dispatch is skipped entirely — no Resend SDK import,
 * no RESEND_API_KEY required.
 *
 * Useful when the consumer already has a Postmark / Mailgun / SES / custom
 * wrapper and doesn't want a second email client in the process.
 */
export type EmailTransport = (args: TransportArgs) => Promise<void>

export interface EmailArgs {
  to: string | string[]
  from?: string
  subject: string
  text?: string
  html?: string
  react?: ReactElement
  /** See `EmailTransport`. Overrides the built-in Resend / console dispatch. */
  transport?: EmailTransport
}

export async function sendEmail(args: EmailArgs): Promise<void> {
  const from = args.from ?? process.env.EMAIL_FROM
  if (!from) {
    throw new Error(
      "[@naeemba/next-starter] sendEmail requires either `from` or process.env.EMAIL_FROM."
    )
  }
  // Only the built-in dispatch path falls back to console-logging in
  // production. A custom transport is the consumer's surface — they're
  // expected to handle their own provider config and shouldn't see this
  // warning when their wrapper is doing real delivery.
  if (!args.transport && process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
    console.warn(
      "[@naeemba/next-starter] WARNING: NODE_ENV=production but RESEND_API_KEY is unset. " +
        "Emails will be written to server logs instead of sent."
    )
  }

  let html = args.html
  if (!html && args.react) {
    const { render } = await loadOptionalPeerAsync(
      "@react-email/render",
      () => import("@react-email/render"),
      "the sendEmail React-template path",
    )
    html = await render(args.react)
  }

  const text = args.text ?? (html ? stripTags(html) : "")
  const to = Array.isArray(args.to) ? args.to.join(", ") : args.to

  const transportArgs: TransportArgs = {
    to,
    from,
    subject: args.subject,
    html,
    text,
  }

  if (args.transport) {
    await args.transport(transportArgs)
  } else if (process.env.RESEND_API_KEY) {
    await sendViaResend(transportArgs)
  } else {
    await sendViaConsole(transportArgs)
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim()
}

export interface SendMagicLinkArgs {
  to: string
  url: string
  expiresIn?: number
  appName?: string
  template?: (args: { to: string; url: string; expiresIn: number }) =>
    Promise<MagicLinkEmailFields> | MagicLinkEmailFields
  /** Forwarded to `sendEmail`. See `EmailTransport`. */
  transport?: EmailTransport
}

export interface MagicLinkEmailFields {
  subject: string
  from?: string
  text?: string
  html?: string
}

export async function sendMagicLink(args: SendMagicLinkArgs): Promise<void> {
  const expiresIn = args.expiresIn ?? 600
  const fields = args.template
    ? await args.template({ to: args.to, url: args.url, expiresIn })
    : await defaultMagicLinkFields({ to: args.to, url: args.url, expiresIn, appName: args.appName })
  await sendEmail({
    to: args.to,
    from: fields.from,
    subject: fields.subject,
    text: fields.text ?? `Sign in: ${args.url}`,
    html: fields.html,
    transport: args.transport,
  })
}

async function defaultMagicLinkFields(input: {
  to: string
  url: string
  expiresIn: number
  appName?: string
}): Promise<MagicLinkEmailFields> {
  const { renderDefaultMagicLink } = await import("./templates/magic-link-lazy.js")
  const html = await renderDefaultMagicLink({ url: input.url, appName: input.appName })
  return {
    subject: "Sign in to your account",
    text: `Sign in: ${input.url}`,
    html,
  }
}
