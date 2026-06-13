#!/usr/bin/env node
import { mkdir, readFile, writeFile, access } from "node:fs/promises"
import { dirname, join, resolve, relative } from "node:path"
import { argv, cwd, exit, stdout } from "node:process"
import {
  libAuth, libAuthClient, libAuthServer, dbSchemaReExport,
  drizzleConfig, authRoute, signInPage, envExample, proxyTemplate,
  passkeyManagerPage,
} from "./templates.mjs"

function parseArgs(input) {
  const flags = {
    force: false,
    src: undefined, // tri-state: true / false / undefined (auto)
    google: true,
    passkey: true,
    proxy: true,
    skipEnv: false,
    cleanScripts: false,
    targetDir: cwd(),
  }
  const positional = []
  for (let i = 0; i < input.length; i++) {
    const a = input[i]
    if (a === "--force") flags.force = true
    else if (a === "--src") flags.src = true
    else if (a === "--no-src") flags.src = false
    else if (a === "--no-google") flags.google = false
    else if (a === "--no-passkey") flags.passkey = false
    else if (a === "--no-proxy") flags.proxy = false
    else if (a === "--skip-env") flags.skipEnv = true
    else if (a === "--clean-scripts") flags.cleanScripts = true
    else if (a === "--help" || a === "-h") return { help: true }
    else if (a.startsWith("--")) {
      stdout.write(`Unknown flag: ${a}\n`)
      exit(1)
    } else positional.push(a)
  }
  if (positional.length > 1) {
    stdout.write(`Too many positional args. Usage: next-starter init [target-dir]\n`)
    exit(1)
  }
  if (positional.length === 1) flags.targetDir = resolve(positional[0])
  return flags
}

