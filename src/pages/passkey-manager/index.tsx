"use client"

import { useState, type ReactNode } from "react"
import type { PasskeyAuthClient } from "../../client/index.js"

export interface PasskeyManagerProps {
  /**
   * better-auth client with the passkey plugin loaded. Pass the `AuthClient`
   * returned from `createAuthClient()` or any client whose `passkey.addPasskey()`
   * method matches the `PasskeyAuthClient` shape.
   *
   * Note: requires the server-side `createAuth({ passkey: ... })` to be enabled,
   * otherwise the addPasskey call will return a 404 error.
   */
  authClient: PasskeyAuthClient
  className?: string
  addLabel?: ReactNode
  /** Optional name to attach to the registered passkey (e.g. user-supplied label). */
  passkeyName?: string
  /** Fires after a successful registration. */
  onAdded?: () => void
  /** Custom rendering for the success state. Defaults to a confirmation message. */
  successCopy?: ReactNode
}

type Status = "idle" | "adding" | "added" | "error"

export function PasskeyManager(props: PasskeyManagerProps) {
  const {
    authClient,
    className,
    addLabel = "Add a passkey",
    passkeyName,
    onAdded,
    successCopy = "Passkey added.",
  } = props

  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState("")

  async function onAdd() {
    setStatus("adding")
    setError("")
    try {
      const result = await authClient.passkey.addPasskey(passkeyName ? { name: passkeyName } : undefined)
      if (result.error) {
        setStatus("error")
        setError(result.error.message ?? "Failed to add passkey")
        return
      }
      setStatus("added")
      onAdded?.()
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Network error")
    }
  }

  return (
    <div className={className}>
      <button type="button" onClick={onAdd} disabled={status === "adding"} style={{ padding: "8px 12px" }}>
        {status === "adding" ? "Adding…" : addLabel}
      </button>
      {status === "added" && (
        <p style={{ color: "#080", marginTop: 8, fontSize: 13 }}>{successCopy}</p>
      )}
      {status === "error" && (
        <p style={{ color: "#b00", marginTop: 8, fontSize: 13 }}>{error}</p>
      )}
    </div>
  )
}
