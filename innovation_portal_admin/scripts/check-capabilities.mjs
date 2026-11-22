#!/usr/bin/env node
// S1 parity check (ceda-security). Reads the API capability map and both frontends and fails when:
//  1. a frontend asks for a capability the API does not define (the item could never show), or
//  2. the API defines a capability no frontend asks for and it is not listed in NOT_IN_UI below
//     (the console would hide something the API allows), or
//  3. a frontend condition tests role names instead of capabilities.
// Run: node scripts/check-capabilities.mjs (also part of `npm test`).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const MAP = join(repo, 'innovation_portal_api', 'apps', 'core', 'capabilities.py')
const FRONTENDS = ['innovation_portal_admin/src', 'innovation_portal_public/src']

// Capabilities the API defines that no screen asks for yet, each with the reason. Keep this short.
const NOT_IN_UI = {
  'channels.manage': 'C2 screens come in feat/c2-journey-builder; remove this line there',
  'conversations.reply': 'C1 Inbox screens come in feat/c1-inbox-screens; remove this line there',
}

// Role-name tests that are allowed: auth internals and display-only role pickers.
const ROLE_TEST_ALLOWED = [
  'innovation_portal_admin/src/lib/auth/',
  'innovation_portal_public/src/lib/roles.ts',
]
const ROLE_TEST = /roles\.(includes|some)\(|isAdminOrManager|isInnovationOfficer|\brole\s*===\s*['"](administrator|admin|innovation_officer|innovation_manager)['"]/

function definedCapabilities() {
  const src = readFileSync(MAP, 'utf8')
  const start = src.indexOf('CAPABILITIES')
  const body = src.slice(start, src.indexOf('\n}', start))
  return new Set([...body.matchAll(/^\s*"([a-z_]+\.[a-z_]+)"\s*:/gm)].map((m) => m[1]))
}

// Blank out comments but keep the line numbers, so notes about capabilities do not count as asking.
function withoutComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[ \t])\/\/.*$/gm, blank)
}

function files(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

// can('x'), canAny([...]), capability: 'x', anyOf: [...], need="x", need={[...]}, need={'x'}
const ASKS = [
  /\bcan\(\s*(['"][^'"]+['"])/g,
  /\bcanAny\(\s*(\[[^\]]*\])/g,
  /\bcapability:\s*(['"][^'"]+['"])/g,
  /\banyOf:\s*(\[[^\]]*\])/g,
  /\bneed=(["'][^"']+["']|\{\s*\[[^\]]*\]\s*\}|\{\s*['"][^'"]+['"]\s*\})/g,
]

const defined = definedCapabilities()
if (defined.size === 0) {
  console.error(`check-capabilities: no capabilities found in ${relative(repo, MAP)}`)
  process.exit(1)
}

const asked = new Map() // capability -> [file:line]
const roleTests = []
for (const root of FRONTENDS) {
  for (const file of files(join(repo, root))) {
    const rel = relative(repo, file)
    const src = withoutComments(readFileSync(file, 'utf8'))
    for (const re of ASKS) {
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split('\n').length
        for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
          if (!asked.has(q[1])) asked.set(q[1], [])
          asked.get(q[1]).push(`${rel}:${line}`)
        }
      }
    }
    if (!ROLE_TEST_ALLOWED.some((a) => rel.startsWith(a))) {
      src.split('\n').forEach((text, i) => {
        if (ROLE_TEST.test(text)) roleTests.push(`${rel}:${i + 1}: ${text.trim()}`)
      })
    }
  }
}

const problems = []
for (const [cap, where] of asked) {
  if (!defined.has(cap)) problems.push(`Frontend asks for "${cap}", which the API does not define (${where.join(', ')})`)
}
for (const cap of defined) {
  if (!asked.has(cap) && !NOT_IN_UI[cap]) problems.push(`The API defines "${cap}" but no screen asks for it. Use it, or add it to NOT_IN_UI with a reason`)
  if (asked.has(cap) && NOT_IN_UI[cap]) problems.push(`"${cap}" is used now (${asked.get(cap)[0]}); remove it from NOT_IN_UI`)
}
for (const cap of Object.keys(NOT_IN_UI)) {
  if (!defined.has(cap)) problems.push(`NOT_IN_UI lists "${cap}", which the API does not define`)
}
for (const t of roleTests) problems.push(`Role-name test in a frontend condition (ask for a capability): ${t}`)

if (problems.length) {
  console.error(`check-capabilities: ${problems.length} problem(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`check-capabilities: ${defined.size} capabilities in the API, ${asked.size} asked for by the frontends, all in step`)
