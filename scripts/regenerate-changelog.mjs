#!/usr/bin/env node
// Run conventional-changelog in a way that preserves the top-of-file
// `# Changelog` heading + intro paragraph.
//
// Out of the box `conventional-changelog -i CHANGELOG.md -s -r 1` prepends
// the new entry to position 0 of the file, pushing the heading down between
// the new entry and the previous one. We split the file at the first `## `
// release heading, hand only the body to conventional-changelog, then glue
// the saved header back on. Idempotent and resilient against files that
// don't yet have a heading (first release ever).
//
// The whole strip-and-restore is wrapped in try/finally — if
// conventional-changelog crashes mid-run, we still write the original
// file back so the next attempt isn't reading a half-stripped CHANGELOG.

import { readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"

const SELF_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SELF_DIR, "..")
const CHANGELOG_PATH = resolve(process.cwd(), "CHANGELOG.md")

// Resolve `conventional-changelog` relative to this script's repo, not
// process.cwd() and not the ambient PATH. Lets the script work whether it
// was invoked via `npm run changelog` (PATH includes node_modules/.bin) or
// `node scripts/regenerate-changelog.mjs` directly (PATH does NOT).
const BIN = resolve(REPO_ROOT, "node_modules/.bin/conventional-changelog")
if (!existsSync(BIN)) {
  process.stderr.write(
    `[regenerate-changelog] could not find ${BIN}\n` +
      `  run \`npm install\` first.\n`,
  )
  process.exit(1)
}

const original = await readFile(CHANGELOG_PATH, "utf8")
const firstReleaseHeading = original.search(/^## /m)
const header = firstReleaseHeading >= 0 ? original.slice(0, firstReleaseHeading) : ""
const body = firstReleaseHeading >= 0 ? original.slice(firstReleaseHeading) : ""

try {
  await writeFile(CHANGELOG_PATH, body, "utf8")
  execFileSync(BIN, ["-p", "conventionalcommits", "-i", "CHANGELOG.md", "-s", "-r", "1"], {
    stdio: "inherit",
    cwd: process.cwd(),
  })
  const after = await readFile(CHANGELOG_PATH, "utf8")
  await writeFile(CHANGELOG_PATH, header + after, "utf8")
} catch (err) {
  // Roll back. A failure mid-run otherwise leaves the file header-stripped
  // and CI's auto-detection of "section already exists" gets confused on
  // the next attempt.
  await writeFile(CHANGELOG_PATH, original, "utf8")
  throw err
}
