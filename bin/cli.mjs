#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile, access } from "node:fs/promises"
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
function parseJsonc(raw) {
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")     // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1")   // line comments (avoid URLs in strings)
    .replace(/,(\s*[}\]])/g, "$1")        // trailing commas
  return JSON.parse(stripped)
}

async function readTsconfig(target) {
  try {
    return parseJsonc(await readFile(join(target, "tsconfig.json"), "utf8"))
  } catch {
    return undefined
  }
}

async function detectSrcLayout(target) {
  if (await exists(join(target, "src", "app"))) return true
  if (await exists(join(target, "app"))) return false
  const tsconfig = await readTsconfig(target)
  if (tsconfig) {
    const baseUrl = tsconfig?.compilerOptions?.baseUrl
    const paths = tsconfig?.compilerOptions?.paths ?? {}
    const atPath = paths["@/*"]?.[0] ?? ""
    if (atPath.startsWith("./src/") || (baseUrl === "./" && atPath.startsWith("src/"))) return true
  }
  return false
}

async function hasAtAlias(target) {
  const tsconfig = await readTsconfig(target)
  return Boolean(tsconfig?.compilerOptions?.paths?.["@/*"])
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
  const args = parseArgs(argv.slice(3)) // skip node, cli.mjs, init
  if (args.help) {
    stdout.write(helpText())
    return
  }
  if (argv[2] !== "init") {
    stdout.write(helpText())
    exit(1)
  }

  const target = args.targetDir
  await mkdir(target, { recursive: true })

  const useSrc = args.src ?? (await detectSrcLayout(target))
  const prefix = useSrc ? "src/" : ""

  const status = { created: [], overwritten: [], skipped: [] }

  const files = [
    [join(target, `${prefix}lib/auth.ts`),                                libAuth({ google: args.google, passkey: args.passkey })],
    [join(target, `${prefix}lib/auth-client.ts`),                         libAuthClient],
    [join(target, `${prefix}lib/auth-server.ts`),                         libAuthServer],
    [join(target, `${prefix}db/schema.ts`),                               dbSchema],
    [join(target, `drizzle.config.ts`),                                    drizzleConfig],
    [join(target, `${prefix}app/api/auth/[...all]/route.ts`),              authRoute],
    [join(target, `${prefix}app/sign-in/page.tsx`),                        signInPage],
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

  stdout.write(`
Next steps:
  1. Install only the peers you actually use:
       npm install @naeemba/next-starter@latest postgres            # Drizzle/Postgres
       npm install @react-email/components @react-email/render      # default magic-link template
       npm install resend                                           # production email transport
     (All four are optional — install just what your config touches.)
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
