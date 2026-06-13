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
//
// `pathToFileURL(process.cwd()).href + "/"` (URL spec is forward-slash
// even on Windows) rather than `pathToFileURL(process.cwd() + "/").href`,
// which on Windows would produce a mixed-separator input like
// `C:\Users\foo/` and round-trip to a malformed `file:///` URL.
const cwdRequire = createRequire(pathToFileURL(process.cwd()).href + "/")

function isModuleNotFound(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND"
}

// Distinct from "not installed": the peer IS reachable but cannot be
// loaded via the path we tried. ERR_REQUIRE_ESM = peer ships ESM-only
// (realistic for resend / @react-email/* in a future major) and was
// reached via createRequire — needs the async helper instead.
// ERR_PACKAGE_PATH_NOT_EXPORTED = the bare specifier doesn't match the
// peer's `exports` map — caller picked the wrong subpath.
// Either is a code-level mismatch; consumers can't fix it with `npm i`,
// so surface the original error instead of the misleading install hint.
function isPeerLoadError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === "ERR_REQUIRE_ESM" || code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
}

function peerErrorMessage(name: string, usedBy: string): string {
  return (
    `[@naeemba/next-starter] Optional peer '${name}' is not installed.\n` +
    `  Install it with:  npm i ${name}\n` +
    `  Used by: ${usedBy}`
  )
}

function peerLoadErrorMessage(name: string, usedBy: string, err: unknown): string {
  const original = err instanceof Error ? err.message : String(err)
  return (
    `[@naeemba/next-starter] Optional peer '${name}' is installed but failed to load.\n` +
    `  Used by: ${usedBy}\n` +
    `  Underlying error: ${original}`
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
    if (isPeerLoadError(err)) throw new Error(peerLoadErrorMessage(name, usedBy, err))
    if (!isModuleNotFound(err)) throw err
    // Retry from CWD — covers the Turbopack/virtualized-import.meta.url case.
    try {
      return cwdRequire(name) as T
    } catch (err2) {
      if (isPeerLoadError(err2)) throw new Error(peerLoadErrorMessage(name, usedBy, err2))
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
 *
 * No CWD fallback: dynamic `import()` is resolved by the caller's bundler
 * (or by Node's ESM loader against the caller's module URL), not via
 * `createRequire`, so the Turbopack-virtualized-URL miss that `loadOptionalPeer`
 * works around cannot happen here. Do NOT add one for symmetry.
 */
export async function loadOptionalPeerAsync<T>(
  name: string,
  importFn: () => Promise<T>,
  usedBy: string,
): Promise<T> {
  try {
    return await importFn()
  } catch (err) {
    if (isPeerLoadError(err)) throw new Error(peerLoadErrorMessage(name, usedBy, err))
    if (!isModuleNotFound(err)) throw err
    throw new Error(peerErrorMessage(name, usedBy))
  }
}
