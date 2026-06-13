import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    "auth/index":                  "src/auth/index.ts",
    "auth-route/index":            "src/auth-route/index.ts",
    "client/index":                "src/client/index.ts",
    "schema/index":                "src/schema/index.ts",
    "db/index":                    "src/db/index.ts",
    "email/index":                 "src/email/index.ts",
    "email/templates/magic-link-lazy": "src/email/templates/magic-link-lazy.ts",
    "email/templates/magic-link":      "src/email/templates/magic-link.tsx",
    "pages/sign-in/index":         "src/pages/sign-in/index.tsx",
    "pages/passkey-manager/index": "src/pages/passkey-manager/index.tsx",
    "server/index":                "src/server/index.ts",
    "proxy/index":                 "src/proxy/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["next", "next/server", "react", "react-dom", "better-auth", "better-auth/react", "better-auth/client/plugins", "@better-auth/passkey", "@better-auth/passkey/client", "postgres", "@react-email/render", "@react-email/components", "resend"],
  splitting: true,
  treeshake: true,
  async onSuccess() {
    const fs = await import("node:fs/promises")
    for (const filePath of ["dist/pages/sign-in/index.js", "dist/pages/passkey-manager/index.js", "dist/client/index.js"]) {
      const content = await fs.readFile(filePath, "utf8")
      const trimmed = content.trimStart()
      if (!trimmed.startsWith('"use client"') && !trimmed.startsWith("'use client'")) {
        await fs.writeFile(filePath, '"use client"\n' + content, "utf8")
      }
    }
  },
})
