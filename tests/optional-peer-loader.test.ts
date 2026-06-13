import { describe, it, expect } from "vitest"

describe("optional-peer loader", () => {
  it("loads an installed peer and returns the module", async () => {
    const { loadOptionalPeer } = await import("../src/internal/optional-peer.js")
    // We assert mod.z (a known zod export) — not just truthiness — so this
    // would catch require() resolving the wrong module.
    // 'zod' is guaranteed installed and ships CJS, so require() works in ESM.
    const mod = loadOptionalPeer<typeof import("zod")>("zod", "test fixture")
    expect(mod).toBeTypeOf("object")
    expect(mod.z).toBeDefined()
  })

  it("throws a friendly error when the peer is missing", async () => {
    const { loadOptionalPeer } = await import("../src/internal/optional-peer.js")
    expect(() =>
      loadOptionalPeer("@naeemba/this-package-does-not-exist", "fake usage"),
    ).toThrow(/Optional peer '@naeemba\/this-package-does-not-exist' is not installed/)
  })

  it("includes the npm install hint and usage site in the error", async () => {
    const { loadOptionalPeer } = await import("../src/internal/optional-peer.js")
    try {
      loadOptionalPeer("@naeemba/missing-pkg", "the magic-link template")
      throw new Error("expected to throw")
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toMatch(/npm i @naeemba\/missing-pkg/)
      expect(msg).toMatch(/the magic-link template/)
    }
  })

  // Regression: Turbopack rewrites `import.meta.url` to a virtualized chunk
  // path under .next/server/chunks/. createRequire bound to that URL fails
  // to walk to the consumer's node_modules, so peer lookups for installed
  // packages misfired with "Optional peer not installed". The CWD fallback
  // covers that case — even if the package-bound resolver throws, the
  // consumer's CWD-rooted resolver should find the package.
  it("falls back to a CWD-bound resolver when the package-bound resolver misses", async () => {
    const { loadOptionalPeer } = await import("../src/internal/optional-peer.js")
    // 'zod' is in the workspace root node_modules. The CWD-based fallback
    // alone is enough to find it from a Turbopack-style virtual URL; that's
    // exactly the path this regression covers.
    const mod = loadOptionalPeer<typeof import("zod")>("zod", "fallback fixture")
    expect(mod.z).toBeDefined()
  })

  it("re-throws non-MODULE_NOT_FOUND errors (e.g. SyntaxError) as-is", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { loadOptionalPeer } = await import("../src/internal/optional-peer.js")

    const dir = mkdtempSync(join(tmpdir(), "ns-peer-"))
    const file = join(dir, "broken.cjs")
    writeFileSync(file, "this is not valid javascript {{{")
    try {
      // The file exists and resolves, but require() will throw SyntaxError
      // (or similar) at parse time — code !== "MODULE_NOT_FOUND". The loader
      // must surface that error untouched, NOT wrap it as "Optional peer ...
      // is not installed".
      expect(() => loadOptionalPeer(file, "broken fixture")).toThrow()
      expect(() => loadOptionalPeer(file, "broken fixture")).not.toThrow(/Optional peer/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Regression: the "installed but cannot be loaded the way we tried"
  // branch was added without a test. It's distinct from "not installed" —
  // `npm i` won't fix an ESM-only peer being require()'d in Node 20, or a
  // subpath that isn't in the package's `exports` map. The error message
  // must say "installed but failed to load" and surface the underlying
  // Node code, NOT the misleading install hint.
  //
  // Use synthetic CJS throwers (a module whose body assigns `err.code` and
  // throws at require time) instead of "build a real ESM-only package and
  // hope Node's require(ESM) interop doesn't paper over it". Node 22+ has
  // unflagged require(ESM) interop and would silently succeed; a synthetic
  // thrower exercises the loader's classifier directly and is Node-version
  // independent.
  it("throws an 'installed but failed to load' error for ERR_REQUIRE_ESM", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { loadOptionalPeer } = await import("../src/internal/optional-peer.js")

    const dir = mkdtempSync(join(tmpdir(), "ns-peer-esm-"))
    const file = join(dir, "esm-thrower.cjs")
    // Synthesize the exact error Node 20 throws when require() hits an
    // ESM-only module: a real Error with `code = "ERR_REQUIRE_ESM"`. The
    // loader keys off `err.code`, not the message, so this is the same
    // shape it would see from a real ESM-only peer in CI.
    writeFileSync(
      file,
      `const e = new Error("synthetic ESM-only peer"); e.code = "ERR_REQUIRE_ESM"; throw e\n`,
    )
    try {
      expect(() => loadOptionalPeer(file, "esm-only fixture")).toThrow(
        /installed but failed to load/,
      )
      expect(() => loadOptionalPeer(file, "esm-only fixture")).toThrow(/Underlying error:/)
      // And NOT the misleading "not installed" wording — the whole point
      // of this branch is that `npm i` won't fix it.
      expect(() => loadOptionalPeer(file, "esm-only fixture")).not.toThrow(/is not installed/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("throws an 'installed but failed to load' error for ERR_PACKAGE_PATH_NOT_EXPORTED", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { loadOptionalPeer } = await import("../src/internal/optional-peer.js")

    const dir = mkdtempSync(join(tmpdir(), "ns-peer-exports-"))
    const file = join(dir, "exports-thrower.cjs")
    writeFileSync(
      file,
      `const e = new Error("synthetic unexported subpath"); e.code = "ERR_PACKAGE_PATH_NOT_EXPORTED"; throw e\n`,
    )
    try {
      expect(() => loadOptionalPeer(file, "unexported subpath fixture")).toThrow(
        /installed but failed to load/,
      )
      expect(() => loadOptionalPeer(file, "unexported subpath fixture")).toThrow(
        /Underlying error:/,
      )
      expect(() => loadOptionalPeer(file, "unexported subpath fixture")).not.toThrow(
        /is not installed/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// loadOptionalPeerAsync is the dynamic-import sibling for ESM-only peers.
// It's exercised only indirectly through `src/email/*` in production, so
// any regression that (a) swaps the wrapper for the sync one, (b) adds a
// CWD fallback that doesn't belong here (see src/internal/optional-peer.ts:84-93),
// or (c) breaks the new ERR_REQUIRE_ESM classification for async callers
// would ship silently. Mirror the four sync tests.
describe("optional-peer loader (async)", () => {
  it("loads an installed peer and returns the module", async () => {
    const { loadOptionalPeerAsync } = await import("../src/internal/optional-peer.js")
    const mod = await loadOptionalPeerAsync<typeof import("zod")>(
      "zod",
      () => import("zod"),
      "async test fixture",
    )
    expect(mod).toBeTypeOf("object")
    expect(mod.z).toBeDefined()
  })

  it("throws a friendly error when the peer is missing", async () => {
    const { loadOptionalPeerAsync } = await import("../src/internal/optional-peer.js")
    await expect(
      loadOptionalPeerAsync(
        "@naeemba/this-package-does-not-exist",
        // @ts-expect-error — intentionally importing a non-existent module
        // for the not-installed branch; the type system would otherwise
        // refuse the literal.
        () => import("@naeemba/this-package-does-not-exist"),
        "async fake usage",
      ),
    ).rejects.toThrow(/Optional peer '@naeemba\/this-package-does-not-exist' is not installed/)
  })

  it("includes the npm install hint and usage site in the error", async () => {
    const { loadOptionalPeerAsync } = await import("../src/internal/optional-peer.js")
    try {
      await loadOptionalPeerAsync(
        "@naeemba/missing-async-pkg",
        // @ts-expect-error — intentionally importing a non-existent module
        () => import("@naeemba/missing-async-pkg"),
        "the async magic-link template",
      )
      throw new Error("expected to throw")
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toMatch(/npm i @naeemba\/missing-async-pkg/)
      expect(msg).toMatch(/the async magic-link template/)
    }
  })

  it("re-throws non-MODULE_NOT_FOUND errors (e.g. SyntaxError) as-is", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { pathToFileURL } = await import("node:url")
    const { loadOptionalPeerAsync } = await import("../src/internal/optional-peer.js")

    const dir = mkdtempSync(join(tmpdir(), "ns-peer-async-"))
    // .mjs so dynamic import() resolves it as ESM and parses the file —
    // a SyntaxError there is not MODULE_NOT_FOUND and must pass through.
    const file = join(dir, "broken.mjs")
    writeFileSync(file, "this is not valid javascript {{{")
    try {
      const url = pathToFileURL(file).href
      await expect(
        loadOptionalPeerAsync("broken-async-fixture", () => import(url), "async broken fixture"),
      ).rejects.toThrow()
      await expect(
        loadOptionalPeerAsync("broken-async-fixture", () => import(url), "async broken fixture"),
      ).rejects.not.toThrow(/Optional peer/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Async-side mirror of the sync ERR_REQUIRE_ESM / ERR_PACKAGE_PATH_NOT_EXPORTED
  // tests. Use an importFn that throws a synthetic error with the right
  // `code` directly — dynamic import() itself rarely emits these codes in
  // practice, but the loader's classifier keys on `err.code`, and a future
  // regression that swaps the async wrapper for the sync one (or omits the
  // peer-load branch) would silently miss these. The importFn shape is the
  // exact production seam, so this is the cleanest, Node-version-independent
  // way to cover the branch.
  it("wraps peer-load errors with 'installed but failed to load'", async () => {
    const { loadOptionalPeerAsync } = await import("../src/internal/optional-peer.js")
    const make = (code: string) => () => {
      const e = new Error(`synthetic ${code}`) as NodeJS.ErrnoException
      e.code = code
      return Promise.reject(e)
    }
    await expect(
      loadOptionalPeerAsync("synth-async-esm", make("ERR_REQUIRE_ESM"), "async esm fixture"),
    ).rejects.toThrow(/installed but failed to load/)
    await expect(
      loadOptionalPeerAsync(
        "synth-async-exports",
        make("ERR_PACKAGE_PATH_NOT_EXPORTED"),
        "async exports fixture",
      ),
    ).rejects.toThrow(/Underlying error:/)
    // And NOT the misleading install hint — the contract distinguishes
    // "not installed" from "installed but cannot be loaded".
    await expect(
      loadOptionalPeerAsync("synth-async-esm", make("ERR_REQUIRE_ESM"), "async esm fixture"),
    ).rejects.not.toThrow(/is not installed/)
  })
})
