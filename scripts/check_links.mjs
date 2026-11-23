#!/usr/bin/env node
// Every link goes somewhere. Not for CI: run it by hand against a test stack that has test accounts switched on.
// It signs in with each test account the way the sign-in page's picker does, opens every menu page in both apps,
// follows internal links, cards and whole-row links, and lists any that land on the not-found page, do nothing
// when clicked, or open a blank page. It only reads: every other write request is blocked in the browser.
//
//   PUBLIC_URL=http://localhost:5173 STAFF_URL=http://localhost:5174/staff node scripts/check_links.mjs
//   Optional: MAX_PAGES=60 (per person, per app), ROLES=innovator,judge, REPORT=links-report.json
//   Needs the playwright package (run it in the mcr.microsoft.com/playwright image).

import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const PUBLIC_URL = (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const STAFF_URL = (process.env.STAFF_URL ?? 'http://localhost:5174/staff').replace(/\/$/, '')
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 60)
const SAME_ROUTE_MAX = 2 // /ideas/<id>: two examples of each route shape are enough
const ROLES = (process.env.ROLES ?? '').split(',').filter(Boolean)
const SKIP = /(logout|sign-?out|\/download\/?$|\/media\/|\.(pdf|png|jpe?g|docx?|xlsx?|csv|zip)$)/i
const NOT_FOUND = /We could not find that page|Ga re a bona tsebe|Page not found/i
const CRASH = /This page could not load|Something went wrong/i

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shape = (path) => path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:n')
const clean = (path) => path.replace(/\/+$/, '') || '/'

async function accounts() {
  const res = await fetch(`${PUBLIC_URL}/api/platform/public-config/`)
  const body = await res.json()
  const list = (body.data ?? body).demo_logins?.accounts ?? []
  if (!list.length) throw new Error('No test accounts: switch on INNOVATION_PORTAL_DEMO_LOGINS and the demo_logins feature.')
  const byRole = new Map()
  for (const a of list) {
    const role = a.role ?? a.role_code ?? a.roles?.[0] ?? 'account'
    if (!byRole.has(role)) byRole.set(role, a)
  }
  return [...byRole].filter(([role]) => !ROLES.length || ROLES.includes(role))
}

