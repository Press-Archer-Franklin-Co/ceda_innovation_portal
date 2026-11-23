import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, Save } from 'lucide-react'
import EditorWorkspace from '../ui/EditorWorkspace'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import Select from '../ui/Select'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import { buttonClasses } from '../ui/buttonClasses'
import { useEditorPanel } from '../ui/editorPanel'
import FlowDiagram from './FlowDiagram'
import StepPanel, { TargetSelect } from './StepPanel'
import { JourneyStatusTag } from './tags'
import { useJourneyEditor } from './useJourneyEditor'
import { useTypeLabel } from './useTypeLabel'
import { connect, pick, portsOf } from './journeyModel'
import { flowProblems, strandedBy } from './flowGraph'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'

// The flow editor for one journey, the same for WhatsApp (3.31b) and USSD (3.31): the diagram is the canvas
// and the selected step or branch opens in the sticky panel on the right (a bottom sheet on a phone).

function AddAfter({ node, types, channel, onAdd }) {
  const { t } = useI18n()
  const label = useTypeLabel(channel)
  const port = portsOf(node, types).find((p) => p.id === 'next') ?? portsOf(node, types)[0]
  if (!port) return null
  const options = Object.values(types).filter((spec) => channel !== 'ussd' || !['file', 'my_ideas'].includes(spec.type)).map((spec) => ({ value: spec.type, label: label(spec) }))
  return (
    <Select label={t('ch.flow.addAfter')} hint={port.id === 'next' ? undefined : t('ch.flow.addAfterBranch', { label: pick(port.label, 'en') })} placeholder={t('ch.flow.chooseType')}
      options={options} value="" onChange={(type) => type && onAdd(type, { key: node.key, port: port.id })} />
  )
}

function BranchPanel({ branch, editor, channel, onAdd }) {
  const { t, lang } = useI18n()
  const label = useTypeLabel(channel)
  const { inSheet } = useEditorPanel()
  const source = editor.nodes.find((n) => n.key === branch.key)
  if (!source) return null
  const port = portsOf(source, editor.types).find((p) => p.id === branch.port)
  if (!port) return null
  const name = port.number ? `${port.number} · ${pick(port.label, lang) || '…'}` : pick(port.label, lang)
  const options = Object.values(editor.types).filter((spec) => channel !== 'ussd' || !['file', 'my_ideas'].includes(spec.type)).map((spec) => ({ value: spec.type, label: label(spec) }))
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-3.5 2xl:p-[22px]" aria-label={t('ch.flow.branch')}>
      {!inSheet && <h2 className="text-sm font-bold text-text">{t('ch.flow.branch')}</h2>}
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-muted">{t('ch.flow.from')}</dt>
        <dd className="text-text"><button type="button" className="underline" onClick={() => editor.setSelected(source.key)}>{source.title || pick(source.text, lang) || source.key}</button></dd>
        <dt className="text-muted">{t('ch.flow.answer')}</dt>
        <dd className="text-text">{name || t('ch.flow.then')}</dd>
      </dl>
      <TargetSelect label={t('ch.flow.goesTo')} value={port.target} nodes={editor.nodes} selfKey={source.key} onChange={(v) => editor.updateNode(connect(source, port.id, v))} />
      <Select label={t('ch.flow.addHere')} placeholder={t('ch.flow.chooseType')} options={options} value="" onChange={(type) => type && onAdd(type, { key: source.key, port: port.id })} />
    </section>
  )
}

