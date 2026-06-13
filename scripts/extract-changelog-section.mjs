#!/usr/bin/env node
// Extract the markdown section for a single release version out of
// CHANGELOG.md. Used by the release GitHub Action to populate the
// GitHub Release body.
//
// Usage:  node scripts/extract-changelog-section.mjs <version>
// Output: the markdown between (exclusive) the `## ...<version>...` heading
//         and the next `## ` heading, written to stdout. Exit 1 if the
//         version's heading isn't found — fail loud so a missing CHANGELOG
//         entry doesn't ship an empty Release body silently.

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const [, , version] = process.argv
if (!version) {
  process.stderr.write("usage: extract-changelog-section <version>\n")
  process.exit(2)
}

const md = await readFile(resolve(process.cwd(), "CHANGELOG.md"), "utf8")
const lines = md.split("\n")

// Find the `## ` line whose text contains the target version. Both
// `## 0.5.0` (legacy hand-written) and `## [0.6.0](...)` (auto-generated)
// shapes are accepted — the version string just needs to appear in the
// heading line.
let start = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith("## ") && lines[i].includes(version)) {
    start = i + 1
    break
  }
}
if (start < 0) {
  process.stderr.write(`no CHANGELOG section found for version ${version}\n`)
  process.exit(1)
}

// Walk forward to the next `## ` heading (or EOF).
let end = lines.length
for (let i = start; i < lines.length; i++) {
  if (lines[i].startsWith("## ")) {
    end = i
    break
  }
}

const section = lines.slice(start, end).join("\n").trim()
process.stdout.write(section + "\n")