function helpText() {
  return `next-starter init [target-dir]

  Scaffold the seven shim files that wire @naeemba/next-starter into a
  Next.js app.

  Options:
    --force          overwrite starter-owned files that already exist
                     (consumer-owned files — db/schema.ts, drizzle.config.ts
                     — are never overwritten; db/schema.ts gets the
                     re-export prepended if missing)
    --src            force writes under src/ (auto-detected by default)
    --no-src         force writes at project root
    --no-google      omit the google block from lib/auth.ts
    --no-passkey     omit the passkey block from lib/auth.ts
    --no-proxy       do not scaffold proxy.ts (Next 16 route gate)
    --skip-env       do not write .env.example
    --clean-scripts  delete obsolete package.json scripts (e.g. auth:generate)
    -h, --help       this message
`
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// create-next-app writes tsconfig.json with line comments (// ...) and
// occasionally trailing commas — valid JSONC, not strict JSON. Strip
// both before JSON.parse so detection doesn't silently fall through.
//
// Walk character-by-character tracking string context so we never strip
// `//` or `/* */` that appear inside string values, AND so the
// trailing-comma cleanup never fires inside a string value containing
// `,}` / `,]`. A regex-only post-pass (the previous implementation)
// clobbered legitimate `//-disabled` keys and string values with `,}`,
// silently failing JSON.parse and emitting the misleading
// `@/*`-paths-missing warning.
function parseJsonc(raw) {
  let out = ""
  let i = 0
  const n = raw.length
  while (i < n) {
    const c = raw[i]
    if (c === '"') {
      const start = i
      i++
      while (i < n) {
        if (raw[i] === "\\") { i += 2; continue }
        if (raw[i] === '"') { i++; break }
        i++
      }
      out += raw.slice(start, i)
      continue
    }
    if (c === "/" && raw[i + 1] === "/") {
      i += 2
      while (i < n && raw[i] !== "\n") i++
      continue
    }
    if (c === "/" && raw[i + 1] === "*") {
      i += 2
      while (i < n && !(raw[i] === "*" && raw[i + 1] === "/")) i++
      i += 2
      continue
    }
    if (c === ",") {
      // Drop a trailing comma if the next non-whitespace/non-comment char
      // is `}` or `]`. The lookahead skips the same syntactic noise the
      // outer loop would skip, so `, /* x */ ]` is treated like `,]`.
      let j = i + 1
      while (j < n) {
        const d = raw[j]
        if (d === " " || d === "\t" || d === "\n" || d === "\r") { j++; continue }
        if (d === "/" && raw[j + 1] === "/") {
          j += 2
          while (j < n && raw[j] !== "\n") j++
          continue
        }
        if (d === "/" && raw[j + 1] === "*") {
          j += 2
          while (j < n && !(raw[j] === "*" && raw[j + 1] === "/")) j++
          j += 2
          continue
        }
        break
      }
      if (raw[j] === "}" || raw[j] === "]") {
        i++
        continue
      }
    }
    out += c
    i++
  }
  return JSON.parse(out)
}

async function readTsconfigAt(path) {
  try {
    return parseJsonc(await readFile(path, "utf8"))
  } catch {
    return undefined
  }
}

// Walks a `tsconfig.json` chain via `extends` (relative paths only; bare
// specifiers like `@tsconfig/strictest` are skipped because resolving npm
// packages would need a full node module resolver and most monorepos use
// relative paths anyway). Cap at 5 levels to short-circuit accidental cycles.
async function readTsconfigChain(target) {
  const chain = []
  let path = join(target, "tsconfig.json")
  for (let i = 0; i < 5; i++) {
    let cfg = await readTsconfigAt(path)
    // Fallback: if extends pointed at "./tsconfig.base" (no suffix) and the
    // real file is `.jsonc` instead of `.json`, retry once before giving up.
    // TS docs treat `.json` as canonical so most chains hit the first read.
    if (!cfg && path.endsWith(".json")) {
      const alt = `${path.slice(0, -5)}.jsonc`
      cfg = await readTsconfigAt(alt)
      if (cfg) path = alt
    }
    if (!cfg) break
    chain.push(cfg)
    const ext = cfg.extends
    if (typeof ext !== "string" || !ext.startsWith(".")) break
    path = resolve(dirname(path), /\.jsonc?$/.test(ext) ? ext : `${ext}.json`)
  }
  return chain
}

async function detectSrcLayout(target) {
  if (await exists(join(target, "src", "app"))) return true
  if (await exists(join(target, "app"))) return false
  for (const cfg of await readTsconfigChain(target)) {
    const baseUrl = cfg?.compilerOptions?.baseUrl
    const atPath = cfg?.compilerOptions?.paths?.["@/*"]?.[0]
    if (typeof atPath !== "string") continue
    // Three shapes accepted: `./src/*` (create-next-app), `src/*` with
    // any `baseUrl` in {".", "./", undefined} (turborepo/nx), and anything
    // resolving under `<baseUrl>/src/*` for bases like `./packages/web`.
    if (atPath.startsWith("./src/")) return true
    const baseAllowsBareSrc = baseUrl === undefined || baseUrl === "." || baseUrl === "./"
    if (baseAllowsBareSrc && atPath.startsWith("src/")) return true
  }
  return false
}

async function hasAtAlias(target) {
  for (const cfg of await readTsconfigChain(target)) {
    if (cfg?.compilerOptions?.paths?.["@/*"]) return true
  }
  return false
}

// Detects an existing `db/index.ts` (or `src/db/index.ts`) that exports
// a named `db` symbol. When present, lib/auth.ts is generated with
// `import { db } from "@/db"` and `db` is wired into `createAuth({ db })`
// — so the consumer doesn't end up with two postgres-js pools to the
// same database (the starter's lazy proxy + their own client). When
// absent, fall back to the lazy proxy seeded from DATABASE_URL.
async function hasNamedDbExport(target, prefix) {
  const candidate = join(target, `${prefix}db/index.ts`)
  if (!(await exists(candidate))) return false
  try {
    const content = await readFile(candidate, "utf8")
    if (/\bexport\s+(const|let|var|function|async\s+function)\s+db\b/.test(content)) return true
    // Exclude inline-type-only re-exports: `export { type db }` and
    // `export { ... as db }` where `as db` is preceded by `type` (e.g.
    // `export { type Database as db }`). Both erase at runtime, so the
    // generated `import { db } from "@/db"` would resolve to undefined
    // and silently break the wired-db path (createAuth({ db }) would
    // crash inside better-auth or silently disable the wired-db code).
    // The `\bexport\s*\{` head already filters `export type { ... }`
    // form since `type` would have to sit between `export` and `{`.
    if (/\bexport\s*\{(?![^}]*\btype\s+db\b)(?![^}]*\btype\s+\w+\s+as\s+db\b)[^}]*\bdb\s*[,}]/.test(content)) return true
    if (/\bexport\s*\{(?![^}]*\btype\s+\w+\s+as\s+db\b)[^}]*\bas\s+db\s*[,}]/.test(content)) return true
    return false
  } catch {
    return false
  }
}

