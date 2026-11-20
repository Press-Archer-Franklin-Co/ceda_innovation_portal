import { useState } from 'react'
import { Users } from 'lucide-react'
import Tag from '../../ui/Tag'
import Button from '../../ui/Button'
import { SelectControl } from '../../ui/Select'
import { useT } from '../../../i18n/context'
import { cn } from '../../../lib/cn'

const REVIEWER_ROLES = ['innovation_officer', 'innovation_manager', 'staff_member']

/**
 * 3.5b right panel: every text with English beside Setswana. Edits go into the
 * builder document (autosaved like any other change). Suggestions come from
 * POST /translations/suggest/ and are never saved until accepted.
 */
export default function TranslationsPanel({ rows, onText, suggestions, onSuggest, suggesting, suggestOff, onRequestReview, reviewing, focusKey }) {
  const t = useT()
  const [role, setRole] = useState('innovation_officer')
  const done = rows.filter((row) => (row.value?.tn ?? '').trim()).length
  const total = rows.length
  const missing = total - done

  return (
    <aside aria-label={t('tr.title')} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[14px] 2xl:p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-text">{t('tr.title')}</h2>
        <Tag tone={missing ? 'amber' : 'green'}>{t('tr.count', { done, total })}</Tag>
      </div>
      <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-surface2">
        <span className="block h-full bg-success" style={{ width: `${total ? Math.round((done / total) * 100) : 100}%` }} />
      </span>
      <p className="text-[12px] text-muted">{t('tr.intro')}</p>
      {missing > 0 && !suggestOff && (
        <Button variant="secondary" size="sm" onClick={onSuggest} loading={suggesting} className="self-start">
          {t('settings.suggest')}
        </Button>
      )}
      {suggestOff && <p className="text-[12px] text-muted">{t('settings.suggestOff')}</p>}

      <ul className="flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
        {rows.map((row) => {
          const tn = row.value?.tn ?? ''
          const suggestion = suggestions[row.key]
          return (
            <li key={row.key} className={cn('grid grid-cols-2 gap-2 rounded-control p-2', focusKey && row.fieldKey === focusKey ? 'bg-primary-soft' : 'bg-surface2')}>
              <span className="text-[12px] text-text">{row.value?.en}</span>
              <span className="flex flex-col gap-1">
                <textarea
                  aria-label={`${row.value?.en} (${t('lang.tn')})`}
                  value={tn}
                  rows={Math.min(3, Math.ceil((row.value?.en?.length ?? 0) / 24) || 1)}
                  placeholder={suggestion || t('tr.missing')}
                  onChange={(e) => onText(row, e.target.value)}
                  className={cn('w-full resize-none rounded border bg-surface px-1.5 py-1 text-[12px] text-text focus:outline-none focus:ring-2 focus:ring-primary', tn ? 'border-border' : 'border-warning')}
                />
                {!tn && suggestion && (
                  <span className="flex gap-2 text-[11px]">
                    <button type="button" className="text-primary hover:underline" onClick={() => onText(row, suggestion)}>{t('tr.useSuggestion')}</button>
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-col gap-2 rounded-control border border-border p-3">
        <p className="flex items-center gap-2 text-[12px] font-bold text-text">
          <Users size={14} aria-hidden /> {t('tr.review')}
        </p>
        <div className="flex gap-2">
          <SelectControl
            aria-label={t('tr.reviewRole')}
            value={role}
            onChange={setRole}
            options={REVIEWER_ROLES.map((r) => ({ value: r, label: t(`tr.role.${r}`) }))}
          />
          <Button size="sm" variant="secondary" onClick={() => onRequestReview(role)} loading={reviewing}>{t('tr.send')}</Button>
        </div>
      </div>
    </aside>
  )
}
