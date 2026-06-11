export interface EmailArgs {
  to: string
  from: string
  subject: string
  html: string | undefined
  text: string
}

const URL_RE = /https?:\/\/[^\s)]+/

export async function sendViaConsole(args: EmailArgs): Promise<void> {
  const url = args.text.match(URL_RE)?.[0] ?? "(no URL detected in text body)"

  console.log("")
  console.log("📧 [@naeemba/next-starter] Email (dev mode — RESEND_API_KEY unset)")
  console.log(`   To:      ${args.to}`)
  console.log(`   From:    ${args.from}`)
  console.log(`   Subject: ${args.subject}`)
  console.log(`   ${args.text}`)
  console.log("")

  // Machine-readable single-line summary for the Playwright smoke test to grep.
  console.log(`[magic-link-log] email=${args.to} url=${url}`)
}
