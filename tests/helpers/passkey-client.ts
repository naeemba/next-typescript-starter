import { vi } from "vitest"
import type { PasskeyAuthClient } from "../../src/client/index.js"

/**
 * Mock `PasskeyAuthClient` for PasskeyManager suites. Single source of truth
 * (like `webauthn.ts`) so a change to the client shape lands once instead of
 * drifting between test files.
 */
export function makeClient(
  opts: { addPasskey?: PasskeyAuthClient["passkey"]["addPasskey"] } = {},
): PasskeyAuthClient {
  return {
    signIn: { passkey: vi.fn(async () => ({ error: null })) },
    passkey: {
      addPasskey: opts.addPasskey ?? vi.fn(async () => ({ data: { id: "p1" }, error: null })),
    },
  }
}
