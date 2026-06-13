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
  // error fires only when *that* peer is genuinely missing. `render` is
  // used directly in this file, so keep the loader's return value. The
  // `@react-email/components` probe stays probe-only because the actual
  // consumer is `./magic-link.js` — loading that file through the loader
  // would rewrite any MODULE_NOT_FOUND inside it (e.g. tsup output drift)
  // into a misleading "@react-email/components is not installed" message.
  const { render } = await loadOptionalPeerAsync(
    "@react-email/render",
    () => import("@react-email/render"),
    "the default magic-link email template",
  )
  await loadOptionalPeerAsync(
    "@react-email/components",
    () => import("@react-email/components"),
    "the default magic-link email template",
  )
  const { MagicLinkEmail } = await import("./magic-link.js")
  return render(MagicLinkEmail({ url: args.url, appName: args.appName }))
}
