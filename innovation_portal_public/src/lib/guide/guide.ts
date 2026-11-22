// The "Need help?" guide (2.14 public, 3.40 staff): the logic both apps share. Pure functions over plain data and
// the DOM, so they can be tested. Keep this file the same in both apps (admin: guide.js).
//
// Targets: any control the guide may point at carries data-guide="<area>.<action>". Only targets that are in the
// page now and visible are sent, and menus and buttons are already hidden by capability, so the guide can only
// ever point at something this person can use.

export const GUIDE = {
  waitForTargetMs: 2000, // a step's target may appear after navigation; wait this long, then offer Skip
  pollMs: 100,
  timeoutMs: 20000, // the API call; after this the panel says the guide can't answer right now
  phoneMax: 639, // under 640px the guide is a bottom sheet
  sessionKey: 'ceda.guide',
}

export type DoneType = 'click' | 'route' | 'input' | 'none'
export type TargetKind = 'button' | 'field' | 'menu' | 'tab' | 'link'
export interface GuideTarget { id: string; label: string; kind: TargetKind }
export interface MenuLink { path: string; label: string }
export interface GuideStep { id: string; text: string; targetId: string | null; route: string | null; doneWhen: { type: DoneType; targetId: string | null; route: string | null } }
export interface GuideAnswer { answer: string; language: 'en' | 'tn'; steps: GuideStep[]; sources: { type?: string; id?: string; title: string }[]; handoff: boolean }
export type GuideEvent = { type: 'click' | 'input'; targetId: string } | { type: 'route'; path: string }

export const DONE_TYPES: DoneType[] = ['click', 'route', 'input', 'none']
const KINDS: TargetKind[] = ['button', 'field', 'menu', 'tab', 'link']

/** Is this element on screen for the person: in the page, drawn, not hidden, not switched off. */
export function isVisible(el: Element | null): el is HTMLElement {
  if (!el || !el.isConnected) return false
  if (el.closest('[hidden],[aria-hidden="true"],[inert],[data-guide-ui]')) return false
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return false
  const view = el.ownerDocument?.defaultView
  for (let n: Element | null = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = view?.getComputedStyle(n)
    if (!s) break
    if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return false
    if (s.opacity !== '' && Number(s.opacity) === 0) return false
  }
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/** What sort of control it is, for the API: button, field, menu, tab or link. */
export function kindOf(el: Element): TargetKind {
  const set = el.getAttribute('data-guide-kind') as TargetKind | null
  if (set && KINDS.includes(set)) return set
  const role = el.getAttribute('role')
  if (role === 'tab') return 'tab'
  if (role === 'menuitem') return 'menu'
  const tag = el.tagName.toLowerCase()
  if (['input', 'textarea', 'select'].includes(tag) || role === 'textbox' || role === 'combobox' || el.querySelector?.('input,textarea,select')) return 'field'
  if (tag === 'a') return 'link'
  return 'button'
}

const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 80)

/**
 * The targets in the page right now, visible only, once each.
 * labelOf(id): the short label from i18n (guide.target.<id>), or empty to fall back to the control's own name.
 */
export function collectTargets(root: ParentNode, labelOf: (id: string) => string = () => ''): GuideTarget[] {
  const seen = new Set<string>()
  const out: GuideTarget[] = []
  for (const el of root.querySelectorAll('[data-guide]')) {
    const id = el.getAttribute('data-guide')
    if (!id || seen.has(id) || !isVisible(el)) continue
    seen.add(id)
    // A field's own label (data-guide-label) wins, so the guide never reads what the person typed.
    const label = clean(el.getAttribute('data-guide-label')) || clean(labelOf(id)) || clean(el.getAttribute('aria-label')) || (kindOf(el) === 'field' ? '' : clean(el.textContent)) || id
    out.push({ id, label, kind: kindOf(el) })
  }
  return out
}

/**
 * The menu links the person can see, from the capability-filtered menu (the guide can say "Go to Forms").
 * Links in a closed drawer still count: the person can open it.
 */
export function collectMenu(root: ParentNode, selector: string): MenuLink[] {
  const seen = new Set<string>()
  const out: MenuLink[] = []
  for (const a of root.querySelectorAll(selector)) {
    const path = a.getAttribute('href')
    if (!path || path.startsWith('http') || path.startsWith('#') || seen.has(path)) continue
    if (a.closest('[hidden],[data-guide-ui]')) continue
    const label = clean(a.getAttribute('aria-label')) || clean(a.textContent)
    if (!label) continue
    seen.add(path)
    out.push({ path, label })
  }
  return out
}

/** Find a target element by id (visible ones first). */
export function findTarget(root: ParentNode, id: string | null | undefined): HTMLElement | null {
  if (!id) return null
  const all = root.querySelectorAll(`[data-guide="${id.replace(/["\\]/g, '\\$&')}"]`)
  for (const el of all) if (isVisible(el)) return el
  return null
}

