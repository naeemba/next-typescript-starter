/**
 * Toggle WebAuthn support for jsdom tests.
 *
 * `useWebAuthnSupported()` feature-detects `window.PublicKeyCredential`;
 * jsdom doesn't ship the property, so we define it for tests that exercise
 * passkey UI paths and delete it for tests that should see the unsupported
 * fallback.
 *
 * Was duplicated byte-for-byte across `passkey-manager.test.tsx` and
 * `sign-in-form-extended.test.tsx`. Keep this single source of truth so a
 * future addition (`isUserVerifyingPlatformAuthenticatorAvailable`, etc.)
 * lands once instead of drifting between files.
 */
export function enableWebAuthn(): void {
  Object.defineProperty(window, "PublicKeyCredential", {
    value: function () {},
    configurable: true,
  })
}

export function disableWebAuthn(): void {
  Reflect.deleteProperty(window, "PublicKeyCredential")
}
