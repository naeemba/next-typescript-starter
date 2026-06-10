import Link from "next/link"
import { getSession } from "@naeemba/next-starter/server"

export default async function HomePage() {
  const session = await getSession()
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>@naeemba/next-starter example</h1>
      {session ? (
        <p data-testid="user-email">Signed in as {session.user.email}</p>
      ) : (
        <p>
          <Link href="/sign-in">Sign in</Link>
        </p>
      )}
    </main>
  )
}