/** A target id the page could carry: "<area>.<action>", letters and digits. Anything else is ignored. */
export const TARGET_ID = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/

/**
 * The API's answer, made safe for the screen. A step may point at a control on the next page (the guide waits up
 * to 2 seconds for it there), so ids are kept when well formed; the ring itself is only ever drawn on a control
 * that is in the page and visible (findTarget), so nothing the person cannot use is ringed. Malformed ids are
 * dropped, unknown done_when types become "none" (a Next button), and every step has an id and text.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normaliseGuide(data: any): GuideAnswer {
  const ok = (id: unknown): string | null => (typeof id === 'string' && TARGET_ID.test(id) ? id : null)
  const raw = Array.isArray(data?.steps) ? data.steps : []
  const steps = raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => s && typeof s.text === 'string' && s.text.trim())
    .slice(0, 12)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any, i: number): GuideStep => {
      const target = ok(s.target_id)
      const dw = s.done_when ?? {}
      let type: DoneType = DONE_TYPES.includes(dw.type) ? dw.type : 'none'
      const doneTarget = ok(dw.target_id) ?? target
      if ((type === 'click' || type === 'input') && !doneTarget) type = 'none'
      return {
        id: String(s.id ?? `s${i + 1}`),
        text: s.text.trim(),
        targetId: target,
        route: typeof s.route === 'string' ? s.route : null,
        doneWhen: { type, targetId: type === 'click' || type === 'input' ? doneTarget : null, route: typeof dw.route === 'string' ? dw.route : null },
      }
    })
  return {
    answer: typeof data?.answer === 'string' ? data.answer.trim() : '',
    language: data?.language === 'tn' ? 'tn' : 'en',
    steps,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sources: Array.isArray(data?.sources) ? data.sources.filter((s: any) => s && s.title) : [],
    handoff: Boolean(data?.handoff_suggested),
  }
}

/** Does this event finish the step? event: { type: 'click' | 'input', targetId } or { type: 'route', path }. */
export function stepDone(step: GuideStep | null | undefined, event: GuideEvent | null | undefined): boolean {
  if (!step || !event) return false
  const dw = step.doneWhen
  if (dw.type !== event.type) return false
  if (event.type === 'click' || event.type === 'input') return event.targetId === dw.targetId
  if (event.type === 'route') return !dw.route || routeMatches(event.path, dw.route)
  return false
}

/** "/staff/workflows/new" matches "/staff/workflows/new" and "/staff/workflows/new/..." ; ":id" parts match anything. */
export function routeMatches(path: string | null | undefined, pattern: string | null | undefined): boolean {
  if (!path || !pattern) return false
  const p = path.split('?')[0].replace(/\/+$/, '').split('/')
  const q = pattern.split('?')[0].replace(/\/+$/, '').split('/')
  if (p.length < q.length) return false
  return q.every((part, i) => part.startsWith(':') || part === p[i])
}

/** The step after an event: the next one when the event finishes the current step, otherwise the same one. */
export function advance(steps: GuideStep[], current: number, event: GuideEvent): number {
  if (current < 0 || current >= steps.length) return current
  return stepDone(steps[current], event) ? current + 1 : current
}

/** Text written in Setswana gets Setswana back, whatever the page language. A light check: common Setswana words. */
const TN_WORDS = /\b(ke|ka|go|le|fa|eng|jang|gore|ya|wa|ga|mo|nna|rona|bona|kae|leng|dira|tlhoka|thusa|thuso|kopo|tsamaya)\b/gi
export function questionLanguage(question: string, pageLang: string): 'en' | 'tn' {
  const words = (question || '').toLowerCase().match(/[a-z']+/g) ?? []
  if (words.length === 0) return pageLang === 'tn' ? 'tn' : 'en'
  const tn = (question.match(TN_WORDS) ?? []).length
  return tn >= Math.max(1, Math.ceil(words.length / 3)) ? 'tn' : pageLang === 'tn' ? 'tn' : 'en'
}

/**
 * Which parts show. guide: the AI guide (status features.guide, and not switched off in public config);
 * chat: live chat (public site). The one "Need help?" button shows when either is on.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function guideAvailability({ status, config, chat = false }: { status: any; config: any; chat?: boolean }) {
  const guide = Boolean(status?.features?.guide) && config?.features?.ai_helper !== false
  return { guide, chat: Boolean(chat), button: guide || Boolean(chat) }
}

/** The request body for POST /api/assistant/guide/. */
export function guideRequest({ app, route, pageTitle, language, question, targets, menu, doneStepIds = [] }: { app: 'public' | 'staff'; route: string; pageTitle: string; language: string; question: string; targets: GuideTarget[]; menu: MenuLink[]; doneStepIds?: string[] }) {
  return {
    app,
    route,
    page_title: clean(pageTitle).slice(0, 120),
    language: language === 'tn' ? 'tn' : 'en',
    question: (question || '').trim().slice(0, 500),
    targets,
    menu,
    done_step_ids: doneStepIds,
  }
}
