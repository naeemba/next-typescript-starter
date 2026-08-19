"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useWebAuthnSupported, type PasskeyAuthClient } from "../../client/index.js"
import { styled, joinClassNames } from "../sign-in/styled.js"

/**
 * Per-element className overrides, same contract as `SignInFormClassNames`:
 * a provided key suppresses that element's inline-style default so your
 * CSS / Tailwind layer becomes the single source of truth; unset keys keep
 * the built-in inline defaults.
 */
export interface PasskeyManagerClassNames {
  /** Wrapper `<div>` (both branches). Composes with the legacy `className` prop. */
  root?: string
  /** The "add a passkey" `<button>`. */
  button?: string
  /** The `<p>` rendered after a successful registration. */
  success?: string
  /** The `role="alert"` `<p>` rendered when registration fails. */
  error?: string
}

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
  /** Legacy single-className for the wrapper `<div>`. Still composes with `classNames.root`. */
  className?: string
  /** Per-element className overrides; replaces the inline-style default for any element you provide. */
  classNames?: PasskeyManagerClassNames
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
    classNames,
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

  const rootClassName = joinClassNames(className, classNames?.root)

  if (!isSupported) {
    return unsupportedCopy ? <div className={rootClassName}>{unsupportedCopy}</div> : null
  }

  const disabled = status === "adding" || status === "added"

  return (
    <div className={rootClassName}>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        {...styled(classNames?.button, { padding: "8px 12px" })}
      >
        {status === "adding" ? "Adding…" : addLabel}
      </button>
      {status === "added" && (
        <p {...styled(classNames?.success, { color: "#080", marginTop: 8, fontSize: 13 })}>
          {successCopy}
        </p>
      )}
      {status === "error" && (
        // role="alert" so the failure reason is announced when it appears —
        // the paragraph is conditionally mounted, so assertive is safe here.
        <p role="alert" {...styled(classNames?.error, { color: "#b00", marginTop: 8, fontSize: 13 })}>
          {error}
        </p>
      )}
    </div>
  )
}