// The old README told consumers to add an `auth:generate` script that
// shelled out to `better-auth generate`. The starter now ships the schema
// directly from `@naeemba/next-starter/schema`, so any script that runs
// `better-auth generate` is dead code that produces a stale file the
// consumer then commits and chases. Detect any package.json scripts that
// invoke it and either warn or remove based on --clean-scripts.
async function detectObsoleteScripts(target) {
  const pkgPath = join(target, "package.json")
  if (!(await exists(pkgPath))) return []
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"))
    const scripts = pkg.scripts ?? {}
    const obsolete = []
    for (const [name, value] of Object.entries(scripts)) {
      if (typeof value !== "string") continue
      if (/\bbetter-auth\s+generate\b/.test(value)) {
        obsolete.push({ name, value, reason: "runs `better-auth generate` (schema now ships from @naeemba/next-starter/schema)" })
      }
    }
    return obsolete
  } catch {
    return []
  }
}

async function removeObsoleteScripts(target, obsolete) {
  const pkgPath = join(target, "package.json")
  const raw = await readFile(pkgPath, "utf8")
  const pkg = JSON.parse(raw)
  for (const { name } of obsolete) {
    if (pkg.scripts && name in pkg.scripts) delete pkg.scripts[name]
  }
  const trailingNewline = raw.endsWith("\n") ? "\n" : ""
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + trailingNewline, "utf8")
}

// Parse the comma-separated symbol list inside an `export { ... }` clause
// into a normalized set of local names (the part after `as` if present).
// Whitespace and stray commas are tolerated.
function parseSymbolList(raw) {
  const out = new Set()
  for (const part of raw.split(",")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    // Strip leading `type ` modifier and resolve `X as Y` to `Y`.
    const noType = trimmed.replace(/^type\s+/, "")
    const asMatch = noType.match(/^\S+\s+as\s+(\S+)$/)
    out.add(asMatch ? asMatch[1] : noType)
  }
  return out
}

