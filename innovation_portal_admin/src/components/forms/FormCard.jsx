import { Link } from 'react-router-dom'
import Tag from '../ui/Tag'
import DropdownMenu from '../ui/DropdownMenu'
import LayoutThumb from './LayoutThumb'
import { useT } from '../../i18n/context'
import { relativeTime } from '../../lib/forms/format'

const STATUS_TONE = { draft: 'neutral', live: 'green', closed: 'blue', archived: 'neutral' }

/** One form on the forms list (3.4). The whole card opens the builder; the menu holds the rest. */
export default function FormCard({ form, actions }) {
  const t = useT()
  const programs = form.linked_programs ?? []
  const answers = form.answer_count ?? 0
  const facts = [
    t('forms.questions', { count: form.question_count ?? 0 }),
    (form.step_count ?? 0) > 1 ? t('forms.steps', { count: form.step_count }) : null,
    form.updated_at ? t('forms.edited', { when: relativeTime(form.updated_at, t) }) : null,
  ].filter(Boolean)
  const statusKey = `forms.status.${form.status}`
  const statusText = t(statusKey) === statusKey ? t('status.unknown') : t(statusKey)

  return (
    <article className="relative flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-shadow hover:shadow-card focus-within:ring-2 focus-within:ring-primary">
      <LayoutThumb rows={form.layout_preview} />
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-[14px] font-bold leading-5 text-text">
            <Link to={`/forms/${form.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {form.name}
            </Link>
          </h3>
          <div className="relative z-10">
            <DropdownMenu label={t('forms.menu', { name: form.name })} items={actions} />
          </div>
        </div>
        <p className="truncate text-[12px] text-muted">
          {programs.length ? programs.map((p) => p.title).join(', ') : t('forms.notLinked')}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={STATUS_TONE[form.status] ?? 'unknown'} dot>{statusText}</Tag>
          {(form.languages ?? []).length > 0 && (
            <Tag tone="neutral">
              <span aria-hidden>{form.languages.map((l) => l.toUpperCase()).join(' · ')}</span>
              <span className="sr-only">{t('forms.languages', { list: form.languages.map((l) => t(`lang.${l}`)).join(', ') })}</span>
            </Tag>
          )}
          <span className="text-[12px] text-muted">
            {answers === 0 ? t('forms.noAnswers') : answers === 1 ? t('forms.answersOne') : t('forms.answers', { count: answers.toLocaleString('en-BW') })}
          </span>
        </div>
        <p className="mt-auto text-[12px] text-muted">{facts.join(' · ')}</p>
      </div>
    </article>
  )
}
