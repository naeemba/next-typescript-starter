import { createRequire } from "node:module"

// createRequire bound to the package's own location so consumers' module
// resolution finds packages installed alongside @naeemba/next-starter,
// not packages relative to this source file path.
const peerRequire = createRequire(import.meta.url)

/**
 * Load an optional peer dependency synchronously. On MODULE_NOT_FOUND,
 * throws an instructional error pointing the consumer at the right
 * `npm i` command and naming the call site that needed the package.
 *
 * Synchronous so it can be called from existing synchronous APIs
 * (createDb, sendViaResend) without leaking async into the public surface.
 */
export function loadOptionalPeer<T>(name: string, usedBy: string): T {
  try {
    return peerRequire(name) as T
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== "MODULE_NOT_FOUND" && code !== "ERR_MODULE_NOT_FOUND") {
      throw err
    }
    throw new Error(
      `[@naeemba/next-starter] Optional peer '${name}' is not installed.\n` +
        `  Install it with:  npm i ${name}\n` +
        `  Used by: ${usedBy}`,
    )
  }
}
