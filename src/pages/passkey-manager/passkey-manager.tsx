"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useWebAuthnSupported, type PasskeyAuthClient } from "../../client/index.js"

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
  /**
   * Custom rendering when WebAuthn isn't supported by the current browser.
   * Defaults to `null` (the manager renders nothing).
   */
  unsupportedCopy?: ReactNode
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
    unsupportedCopy = null,
  } = props

  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState("")
  const isSupported = useWebAuthnSupported()
  // The setup body MUST run on every mount — under React StrictMode (Next.js
  // dev default) effects are double-invoked as setup → cleanup → setup, so
  // an empty setup leaves `mounted.current = false` after the first cleanup.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Auto-revert to `idle` after a short success window so the user can
  // register a second key (laptop → phone → yubikey on a settings page).
  // The `disabled` guard during "added" prevents the double-click race;
  // this restores the multi-key flow once the race window has passed.
  useEffect(() => {
    if (status !== "added") return
    const t = setTimeout(() => {
      if (mounted.current) setStatus("idle")
    }, 1500)
    return () => clearTimeout(t)
  }, [status])

  async function onAdd() {
    setStatus("adding")
    setError("")
    try {
      const result = await authClient.passkey.addPasskey(passkeyName ? { name: passkeyName } : undefined)
      if (!mounted.current) return
      if (result.error) {
        setStatus("error")
        setError(result.error.message ?? "Failed to add passkey")
        return
      }
      setStatus("added")
      onAdded?.()
    } catch (err) {
      if (!mounted.current) return
      setStatus("error")
      setError(err instanceof Error ? err.message : "Network error")
    }
  }

  if (!isSupported) {
    return unsupportedCopy ? <div className={className}>{unsupportedCopy}</div> : null
  }

  const disabled = status === "adding" || status === "added"

  return (
    <div className={className}>
      <button type="button" onClick={onAdd} disabled={disabled} style={{ padding: "8px 12px" }}>
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
