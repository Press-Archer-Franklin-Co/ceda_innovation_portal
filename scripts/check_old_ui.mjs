#!/usr/bin/env node
// Old-UI guard (R0). Fails when a page or component outside components/ui/ in either frontend:
//   - renders a <table> itself instead of DataTable / ServerTable,
//   - builds its own modal (role="dialog", "fixed inset-0", or a *Modal / *Dialog component), except ImageCropModal,
//   - calls window.confirm(, window.alert( or alert(,
//   - uses a raw hex colour (#abc, #aabbcc, #aabbccdd) in JS/JSX/TS/TSX/CSS.
// Pages still in the old look are listed in scripts/old_ui_pages.txt. They are not checked yet; each rebuild PR
// deletes its lines. The list may only shrink: the guard fails if it has a line that main does not have.
//
// Usage: node scripts/check_old_ui.mjs [base-ref]   (base-ref default origin/main; "none" skips the list check)

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const base = process.argv[2] ?? 'origin/main'
const LIST = 'scripts/old_ui_pages.txt'
const APPS = { admin: 'innovation_portal_admin', public: 'innovation_portal_public' }
const EXT = /\.(jsx?|tsx?|css)$/
const SKIP = /(\.test\.|\.spec\.|\/__tests__\/)/

const readList = (text) => text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
const listed = readList(readFileSync(join(root, LIST), 'utf8'))
// "admin/src/pages/x.jsx" -> "innovation_portal_admin/src/pages/x.jsx"
const toRepoPath = (p) => p.replace(/^(admin|public)\//, (_, app) => `${APPS[app]}/`)
const exempt = new Set(listed.map(toRepoPath))

// Reviewed exceptions: file, rule (start of its name) and why. Keep this short.
const ALLOW = [
  { file: 'innovation_portal_public/src/components/layout/Navbar.tsx', rule: 'own dialog', why: 'the phone menu drawer from Figma 11:694 (U7 owns the header)' },
]

const RULES = [
  { name: 'renders <table> (use DataTable or ServerTable)', test: (line, file) => !file.endsWith('.css') && /<table[\s>]/.test(line) },
  { name: 'own dialog (use Modal or ConfirmDialog)', test: (line, file) => !file.endsWith('.css') && (/role=["']dialog["']/.test(line) || /\bfixed inset-0\b/.test(line)) },
  {
    name: 'own *Modal / *Dialog component (use Modal or ConfirmDialog)',
    // A *Dialog that wraps the shared Modal or ConfirmDialog is fine.
    test: (line, file, text) =>
      !file.endsWith('.css') &&
      /\b(?:function|const|class)\s+(?!ImageCropModal\b)[A-Z]\w*(?:Modal|Dialog)\b/.test(line) &&
      !/from ['"][^'"]*\/(?:ui\/)?(?:Modal|ConfirmDialog)['"]/.test(text),
  },
  { name: 'window.confirm / alert (use useConfirm or a toast)', test: (line, file) => !file.endsWith('.css') && /(?:\bwindow\.(?:confirm|alert)\(|(?<![\w.])alert\()/.test(line) },
  { name: 'raw hex colour (use a token)', test: (line) => /(?<![\w&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/.test(line) },
]

function walk(dir, out) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXT.test(name) && !SKIP.test(full)) out.push(full)
  }
  return out
}

const problems = []
for (const app of Object.values(APPS)) {
  const files = [...walk(join(root, app, 'src/pages'), []), ...walk(join(root, app, 'src/components'), [])]
  for (const full of files) {
    const rel = relative(root, full).split(sep).join('/')
    if (rel.includes('/src/components/ui/')) continue
    if (exempt.has(rel)) continue
    const text = readFileSync(full, 'utf8')
    text.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '')
      for (const rule of RULES) {
        if (!rule.test(code, rel, text)) continue
        if (ALLOW.some((a) => a.file === rel && rule.name.startsWith(a.rule))) continue
        problems.push(`${rel}:${i + 1}: ${rule.name}\n    ${line.trim().slice(0, 140)}`)
      }
    })
  }
}

// The list may only shrink.
let grew = []
if (base !== 'none') {
  try {
    const onMain = new Set(readList(execSync(`git show ${base}:${LIST}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })))
    grew = listed.filter((l) => !onMain.has(l))
  } catch {
    // The list is not on main yet (the PR that adds the guard): nothing to compare with.
  }
}

if (grew.length) {
  console.log(`${LIST} may only shrink. These lines are not on ${base}:`)
  for (const l of grew) console.log(`  ${l}`)
}
if (problems.length) {
  console.log(`Old UI found in ${problems.length} place(s). Rebuild with the shared components, or (only for a page still in the old look) see ${LIST}:`)
  for (const p of problems) console.log(p)
}
if (grew.length || problems.length) process.exit(1)
console.log(`Old-UI guard: no problems. ${listed.length} page(s) still to rebuild in ${LIST}.`)