async function signIn(account) {
  for (let i = 0; i < 4; i += 1) {
    const res = await fetch(`${PUBLIC_URL}/api/auth/demo-login/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: account.id }) })
    if (res.status === 429) { await sleep(20000); continue }
    if (!res.ok) throw new Error(`Test account sign-in failed: ${res.status}`)
    const body = await res.json()
    const data = body.data ?? body
    const tokens = data.tokens ?? data
    return { access: tokens.access, refresh: tokens.refresh }
  }
  throw new Error('Test account sign-in is being throttled')
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForFunction(() => !document.querySelector('.ceda-loader, [aria-busy="true"], [role="status"][aria-label*="oading"]'), null, { timeout: 8000 }).catch(() => {})
  await sleep(250)
}

const readPage = (page) => page.evaluate(() => {
  const main = document.querySelector('main')
  const links = [...document.querySelectorAll('a[href]')]
    .filter((a) => !a.closest('[data-guide-ui]'))
    .map((a) => {
      const r = a.getBoundingClientRect()
      return { href: a.getAttribute('href'), abs: a.href, target: a.target, text: (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50), shown: r.width > 0 && r.height > 0 }
    })
  const dead = [...document.querySelectorAll('a')]
    .filter((a) => { const h = a.getAttribute('href'); return !h || h === '#' || /^javascript:/i.test(h) })
    .map((a) => (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 50))
  return { text: document.body.innerText.slice(0, 4000), mainLength: (main?.innerText ?? '').trim().length + (main?.querySelectorAll('img,svg,iframe,canvas,video').length ?? 0), links, dead }
})

async function crawl(browser, role, tokens, app, base) {
  const origin = new URL(base).origin
  const prefix = new URL(base).pathname.replace(/\/$/, '')
  // Reduced motion: the checker presses links, it does not wait for the menu's opening motion.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  await context.addInitScript(([access, refresh]) => {
    localStorage.setItem('ceda_access', access)
    localStorage.setItem('ceda_refresh', refresh)
    sessionStorage.setItem('ceda.intro.seen', '1')
  }, [tokens.access, tokens.refresh])
  // Read only: nothing this script does can change data.
  await context.route('**/api/**', (route) => {
    const req = route.request()
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || /\/auth\/(token\/)?refresh/.test(req.url())) return route.continue()
    return route.fulfill({ status: 204, body: '' })
  })
  const page = await context.newPage()
  const found = []
  const queue = [{ path: `${prefix}/`, from: '(start)', text: 'Home' }]
  const seen = new Set()
  const shapes = new Map()
  const clicked = new Set()
  let pages = 0
  const report = (kind, item) => found.push({ app, role, kind, link: item.path, text: item.text, from: item.from })

  while (queue.length && pages < MAX_PAGES) {
    const item = queue.shift()
    const key = clean(item.path)
    if (seen.has(key)) continue
    const s = shape(key)
    if ((shapes.get(s) ?? 0) >= SAME_ROUTE_MAX) continue
    seen.add(key)
    shapes.set(s, (shapes.get(s) ?? 0) + 1)
    pages += 1
    const res = await page.goto(origin + item.path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
    if (!res) { report('did not load', item); continue }
    await settle(page)
    const now = await readPage(page)
    if (NOT_FOUND.test(now.text)) { report('not found', item); continue }
    if (CRASH.test(now.text) && now.mainLength < 200) { report('page error', item); continue }
    if (now.mainLength === 0) report('blank page', item) // still walks the menu and footer of a blank page
    for (const text of now.dead) report('link with no address', { path: key, text, from: key })

    for (const link of now.links) {
      let url
      try { url = new URL(link.abs) } catch { continue }
      if (url.origin !== origin || !url.pathname.startsWith(prefix) || SKIP.test(url.pathname)) continue
      const path = clean(url.pathname) + url.search
      if (!seen.has(clean(path))) queue.push({ path, from: key, text: link.text })
      // Press each address once, for real: a link that is covered or does nothing shows up here.
      if (clicked.has(path) || !link.shown || link.target === '_blank' || url.pathname === new URL(page.url()).pathname) continue
      clicked.add(path)
      const target = page.locator(`a[href="${link.href.replace(/"/g, '\\"')}"]:visible`).first()
      const before = page.url()
      try {
        await target.click({ timeout: 4000 })
        await page.waitForURL((u) => u.href !== before, { timeout: 2500 })
      } catch {
        if (page.url() === before && !(await page.locator('[role="dialog"]').count())) report('nothing happens on click', { path, text: link.text, from: key })
      }
      if (page.url() !== before) {
        await page.goto(before, { waitUntil: 'domcontentloaded' }).catch(() => {})
        await settle(page)
      }
    }
  }
  await context.close()
  return { pages, links: clicked.size, found }
}

const browser = await chromium.launch()
const totals = []
const problems = []
for (const [role, account] of await accounts()) {
  for (const [app, base] of [['public', PUBLIC_URL], ['staff', STAFF_URL]]) {
    if (app === 'staff' && role === 'innovator') continue // innovators have no staff console
    const tokens = await signIn(account)
    const result = await crawl(browser, role, tokens, app, base)
    totals.push({ app, role, pages: result.pages, links: result.links, problems: result.found.length })
    problems.push(...result.found)
    console.log(`${app} as ${role}: ${result.pages} pages, ${result.links} links pressed, ${result.found.length} problem(s)`)
  }
}
await browser.close()

const unique = [...new Map(problems.map((p) => [`${p.app}|${p.kind}|${shape(p.link)}`, p])).values()]
console.log(`\nLink check: ${totals.reduce((n, t) => n + t.pages, 0)} pages, ${totals.reduce((n, t) => n + t.links, 0)} links pressed, ${unique.length} problem(s).`)
for (const p of unique) console.log(`- [${p.app}, ${p.role}] ${p.kind}: ${p.link} ("${p.text}") from ${p.from}`)
if (process.env.REPORT) writeFileSync(process.env.REPORT, JSON.stringify({ totals, problems: unique }, null, 1))
process.exit(unique.length ? 1 : 0)
