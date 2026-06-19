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
  // error fires only when *that* peer is genuinely missing. Both modules are
  // used directly here: `render` renders the element, and the components module
  // is injected into MagicLinkEmail so `./magic-link.js` carries no static
  // `@react-email/components` import — that would make it a hard build
  // dependency once a consumer's bundler follows the import below.
  const { render } = await loadOptionalPeerAsync(
    "@react-email/render",
    () =>
      import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ "@react-email/render"
      ),
    "the default magic-link email template",
  )
  const components = await loadOptionalPeerAsync(
    "@react-email/components",
    () =>
      import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ "@react-email/components"
      ),
    "the default magic-link email template",
  )
  // `./magic-link.js` is loaded with a plain import (no ignore comment): it has
  // no optional-peer import of its own, so bundling it is safe, and keeping it
  // bundled means a genuine error inside it surfaces as itself rather than a
  // misleading "components not installed" message.
  const { MagicLinkEmail } = await import("./magic-link.js")
  return render(MagicLinkEmail(components, { url: args.url, appName: args.appName }))
}
