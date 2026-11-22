import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, ClipboardCheck, AlertCircle, CheckCircle2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Skeleton from '../../components/ui/Skeleton'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import { buttonClasses } from '../../components/ui/buttonClasses'
import JourneyList from '../../components/channels/JourneyList'
import UssdTree from '../../components/channels/UssdTree'
import StepPanel from '../../components/channels/StepPanel'
import { JourneyStatusTag } from '../../components/channels/tags'
import { useJourneyEditor } from '../../components/channels/useJourneyEditor'
import { useWide } from '../../components/channels/useWide'
import { useChannelConnections, useJourneys } from '../../lib/queries/channels'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'

// 3.31 USSD menus (Figma 137:1319 website, 137:1696 phone). USSD only; WhatsApp has its own builder (3.31b).
// ① Menus ② canvas: one box per screen, numbered options branch to the next box ③ box settings in English and
// Setswana with a live 160-character count ④ menu settings from the connections that run it.
// Phone: the list of menus; a menu opens its screens with the text editor below (building is for a computer).

function MenuSettings({ journeyId }) {
  const { t } = useI18n()
  const { data, isLoading, isError } = useChannelConnections({ kind: 'ussd' })
  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (isError) return null
  const running = (data ?? []).filter((c) => c.journey?.id === journeyId)
  return (
    <section aria-label={t('ch.ussd.settings')} className="rounded-card bg-surface2 px-3.5 py-3 text-d-cap">
      <p className="font-bold text-muted mb-1.5">{t('ch.ussd.settings')}</p>
      {running.length === 0 ? (
        <p className="text-muted">{t('ch.ussd.noConnection')} <Link className="text-primary underline" to="/channels/connections/ussd">{t('ch.ussd.addConnection')}</Link></p>
      ) : (
        <dl className="space-y-1">
          {running.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr,auto] gap-x-3">
              <dt className="text-muted">{t('ch.ussd.shortCode')}</dt><dd className="text-text text-right">{c.address || c.name}</dd>
              <dt className="text-muted">{t('ch.ussd.sessionEnds')}</dt><dd className="text-text text-right">{t('ch.ussd.seconds', { count: c.config?.session_timeout ?? 60 })}</dd>
              <dt className="text-muted">{t('ch.ussd.connection')}</dt><dd className="text-text text-right"><Link className="underline" to="/channels/connections/ussd">{c.name}</Link></dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function Builder({ id, editor }) {
  const { t } = useI18n()
  const [lang, setLang] = useState('en')
  const connections = useChannelConnections({ kind: 'ussd' })
  const shortCode = (connections.data ?? []).find((c) => c.journey?.id === id)?.address || ''
  const { journey, journeyQuery, typesQuery, types, nodes, startKey, selectedNode } = editor
  const canvasRef = useRef(null)
  const hasNodes = nodes.length > 0
  // The tree is often wider than the canvas: open it with the first screen in the middle.
  useEffect(() => {
    const el = canvasRef.current
    if (el && hasNodes) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
  }, [journey?.id, hasNodes])

  if (journeyQuery.isLoading || typesQuery.isLoading) return <Skeleton className="h-[520px] w-full" />
  if (journeyQuery.isError || typesQuery.isError) {
    return <ErrorState framed title={t('ch.builder.loadFailed')} message={(journeyQuery.error || typesQuery.error)?.message} onRetry={() => { journeyQuery.refetch(); typesQuery.refetch() }} />
  }
  if (!journey) return null
  const errors = (editor.problems ?? []).filter((p) => p.level === 'error')

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-base font-bold text-text">{journey.name}</h2>
        <JourneyStatusTag journey={journey} dirty={editor.dirty} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {editor.dirty && <span className="text-xs text-warning" aria-live="polite">{t('ch.builder.unsaved')}</span>}
          <Button variant="ghost" size="sm" icon={<ClipboardCheck size={14} />} loading={editor.checking} onClick={editor.check}>{t('ch.builder.check')}</Button>
          <Button variant="secondary" size="sm" icon={<Save size={14} />} loading={editor.saving} disabled={!editor.dirty} onClick={() => editor.save()}>{t('common.save')}</Button>
        </div>
      </div>
      {editor.problems && (
        <p role="status" className={cn('mb-3 flex items-center gap-2 rounded-control px-3 py-2 text-sm', errors.length ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
          {errors.length ? <AlertCircle size={15} aria-hidden /> : <CheckCircle2 size={15} aria-hidden />}
          {errors.length ? t('ch.builder.fixBefore', { count: errors.length }) : t('ch.builder.noErrors')}
        </p>
      )}
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div ref={canvasRef} className="rounded-card bg-surface2 p-4 overflow-auto max-h-[70vh] xl:max-h-[calc(100vh-15rem)]" role="region" aria-label={t('ch.ussd.canvas')}>
          <UssdTree nodes={nodes} startKey={startKey} types={types} lang={lang} selectedKey={editor.selected} problems={editor.problemsByNode}
            shortCode={shortCode} onSelect={editor.setSelected} onAdd={editor.addNode} />
        </div>
        <div className="space-y-3 self-start">
          <div className="rounded-card border border-border bg-surface p-3.5 2xl:p-[22px]">
            {selectedNode ? (
              <StepPanel key={selectedNode.key} node={selectedNode} nodes={nodes} types={types} channel="ussd" lang={lang} onLang={setLang}
                isStart={selectedNode.key === startKey} problems={editor.problemsByNode[selectedNode.key]} onChange={editor.updateNode}
                onSetStart={() => editor.setStartKey(selectedNode.key)} onDelete={() => editor.removeNode(selectedNode)} />
            ) : (
              <p className="py-6 text-center text-sm text-muted">{t('ch.ussd.pickScreen')}</p>
            )}
          </div>
          <MenuSettings journeyId={id} />
        </div>
      </div>
    </div>
  )
}

export default function UssdMenus() {
  const { id } = useParams()
  const { t } = useI18n()
  const wide = useWide()
  const editor = useJourneyEditor(id)
  const { data } = useJourneys({ channel: 'ussd' })
  const first = useMemo(() => (data ?? []).find((j) => j.channel === 'ussd' || j.channel === 'both'), [data])

  if (!id && wide && first) return <Navigate to={`/channels/ussd/${first.id}`} replace />

  return (
    <div>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('ch.ussd.crumb')}</span>}
        title={t('ch.ussd.title')}
        subtitle={t('ch.ussd.subtitle')}
        actions={id && editor.journey ? (
          <>
            <Link to={`/channels/try?journey=${id}&look=ussd`} className={buttonClasses({ variant: 'link' })}>{t('ch.ussd.openSimulator')}</Link>
            <Button loading={editor.publishing} onClick={editor.publish}>{t('ch.builder.publish')}</Button>
          </>
        ) : null}
      />
      {id && !wide && (
        <Link to="/channels/ussd" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={14} aria-hidden />{t('ch.ussd.allMenus')}</Link>
      )}
      <div className={cn('grid gap-4', wide && 'lg:grid-cols-[208px_minmax(0,1fr)] 2xl:grid-cols-[224px_minmax(0,1fr)]')}>
        {(wide || !id) && <JourneyList channel="ussd" activeId={id} basePath="/channels/ussd" />}
        {id ? <Builder id={id} editor={editor} /> : wide ? <EmptyState framed title={t('ch.ussd.emptyTitle')} message={t('ch.journeys.emptyBody')} /> : null}
      </div>
    </div>
  )
}
