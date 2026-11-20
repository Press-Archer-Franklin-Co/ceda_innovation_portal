import { useState } from 'react'
import { Play } from 'lucide-react'
import Button from '../ui/Button'
import SectionCard from '../ui/SectionCard'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import { useI18n } from '../../i18n/context'
import { useTryIt } from '../../lib/queries/assistant'

const FEATURES = ['draft_check', 'hints', 'help']
const FEATURE_LABEL = { draft_check: 'ai.usage.feature.draft_check', hints: 'ai.usage.feature.hints', help: 'ai.usage.feature.help' }

/** Run a part of the helper on sample text, with guidance that is not saved yet. */
export default function TryItTab() {
  const { t, lang } = useI18n()
  const tryIt = useTryIt()
  const [feature, setFeature] = useState('draft_check')
  const [text, setText] = useState('')
  const [guidance, setGuidance] = useState('')
  const [empty, setEmpty] = useState(false)

  function run(e) {
    e.preventDefault()
    if (!text.trim()) return setEmpty(true)
    setEmpty(false)
    tryIt.mutate({ feature, text, guidance, lang })
  }

  const result = tryIt.data
  const outcome = result && !result.available ? t(`ai.outcome.${result.reason}`) : ''

  return (
    <div className="grid gap-[14px] lg:grid-cols-2">
      <SectionCard title={t('ai.admin.tabTry')} subtitle={t('ai.try.intro')}>
        <form onSubmit={run} className="space-y-3">
          <Select
            label={t('ai.try.feature')}
            options={FEATURES.map((value) => ({ value, label: t(FEATURE_LABEL[value]) }))}
            value={feature}
            onChange={(value) => { setFeature(value); tryIt.reset() }}
          />
          <Textarea
            label={t('ai.try.text')}
            hint={t(`ai.try.textHint.${feature}`)}
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={empty ? t('ai.kb.needText') : undefined}
            rows={6}
            maxChars={8000}
          />
          <Textarea label={t('ai.try.guidance')} value={guidance} onChange={(e) => setGuidance(e.target.value)} rows={3} maxChars={4000} optional />
          <Button type="submit" loading={tryIt.isPending} icon={<Play size={14} aria-hidden />}>{t('ai.try.run')}</Button>
        </form>
      </SectionCard>

      <SectionCard title={t('ai.try.result')}>
        <div aria-live="polite" className="text-sm text-ceda-dark">
          {tryIt.isError && <p role="alert">{t('ai.try.failed')}</p>}
          {result && !result.available && (
            <p>{t('ai.try.unavailable', { reason: outcome.startsWith('ai.outcome.') ? t('ai.outcome.unknown') : outcome })}</p>
          )}
          {result?.available && <TryResult feature={tryIt.variables?.feature} data={result} />}
        </div>
      </SectionCard>
    </div>
  )
}

function List({ title, items }) {
  if (!items?.length) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ceda-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    </div>
  )
}

function TryResult({ feature, data }) {
  const { t } = useI18n()
  if (feature === 'help') {
    return (
      <div className="space-y-3">
        <p className="whitespace-pre-line">{data.answer}</p>
        {(data.screenshots ?? []).map((shot) => (
          <figure key={shot.id}>
            <img src={shot.url} alt={shot.caption} className="h-auto w-full rounded border border-ceda-border" />
            {shot.caption && <figcaption className="mt-1 text-xs text-ceda-muted">{shot.caption}</figcaption>}
          </figure>
        ))}
      </div>
    )
  }
  if (feature === 'hints') {
    return (
      <div className="space-y-3">
        <List title={t('ai.card.summary')} items={data.summary} />
        <List title={t('ai.card.strengths')} items={data.strengths} />
        <List title={t('ai.card.check')} items={data.points_to_check} />
        {data.next_step && <List title={t('ai.card.next')} items={[data.next_step]} />}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <List title={t('ai.try.unclear')} items={(data.unclear ?? []).map((item) => (item.quote ? `"${item.quote}": ${item.suggestion}` : item.suggestion))} />
      <List title={t('ai.try.missing')} items={(data.missing ?? []).map((item) => item.what)} />
      <List title={t('ai.try.questions')} items={data.officer_questions} />
      <List title={t('ai.try.clear')} items={data.clear} />
    </div>
  )
}
