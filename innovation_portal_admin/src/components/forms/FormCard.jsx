import { Link } from 'react-router-dom'
import Tag from '../ui/Tag'
import StatusPill from '../ui/StatusPill'
import DropdownMenu from '../ui/DropdownMenu'
import FormIcon from './FormIcon'
import { useT } from '../../i18n/context'
import { relativeTime } from '../../lib/forms/format'

/**
 * One form on the forms list (3.4). The whole card opens the builder; the menu holds the rest.
 * Below 640px it is the phone frame's short row: icon, name, status and answers, and the menu. One grid places
 * the same elements for both, so the programme, languages and footer are only hidden on the phone.
 */
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
    <article className="relative grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-card border border-border bg-surface p-3 transition-shadow hover:shadow-card focus-within:ring-2 focus-within:ring-primary sm:auto-rows-min sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-1.5 sm:gap-y-1.5 sm:px-4">
      <FormIcon phoneRow className="col-start-1 row-span-2 row-start-1 sm:col-span-2 sm:row-span-1" />
      <h3 className="col-start-2 row-start-1 truncate font-body text-[14px] font-bold leading-5 text-text sm:col-start-1 sm:row-start-2" title={form.name}>
        <Link to={`/forms/${form.id}`} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none">
          {form.name}
        </Link>
      </h3>
      <div className="relative z-10 col-start-3 row-span-2 row-start-1 -mr-1.5 sm:col-start-2 sm:row-span-1 sm:row-start-2 sm:-my-1.5">
        <DropdownMenu label={t('forms.menu', { name: form.name })} items={actions} />
      </div>
      <p className="hidden truncate text-[12px] leading-[18px] text-muted sm:col-span-2 sm:row-start-3 sm:block">
        {programs.length ? programs.map((p) => p.title).join(', ') : t('forms.notLinked')}
      </p>
      <div className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 sm:col-span-2 sm:col-start-1 sm:row-start-4">
        <StatusPill status={form.status} />
        {(form.languages ?? []).length > 0 && (
          <Tag tone="neutral" className="hidden sm:inline-flex">
            <span aria-hidden>{form.languages.map((l) => l.toUpperCase()).join(' · ')}</span>
            <span className="sr-only">{t('forms.languages', { list: form.languages.map((l) => t(`lang.${l}`)).join(', ') })}</span>
          </Tag>
        )}
        <span className="whitespace-nowrap text-[12px] leading-[18px] text-muted sm:ml-auto sm:text-text">
          {answers === 0 ? (
            <>
              <span className="sm:hidden">{t('forms.noAnswers')}</span>
              <span className="hidden sm:inline">
                <span aria-hidden>–</span>
                <span className="sr-only">{t('forms.noAnswers')}</span>
              </span>
            </>
          ) : answers === 1 ? t('forms.answersOne') : t('forms.answers', { count: answers.toLocaleString('en-BW') })}
        </span>
      </div>
      <p className="hidden truncate text-[12px] leading-[18px] text-muted sm:col-span-2 sm:row-start-5 sm:block">{facts.join(' · ')}</p>
    </article>
  )
}
