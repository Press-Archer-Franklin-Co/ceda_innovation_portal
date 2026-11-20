import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Handshake } from 'lucide-react'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import ErrorState from '../ui/ErrorState'
import Modal from '../ui/Modal'
import SectionCard from '../ui/SectionCard'
import Skeleton from '../ui/Skeleton'
import StatusPill from '../ui/StatusPill'
import Textarea from '../ui/Textarea'
import { useToast } from '../ui/toast'
import { useI18n } from '../../i18n/context'
import { useRefreshHint, useRelatedIdeas, useSuggestIntroduction } from '../../lib/queries/assistant'

/** C3: similar and complementary ideas for one submission. The parent shows this tab only when it is on. */
export default function RelatedIdeas({ submissionId }) {
  const { t, lang } = useI18n()
  const related = useRelatedIdeas(submissionId, lang)
  const refresh = useRefreshHint()
  const [suggesting, setSuggesting] = useState(null)

  if (related.isLoading) {
    return (
      <SectionCard title={t('ai.related.tab')}>
        <div className="space-y-3" role="status" aria-label={t('ai.related.loading')}>
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </SectionCard>
    )
  }
  if (related.isError) return <ErrorState framed message={t('ai.related.failed')} onRetry={() => related.refetch()} retrying={related.isFetching} />
  const data = related.data
  if (!data?.available) return <EmptyState framed title={t('ai.related.empty')} />

  const none = !data.similar.length && !data.complementary.length

  return (
    <div className="space-y-5">
      <SectionCard
        title={t('ai.related.tab')}
        subtitle={t('ai.related.intro')}
        actions={
          <Button size="sm" variant="ghost" loading={refresh.isPending} onClick={() => refresh.mutate({ id: submissionId, lang, what: 'related' })}>
            {t('ai.card.refresh')}
          </Button>
        }
      >
        <p className="inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">{data.label || t('ai.suggestion')}</p>
        {none && <p className="mt-3 text-sm text-ceda-dark">{t('ai.related.empty')}</p>}
      </SectionCard>
      {!none && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Group title={t('ai.related.similar')} empty={t('ai.related.noneSimilar')} items={data.similar} kind="similar" onSuggest={setSuggesting} />
          <Group title={t('ai.related.complementary')} empty={t('ai.related.noneComplementary')} items={data.complementary} kind="complementary" onSuggest={setSuggesting} />
        </div>
      )}
      <SuggestDialog submissionId={submissionId} target={suggesting} onClose={() => setSuggesting(null)} />
    </div>
  )
}

function Group({ title, empty, items, kind, onSuggest }) {
  const { t } = useI18n()
  return (
    <SectionCard title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-ceda-muted">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <IdeaRow key={item.id} item={item} kind={kind} onSuggest={onSuggest} t={t} />
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function IdeaRow({ item, kind, onSuggest, t }) {
  const button = useRef(null)
  return (
    <li className="rounded-lg border border-ceda-border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link to={`/submissions/${item.id}`} className="min-w-0 font-semibold text-ceda-dark hover:underline">
          {item.title}
        </Link>
        <StatusPill status={item.status} />
      </div>
      <p className="mt-0.5 text-xs text-ceda-muted">{[item.reference_number, item.sector, item.district].filter(Boolean).join(' · ')}</p>
      {item.why && <p className="mt-2 text-ceda-dark">{item.why}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {item.has_account ? (
          <Button ref={button} size="sm" variant="secondary" icon={<Handshake size={14} aria-hidden />} onClick={() => onSuggest({ ...item, kind, trigger: button })}>
            {t('ai.related.suggest')}
          </Button>
        ) : (
          <span className="text-xs text-ceda-muted">{t('ai.related.noAccount')}</span>
        )}
      </div>
    </li>
  )
}

function SuggestDialog({ submissionId, target, onClose }) {
  const { t } = useI18n()
  const toast = useToast()
  const suggest = useSuggestIntroduction()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  function close() {
    setReason('')
    setError('')
    suggest.reset()
    onClose()
  }

  async function send() {
    if (!reason.trim()) return setError(t('ai.related.reasonHint'))
    try {
      await suggest.mutateAsync({ id: submissionId, body: { other_submission: target.id, kind: target.kind, reason } })
      toast.show({ title: t('ai.related.sent'), tone: 'success' })
      close()
    } catch (err) {
      setError(err?.data?.errors?.other_submission?.[0] ?? err?.message ?? t('ai.admin.saveFailed'))
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={close}
      triggerRef={target?.trigger}
      title={t('ai.related.modalTitle')}
      description={t('ai.related.modalBody')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>{t('ai.related.cancel')}</Button>
          <Button onClick={send} loading={suggest.isPending}>{t('ai.related.send')}</Button>
        </div>
      }
    >
      <Textarea
        label={t('ai.related.reason')}
        hint={t('ai.related.reasonHint')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        maxChars={600}
        error={error || undefined}
      />
      {target?.why && <p className="mt-3 text-xs text-ceda-muted">{t('ai.suggestion')}: {target.why}</p>}
    </Modal>
  )
}