function CheckFlow({ problems, server, editor, extra }) {
  const { t, lang } = useI18n()
  const all = [...problems, ...(server ?? []).filter((p) => !problems.some((q) => q.node === p.node && q.code === p.code))]
  const errors = all.filter((p) => p.level === 'error')
  const name = (key) => {
    const node = editor.nodes.find((n) => n.key === key)
    return node ? node.title || pick(node.text, lang) || node.key : ''
  }
  return (
    <div className="space-y-3">
      <section aria-label={t('ch.flow.checkFlow')} className="rounded-card border border-border bg-surface p-3.5 2xl:p-[22px]">
        <h2 className="mb-2 text-sm font-bold text-text">{t('ch.flow.checkFlow')}</h2>
        {all.length === 0 ? (
          <p className="flex items-center gap-1.5 text-[13px] text-success"><CheckCircle2 size={14} aria-hidden />{t('ch.flow.noProblems')}</p>
        ) : (
          <ul className="space-y-1.5">
            {all.map((p, i) => (
              <li key={`${p.node}-${p.code}-${i}`}>
                <button type="button" disabled={!p.node} onClick={() => p.node && editor.setSelected(p.node)}
                  className={cn('flex w-full items-start gap-1.5 rounded-control px-2 py-1 text-left text-[13px] hover:bg-surface2', p.level === 'error' ? 'text-danger' : 'text-warning')}>
                  <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
                  <span><span className="font-bold">{p.node ? `${name(p.node)}: ` : ''}</span>{p.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {errors.length > 0 && <p className="mt-2 text-d-cap text-muted">{t('ch.flow.fixToPublish')}</p>}
        <p className="mt-2 text-d-cap text-muted">{t('ch.flow.pickHint')}</p>
      </section>
      {extra}
    </div>
  )
}

export default function FlowEditor({ id, channel, basePath, extra, actions }) {
  const { t, lang: uiLang } = useI18n()
  const editor = useJourneyEditor(id)
  const [lang, setLang] = useState('en')
  const [branch, setBranch] = useState(null)
  const label = useTypeLabel(channel)
  const { journey, journeyQuery, typesQuery, types, nodes, startKey, selectedNode } = editor
  const words = useMemo(() => ({
    no_start: t('ch.flow.pNoStart'), no_options: t('ch.flow.pNoOptions'), no_choices: t('ch.flow.pNoChoices'), branch_nowhere: t('ch.flow.pBranchNowhere'),
    broken: t('ch.flow.pBroken'), goes_nowhere: t('ch.flow.pGoesNowhere'), unreachable: t('ch.flow.pUnreachable'),
  }), [t])
  const problems = useMemo(() => flowProblems(nodes, startKey, types, words), [nodes, startKey, types, words])
  const blocking = problems.filter((p) => p.level === 'error').length
  const shown = useMemo(() => [...problems, ...(editor.problems ?? []).filter((p) => !problems.some((q) => q.node === p.node && q.code === p.code))], [problems, editor.problems])

  const list = (
    <Link to={basePath} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-text hover:underline">
      <ArrowLeft size={13} aria-hidden />{t(channel === 'ussd' ? 'ch.ussd.allMenus' : 'ch.wa.allFlows')}
    </Link>
  )
  if (journeyQuery.isLoading || typesQuery.isLoading) return <div className="space-y-3">{list}<Skeleton className="h-[520px] w-full" /></div>
  if (journeyQuery.isError || typesQuery.isError) {
    return <div className="space-y-3">{list}<ErrorState framed title={t('ch.builder.loadFailed')} message={(journeyQuery.error || typesQuery.error)?.message} onRetry={() => { journeyQuery.refetch(); typesQuery.refetch() }} /></div>
  }
  if (!journey) return null

  const select = (target) => {
    if (!target) { setBranch(null); editor.setSelected(null); return }
    if (target.kind === 'branch') { setBranch(target); editor.setSelected(null); return }
    setBranch(null)
    editor.setSelected(target.key)
  }
  const addOn = (type, from) => { setBranch(null); editor.addOnBranch(type, from) }
  const remove = (node) => editor.removeNode(node, { stranded: strandedBy(nodes, startKey, types, node.key).length })

  const panel = branch ? (
    <BranchPanel branch={branch} editor={editor} channel={channel} onAdd={addOn} />
  ) : selectedNode ? (
    <div className="space-y-3 rounded-card border border-border bg-surface p-3.5 2xl:p-[22px]">
      <StepPanel key={selectedNode.key} node={selectedNode} nodes={nodes} types={types} channel={channel} lang={lang} onLang={setLang}
        isStart={selectedNode.key === startKey} problems={shown.filter((p) => p.node === selectedNode.key)} onChange={editor.updateNode}
        onSetStart={() => editor.setStartKey(selectedNode.key)} onDelete={() => remove(selectedNode)} />
      <AddAfter node={selectedNode} types={types} channel={channel} onAdd={addOn} />
    </div>
  ) : null

  return (
    <EditorWorkspace
      header={
        <PageHeader
          back={list}
          title={journey.name}
          badge={<JourneyStatusTag journey={journey} dirty={editor.dirty} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {editor.dirty && <span className="text-xs text-warning" aria-live="polite">{t('ch.builder.unsaved')}</span>}
              {actions}
              <Button variant="ghost" size="sm" icon={<ClipboardCheck size={14} />} loading={editor.checking} onClick={editor.check}>{t('ch.builder.check')}</Button>
              <Button variant="secondary" size="sm" icon={<Save size={14} />} loading={editor.saving} disabled={!editor.dirty} onClick={() => editor.save()}>{t('common.save')}</Button>
              <Button size="sm" loading={editor.publishing} disabled={blocking > 0} title={blocking ? t('ch.flow.fixToPublish') : undefined} onClick={editor.publish}>{t('ch.builder.publish')}</Button>
            </div>
          }
        />
      }
      notices={blocking > 0 ? (
        <p role="status" className="flex items-center gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger"><AlertCircle size={15} aria-hidden />{t('ch.builder.fixBefore', { count: blocking })}</p>
      ) : null}
      panel={panel}
      empty={<CheckFlow problems={problems} server={editor.problems} editor={editor} extra={extra} />}
      panelLabel={branch ? t('ch.flow.branch') : t('ch.flow.stepSettings')}
      onClosePanel={() => select(null)}
    >
      <FlowDiagram
        label={t('ch.flow.diagram')}
        steps={nodes}
        startKey={startKey}
        types={types}
        channel={channel}
        lang={uiLang === 'tn' ? 'tn' : lang}
        problems={shown}
        selected={branch ? { kind: 'branch', id: branch.id } : selectedNode ? { kind: 'node', key: selectedNode.key } : null}
        onSelect={select}
        onAddOnBranch={addOn}
        typeLabel={(type) => label(types[type])}
      />
    </EditorWorkspace>
  )
}
