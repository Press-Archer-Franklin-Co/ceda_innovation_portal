import React, { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import SectionCard from '../../../components/ui/SectionCard'
import { SkeletonCards } from '../../../components/ui/LoadingSkeleton'
import ErrorState from '../../../components/ui/ErrorState'
import { cn } from '../../../lib/cn'
import { useFeatureFlags, useSetFeatureFlag } from '../../../lib/queries/platform'
import { ErrorBanner } from './shared'
import { formatWhen } from './utils'

const GROUP_ORDER = ['sign_in', 'ideas', 'website', 'messaging', 'integrations']

function Switch({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-ceda-green focus:ring-offset-2',
        checked ? 'bg-ceda-forest' : 'bg-ceda-border',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

function FlagRow({ flag, onToggle, busy }) {
  const locked = flag.coming_soon
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-ceda-border/60 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-ceda-dark">{flag.label}</p>
          {locked && (
            <span className="badge bg-status-pending-bg text-status-pending-text">
              <Lock size={10} /> Coming soon
            </span>
          )}
        </div>
        {flag.description && <p className="text-xs text-ceda-muted mt-0.5">{flag.description}</p>}
        <p className="text-[11px] text-ceda-muted/80 mt-1">
          {flag.updated_by ? `Changed by ${flag.updated_by.name}, ${formatWhen(flag.updated_at)}` : 'Default setting'}
        </p>
      </div>
      <Switch
        checked={flag.enabled}
        disabled={locked || busy}
        label={`${flag.enabled ? 'Turn off' : 'Turn on'} ${flag.label}`}
        onChange={(next) => onToggle(flag, next)}
      />
    </div>
  )
}

export default function FeaturesTab() {
  const { data: flags, isLoading, error, refetch } = useFeatureFlags()
  const setFlag = useSetFeatureFlag()
  const [problem, setProblem] = useState(null)

  const groups = useMemo(() => {
    const byGroup = {}
    for (const flag of flags ?? []) {
      byGroup[flag.group] = byGroup[flag.group] ?? { label: flag.group_label, items: [] }
      byGroup[flag.group].items.push(flag)
    }
    return GROUP_ORDER.filter((key) => byGroup[key]).map((key) => ({ key, ...byGroup[key] }))
  }, [flags])

  const onToggle = (flag, enabled) => {
    if (!enabled && flag.group === 'sign_in') {
      const ok = window.confirm(
        `Turn off "${flag.label}"? People who use it will not be able to sign in until it is turned back on.`,
      )
      if (!ok) return
    }
    setProblem(null)
    setFlag.mutate({ key: flag.key, enabled }, { onError: (err) => setProblem(err) })
  }

  if (isLoading) return <SkeletonCards count={3} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  return (
    <div className="space-y-4">
      <ErrorBanner error={problem} />
      {groups.map((group) => (
        <SectionCard key={group.key} title={group.label}>
          <div className="-my-3">
            {group.items.map((flag) => (
              <FlagRow key={flag.key} flag={flag} onToggle={onToggle} busy={setFlag.isPending} />
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  )
}
