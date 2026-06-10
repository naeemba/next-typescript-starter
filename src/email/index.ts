import { render } from "@react-email/render"
import { MagicLinkEmail } from "./templates/magic-link.js"
import { sendViaConsole, type EmailArgs } from "./console.js"
import { sendViaResend } from "./resend.js"

interface SendMagicLinkArgs {
  to: string
  url: string
  appName?: string
}

export async function sendMagicLink({ to, url, appName }: SendMagicLinkArgs): Promise<void> {
  if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
    console.warn(
      "[@naeemba/next-starter] WARNING: NODE_ENV=production but RESEND_API_KEY is unset. " +
        "Magic links will be written to server logs — anyone with log access can sign in as any user."
    )
  }

  const html = await render(MagicLinkEmail({ url, appName }))
  const text = `Sign in: ${url}`

  const args: EmailArgs = {
    to,
    from: process.env.EMAIL_FROM ?? "auth@example.invalid",
    subject: "Sign in to your account",
    html,
    text,
  }

  if (process.env.RESEND_API_KEY) {
    await sendViaResend(args)
  } else {
    await sendViaConsole(args)
  }
}
