#!/usr/bin/env node
// Root package.json intentionally duplicates a couple of server/ dependencies
// so Vercel's root-level `npm install` can resolve them when bundling
// api/index.ts (see CLAUDE.md, "On Vercel"). That duplication only stays
// correct if both copies are bumped together — this fails CI when they drift,
// since a stale root copy would ship silently (Vercel's build wouldn't error,
// it would just bundle the old version).

import { readFileSync } from 'node:fs'

const SHARED_DEPS = ['@anthropic-ai/sdk', 'pg']

function readDeps(path) {
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  return pkg.dependencies ?? {}
}

const root = readDeps(new URL('../package.json', import.meta.url))
const server = readDeps(new URL('../server/package.json', import.meta.url))

let failed = false
for (const dep of SHARED_DEPS) {
  const rootVersion = root[dep]
  const serverVersion = server[dep]
  if (!rootVersion || !serverVersion) {
    console.error(`✗ ${dep}: expected in both package.json (root: ${rootVersion ?? 'missing'}, server: ${serverVersion ?? 'missing'})`)
    failed = true
    continue
  }
  if (rootVersion !== serverVersion) {
    console.error(`✗ ${dep}: root has ${rootVersion}, server has ${serverVersion} — bump both together`)
    failed = true
    continue
  }
  console.log(`✓ ${dep}: ${rootVersion} (matches)`)
}

if (failed) {
  console.error('\nRoot package.json and server/package.json disagree on a dependency Vercel needs both copies of.')
  process.exit(1)
}
