import { Link } from 'react-router-dom'
import Tag from '../ui/Tag'
import StatusPill from '../ui/StatusPill'
import DropdownMenu from '../ui/DropdownMenu'
import FormIcon from './FormIcon'
import { useT } from '../../i18n/context'
import { relativeTime } from '../../lib/forms/format'

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

  return (
    <article className="relative flex flex-col gap-1.5 rounded-card border border-border bg-surface px-4 py-3 transition-shadow hover:shadow-card focus-within:ring-2 focus-within:ring-primary">
      <FormIcon />
      <div className="flex items-center gap-1.5">
        <h3 className="min-w-0 flex-1 truncate font-body text-[14px] font-bold leading-5 text-text" title={form.name}>
          <Link to={`/forms/${form.id}`} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none">
            {form.name}
          </Link>
        </h3>
        <div className="relative z-10 -my-1.5 -mr-1.5 shrink-0">
          <DropdownMenu label={t('forms.menu', { name: form.name })} items={actions} />
        </div>
      </div>
      <p className="truncate text-[12px] leading-[18px] text-muted">
        {programs.length ? programs.map((p) => p.title).join(', ') : t('forms.notLinked')}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={form.status} />
        {(form.languages ?? []).length > 0 && (
          <Tag tone="neutral">
            <span aria-hidden>{form.languages.map((l) => l.toUpperCase()).join(' · ')}</span>
            <span className="sr-only">{t('forms.languages', { list: form.languages.map((l) => t(`lang.${l}`)).join(', ') })}</span>
          </Tag>
        )}
        <span className="ml-auto whitespace-nowrap text-[12px] leading-[18px] text-text">
          {answers === 0 ? (
            <>
              <span aria-hidden>–</span>
              <span className="sr-only">{t('forms.noAnswers')}</span>
            </>
          ) : answers === 1 ? t('forms.answersOne') : t('forms.answers', { count: answers.toLocaleString('en-BW') })}
        </span>
      </div>
      <p className="truncate text-[12px] leading-[18px] text-muted">{facts.join(' · ')}</p>
    </article>
  )
}
