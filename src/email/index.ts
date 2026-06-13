import type { ReactElement } from "react"
import { loadOptionalPeerAsync } from "../internal/optional-peer.js"
import { sendViaConsole, type EmailArgs as TransportArgs } from "./console.js"
import { sendViaResend } from "./resend.js"

export interface EmailArgs {
  to: string | string[]
  from?: string
  subject: string
  text?: string
  html?: string
  react?: ReactElement
}

export async function sendEmail(args: EmailArgs): Promise<void> {
  const from = args.from ?? process.env.EMAIL_FROM
  if (!from) {
    throw new Error(
      "[@naeemba/next-starter] sendEmail requires either `from` or process.env.EMAIL_FROM."
    )
  }
  if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
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

  if (process.env.RESEND_API_KEY) {
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
