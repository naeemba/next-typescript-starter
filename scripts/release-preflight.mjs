#!/usr/bin/env node
// Pre-flight checks run before `npm version <bump>` in the release:* scripts.
// `npm version` already refuses a dirty tree by default, but a custom check
// gives the maintainer a clearer error than "Git working directory not clean"
// and surfaces the wrong-branch / out-of-sync cases that npm version doesn't.

import { execFileSync } from "node:child_process"

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

function fail(message) {
  process.stderr.write(`\n  ✗ release pre-flight failed\n    ${message}\n\n`)
  process.exit(1)
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD")
if (branch !== "main") {
  fail(`releases must be cut from main (current branch: ${branch})`)
}

const status = git("status", "--porcelain")
if (status) {
  fail(`working tree has uncommitted changes:\n${status.split("\n").map((l) => `      ${l}`).join("\n")}`)
}

try {
  git("fetch", "origin", "main", "--quiet")
} catch {
  fail("could not fetch origin/main (no network or no remote?)")
}

const local = git("rev-parse", "HEAD")
const remote = git("rev-parse", "origin/main")
if (local !== remote) {
  fail(`local main is not in sync with origin/main\n      local:  ${local.slice(0, 10)}\n      remote: ${remote.slice(0, 10)}\n      run \`git pull --ff-only\` first`)
}

process.stdout.write("  ✓ on main, clean tree, up to date with origin\n")
