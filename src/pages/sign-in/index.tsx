"use client"

export {
  SignInForm,
  type SignInFormProps,
  type SignInFormClassNames,
  type SignInAuthClient,
} from "./sign-in-form.js"
// 0.2.x compat: re-export the canonical MagicLinkAuthClient from /client.
// The previous local `MagicLinkAuthClient = SignInAuthClient` alias here
// widened the type to include optional social+passkey and collided with the
// canonical interface in /client.
export { type MagicLinkAuthClient } from "../../client/index.js"
export { SignInPage, type SignInPageProps, type SignInPageClassNames } from "./sign-in-page.js"
export { SignInPage as default } from "./sign-in-page.js"
