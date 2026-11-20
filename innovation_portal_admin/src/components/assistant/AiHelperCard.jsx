import { Sparkles } from 'lucide-react'
import Button from '../ui/Button'
import SectionCard from '../ui/SectionCard'
import ErrorState from '../ui/ErrorState'
import Skeleton from '../ui/Skeleton'
import { useAuth } from '../../lib/auth/AuthContext'
import { useI18n } from '../../i18n/context'
import { useAssistantStatus, useRefreshHint, useSubmissionHints } from '../../lib/queries/assistant'

/**
 * C3: the AI helper card on a submission. Shown only to people with assistant.hints while the
 * hints part is on. When the helper has no answer ({available: false}) the card is not shown.
 */
export default function AiHelperCard({ submissionId }) {
  const { can } = useAuth()
  const { t, lang } = useI18n()
  const allowed = can('assistant.hints')
  const status = useAssistantStatus({ enabled: allowed })
  const on = allowed && Boolean(status.data?.features?.hints)
  const hints = useSubmissionHints(submissionId, lang, { enabled: on })
  const refresh = useRefreshHint()

  if (!on) return null
  if (hints.isSuccess && !hints.data?.available) return null

  const data = hints.data?.available ? hints.data : null

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={15} aria-hidden className="text-accent" />
          {t('ai.card.title')}
        </span>
      }
      subtitle={t('ai.card.subtitle')}
      actions={
        data && (
          <Button size="sm" variant="ghost" loading={refresh.isPending} onClick={() => refresh.mutate({ id: submissionId, lang, what: 'hints' })}>
            {t('ai.card.refresh')}
          </Button>
        )
      }
    >
      {hints.isLoading && (
        <div className="space-y-2" aria-label={t('ai.card.loading')} role="status">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
          <Skeleton className="h-3 w-full" />
        </div>
      )}
      {hints.isError && (
        <ErrorState compact message={t('ai.card.failed')} onRetry={() => hints.refetch()} retrying={hints.isFetching} />
      )}
      {data && (
        <div className="space-y-4 text-sm text-ceda-dark">
          <p className="inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">{data.label || t('ai.suggestion')}</p>
          <Block title={t('ai.card.summary')} items={data.summary} />
          <Block title={t('ai.card.strengths')} items={data.strengths} />
          <Block title={t('ai.card.check')} items={data.points_to_check} />
          {data.next_step && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ceda-muted">{t('ai.card.next')}</p>
              <p className="mt-1">{data.next_step}</p>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}

function Block({ title, items }) {
  if (!items?.length) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ceda-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  )
}
