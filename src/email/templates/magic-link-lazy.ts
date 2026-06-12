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
  const { render } = await import("@react-email/render").catch((err) => {
    if (isModuleNotFound(err)) throwPeerError("@react-email/render", "the default magic-link email template")
    throw err
  })
  const { MagicLinkEmail } = await import("./magic-link.js").catch((err) => {
    if (isModuleNotFound(err)) throwPeerError("@react-email/components", "the default magic-link email template")
    throw err
  })
  return render(MagicLinkEmail({ url: args.url, appName: args.appName }))
}

function isModuleNotFound(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND"
}

function throwPeerError(name: string, usedBy: string): never {
  throw new Error(
    `[@naeemba/next-starter] Optional peer '${name}' is not installed.\n` +
      `  Install it with:  npm i ${name}\n` +
      `  Used by: ${usedBy}`,
  )
}
