import { SignInPage, type MagicLinkAuthClient } from "@naeemba/next-starter/pages/sign-in"
import { authClient } from "../../lib/auth-client"

export default function Page() {
  return <SignInPage authClient={authClient as unknown as MagicLinkAuthClient} />
}
