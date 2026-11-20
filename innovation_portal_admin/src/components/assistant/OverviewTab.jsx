import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import Button from '../ui/Button'
import { Toggle } from '../ui/Choice'
import DataTable from '../ui/DataTable'
import ErrorState from '../ui/ErrorState'
import Input from '../ui/Input'
import SectionCard from '../ui/SectionCard'
import Skeleton from '../ui/Skeleton'
import { useToast } from '../ui/toast'
import { useAuth } from '../../lib/auth/AuthContext'
import { useI18n } from '../../i18n/context'
import { useAssistantOverview, useAssistantUsage, useSaveAssistantSettings } from '../../lib/queries/assistant'

const SWITCHES = ['feature_draft_check', 'feature_hints', 'feature_related', 'feature_help', 'feature_web_chat', 'allow_guests_help']
const KNOWN_STATES = ['waiting_for_key', 'not_active', 'key_failed', 'switched_off', 'limit_reached', 'ready']
const STATE_TONE = {
  ready: 'bg-success-soft text-success',
  limit_reached: 'bg-warning-soft text-warning',
  switched_off: 'bg-surface2 text-text',
}

export default function OverviewTab() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const overview = useAssistantOverview(lang)
  const usage = useAssistantUsage(30)
  const save = useSaveAssistantSettings()
  const [limit, setLimit] = useState(null)

  if (overview.isLoading) {
    return (
      <div className="grid gap-[14px] lg:grid-cols-2" role="status">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (overview.isError) return <ErrorState framed onRetry={() => overview.refetch()} retrying={overview.isFetching} />

  const data = overview.data
  const state = KNOWN_STATES.includes(data.state) ? data.state : 'not_active'
  const settings = data.settings ?? {}
  const month = usage.data?.month
  const hasConnection = Boolean(data.connection)

  async function change(body) {
    try {
      await save.mutateAsync(body)
      toast.show({ title: t('ai.admin.saved'), tone: 'success' })
    } catch {
      toast.show({ title: t('ai.admin.saveFailed'), tone: 'error' })
    }
  }

  const featureRows = (usage.data?.by_feature ?? []).map((row) => ({
    ...row,
    name: t(`ai.usage.feature.${row.feature}`) === `ai.usage.feature.${row.feature}` ? t('ai.outcome.unknown') : t(`ai.usage.feature.${row.feature}`),
    cost: `$${Number(row.cost_usd).toFixed(2)}`,
  }))

  return (
    <div className="space-y-[14px] 2xl:space-y-[22px]">
      <div className="grid gap-[14px] lg:grid-cols-2">
        <SectionCard title={t('ai.card.title')}>
          <div className="flex flex-col gap-3 text-sm">
            <span className={`inline-flex self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_TONE[state] ?? 'bg-warning-soft text-warning'}`}>
              {t(`ai.state.${state}`)}
            </span>
            <p className="text-ceda-dark">{t(`ai.state.help.${state}`)}</p>
            {data.connection?.model && <p className="text-xs text-ceda-muted">{t('ai.admin.model', { model: data.connection.model })}</p>}
            {state !== 'ready' && state !== 'switched_off' && state !== 'limit_reached' && can('settings.manage') && (
              <Link to="/admin/platform?tab=ai" className="self-start text-sm font-semibold text-primary hover:underline">{t('ai.admin.openSettings')}</Link>
            )}
            <Toggle
              label={t('ai.admin.helperOn')}
              checked={Boolean(data.helper_on)}
              disabled={save.isPending}
              onChange={(value) => change({ helper_on: value })}
            />
          </div>
        </SectionCard>

        <SectionCard title={t('ai.admin.spend')}>
          {usage.isLoading ? (
            <Skeleton className="h-20" />
          ) : usage.isError ? (
            <ErrorState compact onRetry={() => usage.refetch()} />
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <p className="font-heading text-2xl text-ceda-dark">
                {month?.limit_usd != null ? t('ai.admin.spendOf', { spend: month.spend_usd, limit: month.limit_usd }) : `$${month?.spend_usd ?? '0.00'}`}
              </p>
              <p className="text-ceda-muted">
                {month?.left_usd != null ? t('ai.admin.left', { left: month.left_usd }) : t('ai.admin.noLimit')} · {t('ai.admin.calls', { count: month?.calls ?? 0 })}
              </p>
              {hasConnection && (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (limit !== null && limit !== '') change({ monthly_limit_usd: limit })
                  }}
                >
                  <Input
                    label={t('ai.admin.limit')}
                    type="number"
                    min="0"
                    step="1"
                    value={limit ?? String(settings.monthly_limit_usd ?? '')}
                    onChange={(e) => setLimit(e.target.value)}
                    fieldClassName="w-48"
                  />
                  <Button type="submit" size="sm" variant="secondary" loading={save.isPending && limit !== null}>{t('ai.admin.saveLimit')}</Button>
                </form>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {hasConnection && (
        <SectionCard title={t('ai.admin.features')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {SWITCHES.map((key) => (
              <Toggle
                key={key}
                label={t(`ai.feature.${key}`)}
                checked={Boolean(settings[key])}
                disabled={save.isPending}
                onChange={(value) => change({ [key]: value })}
              />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={t('ai.admin.byFeature')}>
        <DataTable
          columns={[
            { key: 'name', label: t('ai.admin.colPart') },
            { key: 'calls', label: t('ai.admin.colCalls'), align: 'right' },
            { key: 'skipped', label: t('ai.admin.colSkipped'), align: 'right' },
            { key: 'cost', label: t('ai.admin.colCost'), align: 'right' },
          ]}
          data={featureRows}
          loading={usage.isLoading}
          error={usage.isError ? t('ai.card.failed') : undefined}
          onRetry={() => usage.refetch()}
          emptyTitle={t('ai.admin.noUsage')}
        />
        {(usage.data?.recent_problems ?? []).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ceda-muted">{t('ai.admin.problems')}</p>
            <ul className="mt-2 space-y-1 text-sm text-ceda-dark">
              {usage.data.recent_problems.map((item, i) => {
                const outcome = t(`ai.outcome.${item.outcome}`)
                return (
                  <li key={i}>
                    {new Date(item.at).toLocaleString(lang === 'tn' ? 'en-BW' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                    {t(`ai.usage.feature.${item.feature}`)} · {outcome.startsWith('ai.outcome.') ? t('ai.outcome.unknown') : outcome}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck size={15} aria-hidden className="text-success" />
            {t('ai.admin.privacy')}
          </span>
        }
      >
        <p className="text-sm text-ceda-dark">{data.privacy_note}</p>
      </SectionCard>
    </div>
  )
}
