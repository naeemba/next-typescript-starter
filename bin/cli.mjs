#!/usr/bin/env node
import { mkdir, readFile, writeFile, access } from "node:fs/promises"
import { dirname, join, resolve, relative } from "node:path"
import { argv, cwd, exit, stdout } from "node:process"
import {
  libAuth, libAuthClient, libAuthServer, dbSchema, drizzleConfig,
  authRoute, signInPage, envExample,
} from "./templates.mjs"

function parseArgs(input) {
  const flags = {
    force: false,
    src: undefined, // tri-state: true / false / undefined (auto)
    google: true,
    passkey: true,
    skipEnv: false,
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
    else if (a === "--skip-env") flags.skipEnv = true
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
    --force        overwrite files that already exist
    --src          force writes under src/ (auto-detected by default)
    --no-src       force writes at project root
    --no-google    omit the google block from lib/auth.ts
    --no-passkey   omit the passkey block from lib/auth.ts
    --skip-env     do not write .env.example
    -h, --help     this message
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

async function writeFileSafe(path, content, force, status) {
  await mkdir(dirname(path), { recursive: true })
  if (await exists(path)) {
    if (!force) {
      status.skipped.push(path)
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

  const status = { created: [], overwritten: [], skipped: [] }

  const files = [
    [join(target, `${prefix}lib/auth.ts`),                                libAuth({ google: args.google, passkey: args.passkey })],
    [join(target, `${prefix}lib/auth-client.ts`),                         libAuthClient({ passkey: args.passkey })],
    [join(target, `${prefix}lib/auth-server.ts`),                         libAuthServer],
    [join(target, `${prefix}db/schema.ts`),                               dbSchema({ passkey: args.passkey })],
    [join(target, `drizzle.config.ts`),                                    drizzleConfig],
    [join(target, `${prefix}app/api/auth/[...all]/route.ts`),              authRoute],
    [join(target, `${prefix}app/sign-in/page.tsx`),                        signInPage({ google: args.google, passkey: args.passkey })],
  ]
  if (!args.skipEnv) files.push([join(target, ".env.example"), envExample])

  for (const [path, content] of files) {
    await writeFileSafe(path, content, args.force, status)
  }

  const rel = (p) => relative(target, p) || "."
  for (const p of status.created)     stdout.write(`  + ${rel(p)}\n`)
  for (const p of status.overwritten) stdout.write(`  ! ${rel(p)}  (overwritten)\n`)
  for (const p of status.skipped)     stdout.write(`  = ${rel(p)}  (exists, use --force to overwrite)\n`)

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
