import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: { provider: "v8", reporter: ["text"] },
  },
  resolve: {
    alias: { "@naeemba/next-starter": new URL("./src/", import.meta.url).pathname },
  },
})
