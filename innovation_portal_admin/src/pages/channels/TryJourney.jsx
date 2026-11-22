import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserCheck, UserPlus } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import SectionCard from '../../components/ui/SectionCard'
import Tabs from '../../components/ui/Tabs'
import Skeleton from '../../components/ui/Skeleton'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import { UssdPhone, WhatsAppPhone } from '../../components/channels/Phones'
import { overLimit, useSimulatorRun } from '../../components/channels/simulatorRun'
import { useWide } from '../../components/channels/useWide'
import { useChannelConnections, useJourneys } from '../../lib/queries/channels'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'

// 3.32 Phone simulator (Figma 137:1756 website, 137:2105 phone). ① USSD look ② WhatsApp look, the same journey
// as chat ③ test log: every step, what was answered and any screen over the limit. Test runs are marked as tests
// and left out of the activity numbers. Phone: one look at a time.

const DOT = { done: 'bg-success', waiting: 'bg-amber', over: 'bg-danger', end: 'bg-muted' }

function TestLog({ entries }) {
  const { t } = useI18n()
  return (
    <SectionCard title={t('ch.try.log')} subtitle={t('ch.try.logHint')}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">{t('ch.try.logEmpty')}</p>
      ) : (
        <ol className="space-y-2.5">
          {entries.map((entry, i) => (
            <li key={i} className="grid grid-cols-[auto,minmax(0,8rem),1fr] items-start gap-x-3 text-sm">
              <span className={cn('mt-1.5 h-2 w-2 rounded-full', DOT[entry.state])} aria-hidden />
              <span className="font-bold text-text truncate">{entry.step}</span>
              <span className="text-text">
                <span className="text-d-cap text-muted mr-1.5">{t(`ch.channel.${entry.channel}`)}</span>
                {entry.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  )
}

export default function TryJourney() {
  const { t } = useI18n()
  const wide = useWide()
  const [params, setParams] = useSearchParams()
  const journeys = useJourneys()
  const connections = useChannelConnections({ kind: 'ussd' })
  const list = useMemo(() => journeys.data ?? [], [journeys.data])
  const journeyId = params.get('journey') || list[0]?.id || ''
  const journey = list.find((j) => j.id === journeyId)
  const [asRegistered, setAsRegistered] = useState(false)
  const [entries, setEntries] = useState([])
  const runsUssd = journey && (journey.channel === 'ussd' || journey.channel === 'both')
  const runsWhatsApp = journey && (journey.channel === 'whatsapp' || journey.channel === 'both')
  const look = params.get('look') === 'whatsapp' || !runsUssd ? 'whatsapp' : 'ussd'
  const shortCode = (connections.data ?? []).find((c) => c.journey?.id === journeyId)?.address || ''

  const onEvent = useCallback((event) => {
    setEntries((list) => {
      const next = list.map((e) => (e.state === 'waiting' && e.channel === event.channel ? { ...e, state: 'done' } : e))
      if (event.kind === 'answer') {
        return [...next, { channel: event.channel, state: 'done', step: event.node?.node_title || event.node?.node_key || '', text: t('ch.try.answered', { answer: event.text }) }]
      }
      const s = event.screen
      const step = s.node_title || s.node_key || t('ch.try.end')
      let text = s.end ? t('ch.try.ended') : t('ch.try.waiting')
      if (s.characters !== undefined) text = `${text} · ${t('ch.try.characters', { count: s.characters })}`
      if (event.draft) text = `${text} · ${t('ch.try.draft', { reference: event.draft.reference })}`
      if (event.handedOver) text = `${text} · ${t('ch.sim.handoffDone')}`
      const state = overLimit(s) ? 'over' : s.end ? 'end' : 'waiting'
      return [...next, { channel: event.channel, state, step, text: overLimit(s) ? `${text} · ${t('ch.try.over')}` : text }]
    })
  }, [t])

  const ussd = useSimulatorRun({ journeyId, channel: 'ussd', asRegistered, onEvent })
  const whatsapp = useSimulatorRun({ journeyId, channel: 'whatsapp', asRegistered, onEvent })
  const reset = () => { ussd.reset(); whatsapp.reset(); setEntries([]) }
  const options = useMemo(() => list.map((j) => ({ value: j.id, label: `${j.name} · ${t(`ch.channel.${j.channel}`)}` })), [list, t])

  return (
    <div>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('ch.try.crumb')}</span>}
        title={t('ch.try.title')}
        subtitle={t('ch.try.subtitle')}
        actions={<Button variant="link" onClick={reset}>{t('ch.try.reset')}</Button>}
      />
      {journeys.isLoading ? (
        <Skeleton className="h-[540px] w-full" />
      ) : journeys.isError ? (
        <ErrorState framed title={t('ch.journeys.loadFailed')} message={journeys.error?.message} onRetry={() => journeys.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState framed title={t('ch.journeys.emptyTitle')} message={t('ch.journeys.emptyBody')} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Select label={t('ch.try.journey')} fieldClassName="w-full sm:w-80" options={options} value={journeyId}
              onChange={(v) => { setParams((p) => { const n = new URLSearchParams(p); n.set('journey', v); return n }, { replace: true }); setEntries([]) }} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('ch.sim.who')}>
              <Button size="sm" variant={asRegistered ? 'secondary' : 'soft'} icon={<UserPlus size={14} />} aria-pressed={!asRegistered} onClick={() => { setAsRegistered(false); setEntries([]) }}>{t('ch.sim.newNumber')}</Button>
              <Button size="sm" variant={asRegistered ? 'soft' : 'secondary'} icon={<UserCheck size={14} />} aria-pressed={asRegistered} onClick={() => { setAsRegistered(true); setEntries([]) }}>{t('ch.sim.registered')}</Button>
            </div>
          </div>
          {!wide && runsUssd && runsWhatsApp && (
            <Tabs variant="segment" className="mb-3" label={t('ch.sim.look')} tabs={[{ key: 'ussd', label: t('ch.channel.ussd') }, { key: 'whatsapp', label: t('ch.channel.whatsapp') }]}
              active={look} onChange={(v) => setParams((p) => { const n = new URLSearchParams(p); n.set('look', v); return n }, { replace: true })} />
          )}
          <div className="flex flex-wrap gap-5 items-start">
            {runsUssd && (wide || look === 'ussd') && (
              <div className="w-full sm:w-[280px]">
                <p className="mb-2 text-center text-d-label-s font-bold text-text">{t('ch.try.ussdLabel')}</p>
                <UssdPhone sim={ussd} shortCode={shortCode} />
              </div>
            )}
            {runsWhatsApp && (wide || look === 'whatsapp') && (
              <div className="w-full sm:w-[280px]">
                <p className="mb-2 text-center text-d-label-s font-bold text-text">{t('ch.channel.whatsapp')}</p>
                <WhatsAppPhone sim={whatsapp} />
              </div>
            )}
            {(ussd.failed || whatsapp.failed) && <p role="alert" className="w-full text-sm text-danger">{t('ch.sim.error')}</p>}
            {wide && <div className="min-w-[320px] flex-1"><TestLog entries={entries} /></div>}
          </div>
        </>
      )}
    </div>
  )
}
