import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { GUIDE, advance, findTarget, guideRequest, questionLanguage, type GuideAnswer, type GuideEvent } from '../../lib/guide/guide'
import { askGuide } from '../../lib/guide/api'
import { useGuideTargets } from './useGuideTargets'
import { GuideContext } from './guideContext'

// The "Need help?" guide (3.40 staff; the public site has the same files, 2.14). Holds the conversation: the
// question, the answer's numbered steps and the current one. It listens for each step's done_when (a click or
// typing on its target, or a page change) and moves on; "Next" covers steps with nothing to wait for.
// Same file names in innovation_portal_admin (JavaScript).

/**
 * app: "staff" or "public". menuSelector: where the person's menu links are (already capability-filtered).
 * onTalk: "Talk to a person" (public: opens live chat; staff: hands the question to the team). canTalk: show it.
 */
export function GuideProvider({ app, menuSelector, onTalk, canTalk = true, children }: {
  app: 'public' | 'staff'
  menuSelector?: string
  onTalk?: (question: string) => void
  canTalk?: boolean
  children: ReactNode
}) {
  const { lang, setLang, t } = useI18n()
  const location = useLocation()
  const collect = useGuideTargets(menuSelector)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState('idle') // idle | asking | answered | failed
  const [guide, setGuide] = useState<GuideAnswer | null>(null) // normalised answer
  const [current, setCurrent] = useState(0)
  const [ringOn, setRingOn] = useState(true)
  const [missing, setMissing] = useState(false) // the step's control did not appear within 2 seconds
  const [doneIds, setDoneIds] = useState<string[]>([])
  const asked = useRef(0)

  const steps = useMemo(() => guide?.steps ?? [], [guide])
  const step = steps[current] ?? null
  const finished = status === 'answered' && steps.length > 0 && current >= steps.length

  const fullPath = () => (typeof window !== 'undefined' ? window.location.pathname : location.pathname)
  const pageTitle = () => (typeof document !== 'undefined' ? document.querySelector('main h1, h1')?.textContent || document.title : '')

  const ask = useCallback(async (text: string) => {
    const q = (text ?? '').trim()
    if (!q) return
    const id = ++asked.current
    setQuestion(q)
    setStatus('asking')
    setRingOn(true)
    const { targets, menu } = collect()
    const body = guideRequest({
      app,
      route: fullPath(),
      pageTitle: pageTitle(),
      language: questionLanguage(q, lang),
      question: q,
      targets,
      menu,
      doneStepIds: doneIds,
    })
    try {
      const answer = await askGuide(body)
      if (asked.current !== id) return
      setGuide(answer)
      setCurrent(0)
      setStatus('answered')
    } catch {
      if (asked.current !== id) return
      setGuide(null)
      setStatus('failed')
    }
  }, [app, collect, doneIds, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = useCallback((to: number | ((c: number) => number)) => {
    setCurrent((c) => {
      const next = typeof to === 'function' ? to(c) : to
      if (next > c && steps[c]) setDoneIds((d) => (d.includes(steps[c].id) ? d : [...d, steps[c].id]))
      return next
    })
    setRingOn(true)
  }, [steps])

  const onEvent = useCallback((event: GuideEvent) => {
    if (status !== 'answered') return
    setCurrent((c) => {
      const next = advance(steps, c, event)
      if (next !== c) {
        if (steps[c]) setDoneIds((d) => (d.includes(steps[c].id) ? d : [...d, steps[c].id]))
        setRingOn(true)
      }
      return next
    })
  }, [status, steps])

  // done_when: clicks and typing on a target (capture, so a page that stops the event still counts).
  useEffect(() => {
    if (!open || status !== 'answered') return undefined
    const idOf = (e: Event) => (e.target as Element | null)?.closest?.('[data-guide]')?.getAttribute('data-guide')
    const onClick = (e: Event) => { const id = idOf(e); if (id) onEvent({ type: 'click', targetId: id }) }
    const onInput = (e: Event) => { const id = idOf(e); if (id) onEvent({ type: 'input', targetId: id }) }
    document.addEventListener('click', onClick, true)
    document.addEventListener('input', onInput, true)
    document.addEventListener('change', onInput, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('change', onInput, true)
    }
  }, [open, status, onEvent])

  // done_when: a page change.
  const firstPath = useRef(true)
  useEffect(() => {
    if (firstPath.current) { firstPath.current = false; return }
    onEvent({ type: 'route', path: fullPath() })
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // A route step whose page is already open is done.
  useEffect(() => {
    if (step?.doneWhen.type === 'route' && step.doneWhen.route) onEvent({ type: 'route', path: fullPath() })
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => setOpen(false), [])
  const reset = useCallback(() => {
    asked.current++
    setGuide(null)
    setStatus('idle')
    setQuestion('')
    setCurrent(0)
  }, [])

  // Escape ends the guide from anywhere.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  const value = useMemo(() => ({
    app, open, setOpen, close, reset, question, status, guide, steps, step, current, finished,
    ask, next: () => move((c: number) => c + 1), skip: () => move((c: number) => c + 1),
    ringOn, setRingOn, missing, setMissing, lang, setLang, t, canTalk, talk: () => { setOpen(false); onTalk?.(question) },
    findTarget: (id: string | null | undefined) => (typeof document === 'undefined' ? null : findTarget(document, id)),
    waitMs: GUIDE.waitForTargetMs,
  }), [app, open, close, reset, question, status, guide, steps, step, current, finished, ask, move, ringOn, missing, lang, setLang, t, canTalk, onTalk])

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
}
