import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Lock, Minus } from 'lucide-react'
import Button from '../../components/ui/Button'
import { useI18n, useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { PERMISSION_COLUMNS, groupSummary, permissionGroups, pickText, toggleCell, toggleGroup } from '../../lib/admin/roles'

// 3.24, compact (Nshathisi, 23 Nov): each permission group is one row with its count and an all / some / none box.
// Opening a row shows that group's small View / Edit / Approve matrix; one row is open at a time. The groups and
// boxes come from the capability map the API serves. A sticky bar holds Save and Cancel while there are changes.

const MATRIX = 'grid grid-cols-[minmax(0,1fr)_repeat(3,48px)] items-center gap-x-1 sm:grid-cols-[minmax(0,1fr)_repeat(3,64px)]'

/** Drawn by hand so a read-only tick keeps the frame's red (a disabled native box turns grey) and "some" shows a dash. */
function PermissionBox({ checked, mixed = false, disabled, label, onChange }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed, checked])
  return (
    <span className="relative flex h-4 w-4 shrink-0">
      <input ref={ref} type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={onChange}
        className="peer h-4 w-4 cursor-pointer appearance-none rounded-[4px] border border-muted/60 bg-surface checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed" />
      <Check size={12} strokeWidth={3} aria-hidden className="pointer-events-none absolute left-0.5 top-0.5 hidden text-white peer-checked:block" />
      <Minus size={12} strokeWidth={3} aria-hidden className="pointer-events-none absolute left-0.5 top-0.5 hidden text-white peer-indeterminate:block" />
    </span>
  )
}

export default function RolePermissionPanel({ role, catalogue, locks = {}, editable, wide, saving, onSave, onCopy, onDirtyChange, menu }) {
  const t = useT()
  const { lang } = useI18n()
  const groups = useMemo(() => permissionGroups(catalogue), [catalogue])
  const saved = useMemo(() => [...(role.capabilities ?? [])].sort(), [role.capabilities])
  const [draft, setDraft] = useState(null)
  const [open, setOpen] = useState(null)
  useEffect(() => { setDraft(null) }, [saved])
  const held = draft ?? saved
  const dirty = JSON.stringify([...held].sort()) !== JSON.stringify(saved)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const roleName = pickText(role.name, lang)
  const groupName = (g) => pickText(g.label, lang) || t(`roles.module.${g.key}`)
  const groupBody = (g) => pickText(g.description, lang) || t(`roles.module.${g.key}.body`)

  return (
    <>
      <section className="rounded-card border border-border bg-surface" aria-labelledby="role-panel-title">
        <div className="flex items-center gap-1 rounded-t-card bg-surface2 px-3 py-2 sm:px-4">
          <h2 id="role-panel-title" className="truncate text-[13px] font-bold text-text">{t('roles.u9.whatTheyCanDo', { name: roleName })}</h2>
          {menu}
        </div>
        <ul>
          {groups.map((g) => {
            const { on, total, state, free } = groupSummary(g, held, locks)
            const isOpen = open === g.key
            const name = groupName(g)
            return (
              <li key={g.key} className="border-t border-border">
                <div className={cn('flex items-center gap-3 px-3 sm:px-4', isOpen && 'bg-surface2/50')}>
                  <PermissionBox checked={state === 'all'} mixed={state === 'some'} disabled={!editable || free.length === 0}
                    label={t('roles.u9.groupBox', { name })} onChange={() => setDraft(toggleGroup(g, held, locks))} />
                  <button type="button" aria-expanded={isOpen} aria-controls={`perm-${g.key}`} aria-label={t('roles.u9.showGroup', { name })}
                    onClick={() => setOpen(isOpen ? null : g.key)}
                    className="flex min-h-[48px] min-w-0 flex-1 items-center gap-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-text">{name}</span>
                      <span className="block truncate text-[12px] text-muted">{groupBody(g)}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[12px] text-muted">{t('roles.u9.countOn', { on, total })}</span>
                    <ChevronDown size={16} aria-hidden className={cn('shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} />
                  </button>
                </div>
                {isOpen && (
                  <div id={`perm-${g.key}`} className="border-t border-border bg-surface px-3 py-1.5 sm:pl-11 sm:pr-4">
                    <div className={cn(MATRIX, 'py-1')} aria-hidden>
                      <span />
                      {PERMISSION_COLUMNS.map((col) => <span key={col} className="text-center text-[11px] font-semibold text-muted">{t(`roles.u9.${col}`)}</span>)}
                    </div>
                    {g.rows.map((row) => {
                      const rowLabel = pickText(row.label, lang)
                      return (
                        <div key={row.key} className={cn(MATRIX, 'min-h-[32px] border-t border-border/60 py-1')}>
                          <span className="text-[13px] text-text">{rowLabel}</span>
                          {PERMISSION_COLUMNS.map((col) => {
                            const key = row[col]
                            if (!key) return <span key={col} aria-hidden />
                            const reason = locks[key]
                            const changed = held.includes(key) !== saved.includes(key)
                            return (
                              <span key={col} className={cn('flex items-center justify-center gap-0.5 rounded py-0.5', changed && 'bg-warning-soft')} title={reason ? t('roles.locked', { reason }) : undefined}>
                                <PermissionBox checked={held.includes(key)} disabled={!editable || reason != null}
                                  label={t('roles.cell', { role: roleName, capability: `${rowLabel}: ${t(`roles.u9.${col}`)}` })}
                                  onChange={(e) => setDraft(toggleCell({ r: held }, 'r', key, e.target.checked).r)} />
                                {reason != null && editable && <Lock size={10} aria-hidden className="text-muted" />}
                              </span>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {!dirty && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5 sm:px-4">
            <span className="text-[12px] text-muted">{!wide ? t('roles.u9.phoneNote') : role.is_system ? t('roles.u9.builtInFooter') : t('roles.u9.customFooter')}</span>
            {wide && <Button variant="secondary" size="sm" onClick={onCopy} loading={saving}>{t('roles.u9.copy')}</Button>}
          </div>
        )}
      </section>
      {dirty && (
        <div className="sticky bottom-3 z-20 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-4 py-2.5 shadow-lg">
          <span className="text-[13px] font-semibold text-text" role="status">{t('roles.u9.unsaved')}</span>
          <span className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={() => onSave([...held].sort())} loading={saving}>{t('common.save')}</Button>
          </span>
        </div>
      )}
    </>
  )
}
