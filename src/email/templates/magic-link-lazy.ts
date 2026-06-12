import { loadOptionalPeerAsync } from "../../internal/optional-peer.js"

/**
 * Lazy entry point for the default magic-link email. Importing this file
 * does NOT pull in @react-email/components — the template is only
 * resolved when renderDefaultMagicLink() is awaited. Consumers who pass
 * magicLink.email: customFn never trigger this path and don't need
 * @react-email/* installed.
 */
export async function renderDefaultMagicLink(args: { url: string; appName?: string }): Promise<string> {
  // Two separate dynamic imports so a missing peer surfaces with the
  // right `usedBy` hint via the loader's instructional error.
  const { render } = await loadOptionalPeerAsync(
    "@react-email/render",
    () => import("@react-email/render"),
    "the default magic-link email template",
  )
  const { MagicLinkEmail } = await loadOptionalPeerAsync(
    "@react-email/components",
    () => import("./magic-link.js"),
    "the default magic-link email template",
  )
  return render(MagicLinkEmail({ url: args.url, appName: args.appName }))
}
