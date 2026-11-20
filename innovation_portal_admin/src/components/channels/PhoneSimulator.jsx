import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, Send, Phone, List as ListIcon, UserCheck, UserPlus } from 'lucide-react'
import Button from '../ui/Button'
import Tabs from '../ui/Tabs'
import { InputControl } from '../ui/Input'
import { useSimulate } from '../../lib/queries/channels'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'

/**
 * Runs a journey for real through POST /api/channels/simulate/ and shows what the phone
 * would show. Works with no provider connected. Reports the current step through
 * onActiveNode so the canvas can highlight it.
 */
export default function PhoneSimulator({ journey, beforeStart, onActiveNode, className }) {
  const t = useT()
  const looks = journey.channel === 'both' ? ['ussd', 'whatsapp'] : [journey.channel]
  const [look, setLook] = useState(looks[0])
  const [asRegistered, setAsRegistered] = useState(false)
  const [run, setRun] = useState(null) // last API answer
  const [chat, setChat] = useState([]) // WhatsApp bubbles
  const [typed, setTyped] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const simulate = useSimulate()
  const inputRef = useRef(null)
  const chatEnd = useRef(null)

  useEffect(() => { chatEnd.current?.scrollIntoView?.({ block: 'end' }) }, [chat])
  useEffect(() => { onActiveNode?.(run && !run.screen.end ? run.screen.node_key : run?.screen.node_key ?? null) }, [run, onActiveNode])

  const reset = () => {
    setRun(null)
    setChat([])
    setTyped('')
    setListOpen(false)
    onActiveNode?.(null)
  }

  const send = async (body) => {
    try {
      const answer = await simulate.mutateAsync({ journey: journey.id, channel: look, version: 'draft', ...body })
      setRun(answer)
      setChat((c) => [...c, { from: 'bot', text: answer.screen.text, choices: answer.screen.choices, layout: answer.screen.whatsapp_layout, end: answer.screen.end }])
      setListOpen(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    } catch {
      /* the error is shown from simulate.error */
    }
  }

  const start = async () => {
    reset()
    if (beforeStart) {
      const ok = await beforeStart()
      if (ok === false) return
    }
    send({ restart: !!run, session_id: run?.session_id, as_registered: asRegistered })
  }

  // label: what the person's bubble shows (a button or list row title), text: what is sent.
  const answer = (text, label) => {
    if (!run || run.screen.end || simulate.isPending) return
    setChat((c) => [...c, { from: 'person', text: label ?? text }])
    setTyped('')
    send({ session_id: run.session_id, input: text })
  }

  const switchLook = (next) => {
    setLook(next)
    reset()
  }

  const screen = run?.screen
  return (
    <section aria-label={t('ch.sim.label')} className={cn('flex flex-col gap-3', className)}>
      {looks.length > 1 && (
        <Tabs variant="segment" tabs={looks.map((key) => ({ key, label: t(`ch.channel.${key}`) }))} active={look} onChange={switchLook} label={t('ch.sim.look')} />
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('ch.sim.who')}>
        <Button size="sm" variant={asRegistered ? 'secondary' : 'soft'} icon={<UserPlus size={14} />} aria-pressed={!asRegistered} onClick={() => { setAsRegistered(false); reset() }}>{t('ch.sim.newNumber')}</Button>
        <Button size="sm" variant={asRegistered ? 'soft' : 'secondary'} icon={<UserCheck size={14} />} aria-pressed={asRegistered} onClick={() => { setAsRegistered(true); reset() }}>{t('ch.sim.registered')}</Button>
      </div>

      {/* Phone frame */}
      <div className="mx-auto w-[248px] rounded-[32px] border-[6px] border-banner-deep bg-banner-deep p-1 shadow-lg">
        <div className={cn('relative h-[440px] rounded-[24px] overflow-hidden flex flex-col', look === 'whatsapp' ? 'bg-surface2' : 'bg-text/90')}>
          <div className={cn('h-6 flex items-center justify-between px-4 text-[10px]', look === 'whatsapp' ? 'bg-banner-deep text-on-banner/80' : 'text-on-banner/80')} aria-hidden>
            <span>CEDA</span><span>12:00</span>
          </div>
          {look === 'whatsapp' && (
            <div className="h-10 flex items-center gap-2 px-3 bg-banner text-on-banner">
              <span className="h-6 w-6 rounded-full bg-on-banner/20 grid place-items-center text-[10px] font-bold">C</span>
              <span className="text-xs font-bold">CEDA Innovation</span>
            </div>
          )}

          {!run && !simulate.isPending && (
            <div className="flex-1 grid place-items-center p-4 text-center">
              <div className="space-y-3">
                <p className={cn('text-xs', look === 'whatsapp' ? 'text-muted' : 'text-on-banner/80')}>{t(look === 'ussd' ? 'ch.sim.idleUssd' : 'ch.sim.idleWhatsapp')}</p>
                <Button size="sm" icon={<Phone size={14} />} onClick={start}>{t(look === 'ussd' ? 'ch.sim.dial' : 'ch.sim.sayHi')}</Button>
              </div>
            </div>
          )}

          {look === 'ussd' && (run || simulate.isPending) && (
            <div className="flex-1 grid place-items-center p-3">
              <div className="w-full rounded-control bg-surface p-3 shadow" role="dialog" aria-label={t('ch.sim.ussdDialog')}>
                {simulate.isPending && !screen ? (
                  <p className="text-xs text-muted">{t('ch.sim.running')}</p>
                ) : (
                  <>
                    <p className="whitespace-pre-line text-[12px] leading-snug text-text" aria-live="polite">{screen?.ussd_text}</p>
                    {!screen?.end ? (
                      <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) answer(typed.trim()) }}>
                        <InputControl ref={inputRef} aria-label={t('ch.sim.reply')} value={typed} onChange={(e) => setTyped(e.target.value)} inputMode={screen?.expects === 'choice' ? 'numeric' : 'text'} className="h-8 text-sm" />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={reset}>{t('ch.sim.cancel')}</Button>
                          <Button size="sm" type="submit" loading={simulate.isPending}>{t('ch.sim.send')}</Button>
                        </div>
                      </form>
                    ) : (
                      <div className="mt-2 flex justify-end"><Button size="sm" onClick={reset}>{t('ch.sim.ok')}</Button></div>
                    )}
                    {screen && <p className={cn('mt-2 text-[10px] tabular-nums', screen.characters > 182 ? 'text-danger font-bold' : 'text-muted')}>{t('ch.inspector.ussdCount', { count: screen.characters, limit: 182 })}</p>}
                  </>
                )}
              </div>
            </div>
          )}

          {look === 'whatsapp' && (run || simulate.isPending) && (
            <>
              <ol className="flex-1 overflow-y-auto p-2 space-y-1.5" aria-live="polite">
                {chat.map((bubble, i) => (
                  <li key={i} className={cn('max-w-[85%] rounded-card px-2.5 py-1.5 text-[12px] whitespace-pre-line shadow-sm', bubble.from === 'person' ? 'ml-auto bg-success-soft text-text' : 'bg-surface text-text')}>
                    {bubble.text}
                    {bubble.from === 'bot' && bubble.layout === 'buttons' && i === chat.length - 1 && !bubble.end && (
                      <div className="mt-1.5 -mx-1 space-y-1">
                        {bubble.choices.map((c) => (
                          <button key={c.id} type="button" onClick={() => answer(c.id, c.title)} className="w-full rounded-control border border-border py-1 text-info text-[12px] font-bold hover:bg-surface2">{c.title}</button>
                        ))}
                      </div>
                    )}
                    {bubble.from === 'bot' && (bubble.layout === 'list' || bubble.layout === 'numbered') && i === chat.length - 1 && !bubble.end && (
                      <button type="button" onClick={() => setListOpen(true)} className="mt-1.5 w-full flex items-center justify-center gap-1 border-t border-border pt-1 text-info text-[12px] font-bold">
                        <ListIcon size={12} aria-hidden />{t('ch.sim.choose')}
                      </button>
                    )}
                  </li>
                ))}
                {simulate.isPending && <li className="text-[11px] text-muted">{t('ch.sim.typing')}</li>}
                <li ref={chatEnd} aria-hidden />
              </ol>
              {listOpen && screen && (
                <div className="absolute inset-x-0 bottom-0 rounded-t-card bg-surface p-2 shadow-lg" role="listbox" aria-label={t('ch.sim.choose')}>
                  {screen.choices.map((c) => (
                    <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => answer(c.id, c.title)} className="w-full text-left px-2 py-1.5 text-[12px] rounded-control hover:bg-surface2">{c.title}</button>
                  ))}
                  <button type="button" onClick={() => setListOpen(false)} className="w-full mt-1 py-1 text-[11px] text-muted">{t('ch.sim.cancel')}</button>
                </div>
              )}
              {!screen?.end ? (
                <form className="flex items-center gap-1 p-1.5 bg-surface" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) answer(typed.trim()) }}>
                  <InputControl ref={inputRef} aria-label={t('ch.sim.reply')} value={typed} onChange={(e) => setTyped(e.target.value)} className="h-8 text-sm" />
                  <button type="submit" className="h-8 w-8 shrink-0 grid place-items-center rounded-full bg-success text-on-primary" aria-label={t('ch.sim.send')}><Send size={14} aria-hidden /></button>
                </form>
              ) : (
                <p className="p-2 text-center text-[11px] text-muted bg-surface">{t('ch.sim.ended')}</p>
              )}
            </>
          )}
        </div>
      </div>

      {simulate.isError && <p role="alert" className="text-xs text-danger text-center">{t('ch.sim.error')}</p>}

      <div className="flex justify-center">
        <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={start} disabled={simulate.isPending}>{t('ch.sim.restart')}</Button>
      </div>

      {run && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">{t('ch.sim.phone')}</dt><dd className="text-text tabular-nums">{run.phone}</dd>
          <dt className="text-muted">{t('ch.sim.person')}</dt><dd className="text-text">{run.registered ? t('ch.sim.isRegistered') : t('ch.sim.isNew')}</dd>
          {run.draft && (<><dt className="text-muted">{t('ch.sim.draft')}</dt><dd className="text-text">{run.draft.reference} · {run.draft.title}</dd></>)}
          {run.conversation_id && (<><dt className="text-muted">{t('ch.sim.handoff')}</dt><dd className="text-text">{t('ch.sim.handoffDone')}</dd></>)}
        </dl>
      )}
      {run?.draft && (
        <p className="text-d-cap text-muted">{t('ch.sim.draftHint')} <Link className="text-primary underline" to="/channels/activity">{t('ch.sim.seeActivity')}</Link></p>
      )}
    </section>
  )
}
