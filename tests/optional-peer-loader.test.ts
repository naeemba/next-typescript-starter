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
})