function sameSymbolSet(a, b) {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

// File classification for write strategy:
// - "starter":       starter owns this. Skip if exists; overwrite with --force.
// - "schema-merge":  consumer-owned with a required re-export from
//                    @naeemba/next-starter/schema. If file exists and the
//                    re-export is already present AND its symbol set matches
//                    what the CLI wants to emit, leave it alone. If the
//                    symbol set diverges (e.g. consumer first ran with
//                    --no-passkey then re-ran with default --passkey),
//                    rewrite the re-export line in place — consumer tables
//                    untouched. If the re-export is missing entirely,
//                    prepend the line. If the file doesn't exist, scaffold
//                    the one-line shim.
//                    --force does NOT replace this file. Destroying the
//                    consumer's table definitions was the v0.4 footgun
//                    this classification exists to close.
// - "consumer-skip": consumer-owned. Never overwrite, even with --force.
//                    drizzle.config.ts often carries verbosity/casing/
//                    schemaFilter customizations the CLI can't reproduce.
async function writeFileSafe(kind, path, content, force, status) {
  await mkdir(dirname(path), { recursive: true })

  if (kind === "schema-merge") {
    if (await exists(path)) {
      const existing = await readFile(path, "utf8")
      // Detect a pre-existing re-export from @naeemba/next-starter/schema
      // and compare its symbol set against the one the CLI wants to emit.
      // A substring-only check leaves the consumer with a stale set when
      // they flip `--passkey` between runs: `lib/auth.ts` would carry the
      // passkey block while `db/schema.ts` is missing the `passkey`
      // re-export, and drizzle-kit fails with "Could not find table".
      const reExportRegex = /^[ \t]*export\s*\{([^}]+)\}\s*from\s*["']@naeemba\/next-starter\/schema["'][ \t]*;?[ \t]*\r?\n?/m
      const existingMatch = existing.match(reExportRegex)
      if (existingMatch) {
        const existingSymbols = parseSymbolList(existingMatch[1])
        const expectedSymbols = parseSymbolList(content.match(reExportRegex)?.[1] ?? "")
        if (sameSymbolSet(existingSymbols, expectedSymbols)) {
          status.skipped.push({ path, note: "re-export already present" })
          return
        }
        // Symbol set diverges — replace just the re-export line, keep the
        // rest of the consumer's file intact.
        const reExportLine = content.match(reExportRegex)?.[0] ?? content
        const merged = existing.replace(reExportRegex, reExportLine)
        await writeFile(path, merged, "utf8")
        status.merged.push({ path, note: "rewrote re-export line (symbol set changed)" })
        return
      }
      const reExport = content
      const sep = existing.startsWith("\n") ? "" : "\n"
      const merged = `${reExport}${sep}${existing}`
      await writeFile(path, merged, "utf8")
      status.merged.push({ path, note: undefined })
      return
    }
    // No existing file — scaffold the one-line shim.
    await writeFile(path, content, "utf8")
    status.created.push(path)
    return
  }

  if (kind === "consumer-skip") {
    if (await exists(path)) {
      status.preserved.push(path)
      return
    }
    await writeFile(path, content, "utf8")
    status.created.push(path)
    return
  }

  // kind === "starter"
  if (await exists(path)) {
    if (!force) {
      status.skipped.push({ path, note: undefined })
      return
    }
    status.overwritten.push(path)
  } else {
    status.created.push(path)
  }
  await writeFile(path, content, "utf8")
}

async function run() {
  // argv[2] is the subcommand. Handle `--help` / `-h` here BEFORE the
  // `init` check so `next-starter --help` exits 0 (shell convention) —
  // otherwise it falls through to the unknown-subcommand path and exits 1,
  // breaking `next-starter --help && echo ok`.
  const subcommand = argv[2]
  if (subcommand === "--help" || subcommand === "-h" || subcommand === undefined) {
    stdout.write(helpText())
    return
  }
  if (subcommand !== "init") {
    stdout.write(`Unknown subcommand: ${subcommand}\n\n`)
    stdout.write(helpText())
    exit(1)
  }
  const args = parseArgs(argv.slice(3)) // skip node, cli.mjs, init
  if (args.help) {
    stdout.write(helpText())
    return
  }

  const target = args.targetDir
  await mkdir(target, { recursive: true })

  const useSrc = args.src ?? (await detectSrcLayout(target))
  const prefix = useSrc ? "src/" : ""
  const useExistingDb = await hasNamedDbExport(target, prefix)

  const status = {
    created: [],
    overwritten: [],
    skipped: [],     // entries: { path, note? }
    merged: [],     // entries: { path, note? }
    preserved: [],
  }

  // proxy.ts lives at project root regardless of src/ layout — Next 16
  // looks there, not under src/. Skip when:
  //   - --no-proxy was passed (consumer opted out)
  //   - an existing middleware.ts is present (pre-Next-16 file the consumer
  //     hasn't migrated yet; landing proxy.ts next to it would create two
  //     competing gates)
  //   - a src/proxy.ts or src/middleware.ts is present (uncommon but real
  //     when the consumer overrides Next's lookup via a turbopack rewrite)
  // An existing proxy.ts at the root is handled by the consumer-skip
  // classification below, which prints the standard "consumer-owned —
  // not overwritten" line.
  let proxySkipReason = null
  if (args.proxy) {
    const competing = [
      { path: join(target, "middleware.ts"),     kind: "middleware" },
      { path: join(target, "src/middleware.ts"), kind: "middleware" },
      { path: join(target, "src/proxy.ts"),      kind: "proxy"      },
    ]
    for (const { path, kind } of competing) {
      if (await exists(path)) {
        proxySkipReason = { kind, path: relative(target, path) }
        break
      }
    }
  }

  const files = [
    ["starter",       join(target, `${prefix}lib/auth.ts`),                       libAuth({ google: args.google, passkey: args.passkey, db: useExistingDb })],
    ["starter",       join(target, `${prefix}lib/auth-client.ts`),                libAuthClient({ passkey: args.passkey })],
    ["starter",       join(target, `${prefix}lib/auth-server.ts`),                libAuthServer],
    ["schema-merge",  join(target, `${prefix}db/schema.ts`),                      dbSchemaReExport({ passkey: args.passkey })],
    ["consumer-skip", join(target, `drizzle.config.ts`),                          drizzleConfig({ src: useSrc })],
    ["starter",       join(target, `${prefix}app/api/auth/[...all]/route.ts`),    authRoute],
    ["starter",       join(target, `${prefix}app/sign-in/page.tsx`),              signInPage({ google: args.google, passkey: args.passkey })],
  ]
  if (args.proxy && !proxySkipReason) files.push(["consumer-skip", join(target, "proxy.ts"), proxyTemplate])
  // Passkey-management UI — only when passkey is enabled, otherwise the
  // generated page would import a feature the consumer opted out of and
  // 404 at runtime (the passkey-manager route exists, but addPasskey()
  // would hit a server with no passkey plugin loaded).
  if (args.passkey) files.push(["starter", join(target, `${prefix}app/account/passkeys/page.tsx`), passkeyManagerPage])
  if (!args.skipEnv) files.push(["starter", join(target, ".env.example"), envExample])

  for (const [kind, path, content] of files) {
    await writeFileSafe(kind, path, content, args.force, status)
  }

  const rel = (p) => relative(target, p) || "."
  for (const p of status.created)     stdout.write(`  + ${rel(p)}\n`)
  for (const p of status.overwritten) stdout.write(`  ! ${rel(p)}  (overwritten)\n`)
  for (const entry of status.merged) {
    const note = entry.note ?? "prepended @naeemba/next-starter/schema re-export"
    stdout.write(`  ~ ${rel(entry.path)}  (merged: ${note})\n`)
  }
  for (const p of status.preserved)   stdout.write(`  = ${rel(p)}  (exists, consumer-owned — not overwritten)\n`)
  for (const entry of status.skipped) {
    const note = entry.note ? ` (${entry.note})` : "  (exists, use --force to overwrite)"
    stdout.write(`  = ${rel(entry.path)}${note}\n`)
  }

  if (proxySkipReason) {
    stdout.write(
      `  = proxy.ts  (skipped — existing ${proxySkipReason.kind}.ts found at ${proxySkipReason.path})\n`,
    )
  }

  if (useExistingDb) {
    stdout.write(
      `\n  i Detected ${prefix}db/index.ts exporting \`db\` — lib/auth.ts wires it into\n` +
        `    createAuth({ db }) so you don't end up with two postgres pools.\n`,
    )
  }

  // Warn if the generated `@/lib/...` imports won't resolve. We don't patch
  // tsconfig.json automatically — that's the consumer's surface — but a
  // silent failure at first `tsc` / `next dev` is a worse DX than a hint here.
  if (!(await hasAtAlias(target))) {
    stdout.write(
      `\n  ! tsconfig.json has no \`paths: { "@/*": [...] }\` entry. The generated\n` +
        `    route.ts and page.tsx use \`@/lib/...\` imports — add the alias to\n` +
        `    compilerOptions.paths to make them resolve.\n`,
    )
  }

  const obsolete = await detectObsoleteScripts(target)
  if (obsolete.length > 0) {
    if (args.cleanScripts) {
      await removeObsoleteScripts(target, obsolete)
      stdout.write(`\n  ~ package.json: removed obsolete script${obsolete.length > 1 ? "s" : ""}\n`)
      for (const { name, reason } of obsolete) {
        stdout.write(`      - ${name}  (${reason})\n`)
      }
    } else {
      stdout.write(`\n  ! Found obsolete package.json script${obsolete.length > 1 ? "s" : ""} (re-run with --clean-scripts to remove):\n`)
      for (const { name, reason } of obsolete) {
        stdout.write(`      - ${name}  (${reason})\n`)
      }
    }
  }

  const passkeyHint = args.passkey
    ? `       npm install @better-auth/passkey                            # passkey support (the --passkey default)\n`
    : ""
  stdout.write(`
Next steps:
  1. Install only the peers you actually use:
       npm install @naeemba/next-starter@latest postgres            # Drizzle/Postgres
       npm install @react-email/components @react-email/render      # default magic-link template
       npm install resend                                           # production email transport
${passkeyHint}     (All optional — install just what your config touches.)
  2. Fill in .env.example -> .env (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL)
  3. Run your drizzle migrations against the better-auth schema
  4. npm run dev — visit /sign-in

See https://github.com/naeemba/next-typescript-starter#readme for the full docs.
`)
}

run().catch((err) => {
  stdout.write(`next-starter init failed: ${err.message}\n`)
  exit(1)
})
