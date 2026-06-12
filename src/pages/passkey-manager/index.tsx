"use client"

export { PasskeyManager, type PasskeyManagerProps } from "./passkey-manager.js"
// Re-export PasskeyAuthClient so consumers can type the `authClient` prop
// without reaching into the /client subpath — mirrors the sign-in barrel.
export { type PasskeyAuthClient } from "../../client/index.js"
