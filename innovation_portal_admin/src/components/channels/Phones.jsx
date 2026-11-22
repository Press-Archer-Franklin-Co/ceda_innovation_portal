import { useEffect, useRef, useState } from 'react'
import { List as ListIcon, Phone, Send } from 'lucide-react'
import Button from '../ui/Button'
import { InputControl } from '../ui/Input'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'

// 3.32 phones: the USSD pop-up and the WhatsApp chat. They show a run from useSimulatorRun (simulatorRun.js).

function Frame({ children, tone = 'ussd', label }) {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-[36px] bg-banner-deep p-3 shadow-lg" role="group" aria-label={label}>
      <div className={cn('relative h-[540px] rounded-[26px] overflow-hidden flex flex-col', tone === 'ussd' ? 'bg-muted/25' : 'bg-surface2')}>{children}</div>
    </div>
  )
}

function Idle({ label, onStart, hint }) {
  return (
    <div className="flex-1 grid place-items-center p-5 text-center">
      <div className="space-y-3">
        <p className="text-xs text-muted">{hint}</p>
        <Button size="sm" icon={<Phone size={14} />} onClick={onStart}>{label}</Button>
      </div>
    </div>
  )
}

export function UssdPhone({ sim, shortCode }) {
  const { t } = useI18n()
  const [typed, setTyped] = useState('')
  const inputRef = useRef(null)
  const screen = sim.run?.screen
  useEffect(() => { if (screen && !screen.end) inputRef.current?.focus() }, [screen])
  const submit = (e) => {
    e.preventDefault()
    if (!typed.trim()) return
    sim.answer(typed.trim())
    setTyped('')
  }
  return (
    <Frame tone="ussd" label={t('ch.try.ussdPhone')}>
      {!sim.run && !sim.pending ? (
        <Idle label={shortCode ? t('ch.try.dialCode', { code: shortCode }) : t('ch.sim.dial')} hint={t('ch.sim.idleUssd')} onStart={sim.start} />
      ) : (
        <div className="flex-1 grid place-items-center p-3">
          <div className="w-full rounded-control bg-surface p-3.5 shadow" aria-live="polite">
            {!screen ? (
              <p className="text-sm text-muted">{t('ch.sim.running')}</p>
            ) : (
              <>
                <p className="whitespace-pre-line text-sm leading-relaxed text-text">{screen.ussd_text}</p>
                {!screen.end ? (
                  <form className="mt-3 space-y-2" onSubmit={submit}>
                    <InputControl ref={inputRef} aria-label={t('ch.sim.reply')} value={typed} onChange={(e) => setTyped(e.target.value)} inputMode={screen.expects === 'choice' ? 'numeric' : 'text'} />
                    <div className="flex justify-between">
                      <Button size="sm" variant="link" onClick={sim.reset}>{t('ch.sim.cancel')}</Button>
                      <Button size="sm" variant="link" type="submit" loading={sim.pending}>{t('ch.sim.send')}</Button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-3 flex justify-end"><Button size="sm" variant="link" onClick={sim.reset}>{t('ch.sim.ok')}</Button></div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Frame>
  )
}

export function WhatsAppPhone({ sim }) {
  const { t } = useI18n()
  const [typed, setTyped] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [sim.chat])
  const screen = sim.run?.screen
  const pickChoice = (c) => { setListOpen(false); sim.answer(c.id, c.title) }
  return (
    <Frame tone="whatsapp" label={t('ch.try.whatsappPhone')}>
      <div className="h-12 flex items-center gap-2 px-3 bg-banner text-on-banner">
        <span className="h-7 w-7 rounded-full bg-on-banner/20 grid place-items-center text-[10px] font-bold" aria-hidden>CE</span>
        <span className="text-sm font-bold">CEDA Innovation</span>
      </div>
      {!sim.run && !sim.pending ? (
        <Idle label={t('ch.sim.sayHi')} hint={t('ch.sim.idleWhatsapp')} onStart={sim.start} />
      ) : (
        <>
          <ol className="flex-1 overflow-y-auto p-2.5 space-y-1.5" aria-live="polite">
            {sim.chat.map((bubble, i) => {
              const last = i === sim.chat.length - 1
              if (bubble.from === 'person') return <li key={i} className="ml-auto max-w-[80%] rounded-card bg-success-soft px-2.5 py-1.5 text-[12px] text-text">{bubble.text}</li>
              const layout = bubble.screen.whatsapp_layout
              return (
                <li key={i} className="space-y-1">
                  <p className="max-w-[85%] rounded-card bg-surface px-2.5 py-1.5 text-[12px] text-text whitespace-pre-line shadow-sm">{bubble.screen.text}</p>
                  {last && !bubble.screen.end && layout === 'buttons' && bubble.screen.choices.map((c) => (
                    <button key={c.id} type="button" onClick={() => pickChoice(c)} className="block w-[85%] rounded-control bg-surface py-1 text-[12px] font-bold text-info shadow-sm hover:bg-surface2">{c.title}</button>
                  ))}
                  {last && !bubble.screen.end && (layout === 'list' || layout === 'numbered') && (
                    <button type="button" onClick={() => setListOpen(true)} className="flex w-[85%] items-center justify-center gap-1 rounded-control bg-surface py-1 text-[12px] font-bold text-info shadow-sm">
                      <ListIcon size={12} aria-hidden />{t('ch.sim.choose')}
                    </button>
                  )}
                </li>
              )
            })}
            {sim.pending && <li className="text-[11px] text-muted">{t('ch.sim.typing')}</li>}
            <li ref={end} aria-hidden />
          </ol>
          {listOpen && screen && (
            <div className="absolute inset-x-0 bottom-0 rounded-t-card bg-surface p-2 shadow-lg">
              <p className="px-2 pb-1 text-d-cap font-bold text-muted">{t('ch.sim.choose')}</p>
              <ul>
                {screen.choices.map((c) => (
                  <li key={c.id}><button type="button" onClick={() => pickChoice(c)} className="w-full text-left px-2 py-1.5 text-[12px] rounded-control hover:bg-surface2">{c.title}</button></li>
                ))}
              </ul>
              <Button size="sm" variant="ghost" block onClick={() => setListOpen(false)}>{t('ch.sim.cancel')}</Button>
            </div>
          )}
          {screen?.end ? (
            <p className="p-2 text-center text-[11px] text-muted bg-surface">{t('ch.sim.ended')}</p>
          ) : (
            <form className="flex items-center gap-1 p-1.5 bg-surface" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { sim.answer(typed.trim()); setTyped('') } }}>
              <InputControl aria-label={t('ch.sim.reply')} value={typed} onChange={(e) => setTyped(e.target.value)} />
              <button type="submit" className="h-9 w-9 shrink-0 grid place-items-center rounded-full bg-success text-on-primary" aria-label={t('ch.sim.send')}><Send size={14} aria-hidden /></button>
            </form>
          )}
        </>
      )}
    </Frame>
  )
}
