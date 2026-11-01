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
  // This is why `typescript` in package.json is an alias for
  // @typescript/typescript6 while `tsc` comes from @typescript/native
  // (typescript 7). TypeScript 7 ships no JavaScript compiler API, and this
  // step needs one: tsup reads the tsconfig through `import "typescript"`
  // itself, before its vendored rollup-plugin-dts gets a chance to fall back
  // to @typescript/typescript6. With plain typescript 7 installed the step
  // dies with "parseJsonConfigFileContent is not a function" after the JS
  // build, and the package ships without types.
  //
  // Drop the alias when tsup works against typescript 7's own API (expected
  // in 7.1). Last checked against tsup 9.0.0 and typescript 7.0.2 on
  // 2026-11-01.
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
