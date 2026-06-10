import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    "auth/index":          "src/auth/index.ts",
    "auth-route/index":    "src/auth-route/index.ts",
    "schema/index":        "src/schema/index.ts",
    "db/index":            "src/db/index.ts",
    "email/index":         "src/email/index.ts",
    "pages/sign-in/index": "src/pages/sign-in/index.tsx",
    "server/index":        "src/server/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["next", "react", "react-dom"],
  splitting: false,
  treeshake: true,
  async onSuccess() {
    const fs = await import("node:fs/promises")
    const filePath = "dist/pages/sign-in/index.js"
    const content = await fs.readFile(filePath, "utf8")
    const trimmed = content.trimStart()
    if (!trimmed.startsWith('"use client"') && !trimmed.startsWith("'use client'")) {
      await fs.writeFile(filePath, '"use client"\n' + content, "utf8")
    }
  },
})
