import { loadOptionalPeerAsync } from "../../internal/optional-peer.js"

/**
 * Lazy entry point for the default magic-link email. Importing this file
 * does NOT pull in @react-email/components — the template is only
 * resolved when renderDefaultMagicLink() is awaited. Consumers who pass
 * magicLink.email: customFn never trigger this path and don't need
 * @react-email/* installed.
 */
export async function renderDefaultMagicLink(args: { url: string; appName?: string }): Promise<string> {
  // Probe each peer via its bare specifier so the loader's instructional
  // error fires only when *that* peer is genuinely missing. Loading the
  // local template through the loader (the prior shape) would have rewritten
  // any MODULE_NOT_FOUND inside ./magic-link.js — e.g. a tsup output drift —
  // into a misleading "@react-email/components is not installed" message.
  await loadOptionalPeerAsync(
    "@react-email/render",
    () => import("@react-email/render"),
    "the default magic-link email template",
  )
  await loadOptionalPeerAsync(
    "@react-email/components",
    () => import("@react-email/components"),
    "the default magic-link email template",
  )
  const { render } = await import("@react-email/render")
  const { MagicLinkEmail } = await import("./magic-link.js")
  return render(MagicLinkEmail({ url: args.url, appName: args.appName }))
}
