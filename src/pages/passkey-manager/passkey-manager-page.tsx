"use client"

import type { CSSProperties, ReactNode } from "react"
import { PasskeyManager, type PasskeyManagerProps } from "./passkey-manager.js"

export interface PasskeyManagerPageProps extends PasskeyManagerProps {
  title?: string
  /**
   * Body copy under the heading. Pass `null` to suppress entirely; omit to
   * use the default ("Add a passkey to sign in faster on this device.").
   */
  description?: ReactNode
}

// Parallel to SignInPage: a minimal `<main>` wrapper that gives consumers
// scaffolded by `next-starter init` a working /account/passkeys page with
// nothing more than `<PasskeyManagerPage authClient={authClient} />`. For
// full styling control, copy this file into the consumer app and render
// <PasskeyManager/> directly inside their own layout chrome.
export function PasskeyManagerPage(props: PasskeyManagerPageProps) {
  const {
    title = "Passkeys",
    description = "Add a passkey to sign in faster on this device.",
    ...managerProps
  } = props

  // Heading-margin and description-render gates use the same truthiness
  // check, so a consumer passing `description=""` to suppress the body
  // copy (effectively the same intent as `description={null}`) gets the
  // no-description heading margin AND no empty `<p>`. Previously the
  // heading used `description ? …` while the `<p>` rendered iff
  // `description != null && description !== false` — passing `""` would
  // render an empty `<p>` with the description-absent heading margin.
  const hasDescription = Boolean(description)
  const mainStyle: CSSProperties = { maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }
  const headingStyle: CSSProperties = { fontSize: 20, marginBottom: hasDescription ? 4 : 12 }
  const descriptionStyle: CSSProperties = { fontSize: 13, color: "#555", marginTop: 0, marginBottom: 12 }

  return (
    <main style={mainStyle}>
      <h1 style={headingStyle}>{title}</h1>
      {hasDescription && <p style={descriptionStyle}>{description}</p>}
      <PasskeyManager {...managerProps} />
    </main>
  )
}
