import { createAuth } from "@naeemba/next-starter/auth"

const googleConfigured = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET

export const auth = await createAuth({
  ...(googleConfigured && { google: {} }),
  passkey: {
    rpName: "Next Starter Example",
  },
})
