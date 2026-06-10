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
})
