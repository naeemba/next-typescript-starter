import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

// Primary resolver: bound to the package's own location so consumer-installed
// peers next to @naeemba/next-starter are visible via normal Node module
// walk-up. Sufficient under raw Node.
const packageRequire = createRequire(import.meta.url)

// Fallback resolver: bound to the consumer's working directory. Turbopack
// (Next.js dev server) rewrites `import.meta.url` to a virtual chunk path
// that breaks Node's module resolution, so peer lookups from the bundled
// chunk miss the consumer's node_modules. process.cwd() always points at
// the consumer's project root in that context.
const cwdRequire = createRequire(pathToFileURL(process.cwd() + "/").href)

function isModuleNotFound(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND"
}

function peerErrorMessage(name: string, usedBy: string): string {
  return (
    `[@naeemba/next-starter] Optional peer '${name}' is not installed.\n` +
    `  Install it with:  npm i ${name}\n` +
    `  Used by: ${usedBy}`
  )
}

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
    return packageRequire(name) as T
  } catch (err) {
    if (!isModuleNotFound(err)) throw err
    // Retry from CWD — covers the Turbopack/virtualized-import.meta.url case.
    try {
      return cwdRequire(name) as T
    } catch (err2) {
      if (!isModuleNotFound(err2)) throw err2
      throw new Error(peerErrorMessage(name, usedBy))
    }
  }
}

/**
 * Async sibling for ESM-only peers that require dynamic `import()`. The
 * literal dynamic-import expression stays at the call site so bundlers
 * (tsup, esbuild) can analyze it statically; this helper only wraps the
 * error path with the same instructional message as `loadOptionalPeer`.
 */
export async function loadOptionalPeerAsync<T>(
  name: string,
  importFn: () => Promise<T>,
  usedBy: string,
): Promise<T> {
  try {
    return await importFn()
  } catch (err) {
    if (!isModuleNotFound(err)) throw err
    throw new Error(peerErrorMessage(name, usedBy))
  }
}
