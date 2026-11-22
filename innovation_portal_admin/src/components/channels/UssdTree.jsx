import { useMemo } from 'react'
import { AlertCircle, AlertTriangle, CornerDownRight, Plus } from 'lucide-react'
import DropdownMenu from '../ui/DropdownMenu'
import Button from '../ui/Button'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { pick, portsOf } from './journeyModel'

// 3.31 canvas: each box is one USSD screen; numbered options branch to the boxes below them.
// A box that is already drawn elsewhere (a loop or "go back") shows as a small "goes to" link.

function treeParents(nodes, startKey, types) {
  const byKey = Object.fromEntries(nodes.map((n) => [n.key, n]))
  const owner = {}
  const seen = new Set()
  const visit = (key) => {
    if (!key || seen.has(key) || !byKey[key]) return
    seen.add(key)
    for (const port of portsOf(byKey[key], types)) {
      if (port.target && !seen.has(port.target) && byKey[port.target] && !(port.target in owner)) owner[port.target] = `${key}|${port.id}`
      visit(port.target)
    }
  }
  visit(startKey)
  return { owner, seen }
}

function caption(node, types, ui, t, isStart, shortCode) {
  const spec = types[node.type]
  const parts = [isStart ? t('ch.ussd.start') : spec ? ui(spec) : t('ch.status.unknown')]
  if (isStart && shortCode) parts.push(shortCode)
  const saves = node.settings?.variable
  if (saves) parts.push(t('ch.ussd.saves', { name: saves }))
  return parts.join(' · ')
}

function ScreenBox({ node, types, lang, selected, isStart, shortCode, problems, onSelect }) {
  const { t, lang: uiLang } = useI18n()
  const ui = (item) => (uiLang === 'tn' && item.label_tn ? item.label_tn : item.label)
  const errors = problems?.filter((p) => p.level === 'error').length ?? 0
  const warnings = problems?.filter((p) => p.level === 'warning').length ?? 0
  const options = portsOf(node, types).filter((p) => p.number)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-[200px] 2xl:w-[220px] text-left rounded-card border bg-surface px-3 py-2.5 shadow-sm hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected ? 'border-primary ring-1 ring-primary' : errors ? 'border-danger' : warnings ? 'border-warning' : 'border-border',
      )}
    >
      <span className="flex items-center gap-1.5 text-d-cap text-muted">
        <span className="truncate">{caption(node, types, ui, t, isStart, shortCode)}</span>
        {errors > 0 && <AlertCircle size={13} className="ml-auto shrink-0 text-danger" aria-label={t('ch.canvas.problems', { count: errors })} />}
        {!errors && warnings > 0 && <AlertTriangle size={13} className="ml-auto shrink-0 text-warning" aria-label={t('ch.canvas.warnings', { count: warnings })} />}
      </span>
      <span className="mt-1 block whitespace-pre-line text-[13px] leading-snug text-text">{pick(node.text, lang) || <span className="text-muted italic">{t('ch.canvas.noText')}</span>}</span>
      {options.length > 0 && (
        <span className="mt-1.5 block space-y-0.5 text-[13px] text-text">
          {options.map((o) => <span key={o.id} className="block truncate">{o.number}. {pick(o.label, lang) || '…'}</span>)}
        </span>
      )}
    </button>
  )
}

function AddScreen({ types, onAdd, label }) {
  const { t, lang } = useI18n()
  const items = Object.values(types).map((spec) => ({ key: spec.type, label: lang === 'tn' ? spec.label_tn || spec.label : spec.label, onSelect: () => onAdd(spec.type) }))
  return (
    <DropdownMenu
      label={label}
      items={items}
      align="start"
      trigger={(props) => <Button {...props} variant="soft" size="sm" icon={<Plus size={14} />}>{t('ch.ussd.addScreen')}</Button>}
    />
  )
}

export default function UssdTree({ nodes, startKey, types, lang, selectedKey, problems, shortCode, onSelect, onAdd }) {
  const { t, lang: uiLang } = useI18n()
  const byKey = useMemo(() => Object.fromEntries(nodes.map((n) => [n.key, n])), [nodes])
  const { owner, seen } = useMemo(() => treeParents(nodes, startKey, types), [nodes, startKey, types])

  const renderSubtree = (key) => {
    const node = byKey[key]
    const ports = portsOf(node, types)
    const box = (
      <ScreenBox node={node} types={types} lang={lang} selected={selectedKey === key} isStart={key === startKey} shortCode={shortCode}
        problems={problems[key]} onSelect={() => onSelect(key)} />
    )
    if (ports.length === 0) return box
    const branchLabel = (port) => (port.number ? String(port.number) : port.id === 'next' ? '' : uiLang === 'tn' ? port.label.tn || port.label.en : port.label.en)
    return (
      <div className="flex flex-col items-center">
        {box}
        <div className={cn('flex gap-3 2xl:gap-4 items-start', ports.length > 1 && 'mt-1')}>
          {ports.map((port) => {
            const target = port.target && byKey[port.target]
            const owned = target && owner[port.target] === `${key}|${port.id}`
            return (
              <div key={port.id} className="flex flex-col items-center">
                <span className="h-5 w-px bg-border" aria-hidden />
                {branchLabel(port) && <span className="mb-1 text-d-cap font-bold text-primary">{branchLabel(port)}</span>}
                {owned ? (
                  renderSubtree(port.target)
                ) : target ? (
                  <button type="button" onClick={() => onSelect(port.target)} className="flex items-center gap-1 rounded-control border border-dashed border-border px-2 py-1 text-d-cap text-muted hover:text-text">
                    <CornerDownRight size={12} aria-hidden />
                    {t('ch.ussd.goesTo', { name: target.title || pick(target.text, lang) || target.key })}
                  </button>
                ) : (
                  <AddScreen types={types} label={t('ch.ussd.addAfter', { port: branchLabel(port) || t('ch.ussd.thisScreen') })} onAdd={(type) => onAdd(type, { key, port: port.id })} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const loose = nodes.filter((n) => !seen.has(n.key))
  return (
    <div className="space-y-6">
      {startKey && byKey[startKey] ? (
        <div className="w-max mx-auto">{renderSubtree(startKey)}</div>
      ) : (
        <div className="grid place-items-center py-10 text-center">
          <p className="text-sm text-muted mb-2">{t('ch.ussd.noStart')}</p>
          <AddScreen types={types} label={t('ch.ussd.addScreen')} onAdd={(type) => onAdd(type)} />
        </div>
      )}
      {loose.length > 0 && (
        <section aria-label={t('ch.ussd.loose')}>
          <p className="text-d-cap text-muted mb-2">{t('ch.ussd.loose')}</p>
          <div className="flex flex-wrap gap-3">
            {loose.map((n) => <ScreenBox key={n.key} node={n} types={types} lang={lang} selected={selectedKey === n.key} problems={problems[n.key]} onSelect={() => onSelect(n.key)} />)}
          </div>
        </section>
      )}
    </div>
  )
}
