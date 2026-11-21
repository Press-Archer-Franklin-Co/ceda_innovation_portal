import React from 'react'
import clsx from 'clsx'
import SectionCard from '../../../components/ui/SectionCard'
import { SkeletonCards } from '../../../components/ui/LoadingSkeleton'
import ErrorState from '../../../components/ui/ErrorState'
import { useT } from '../../../i18n/context'
import { useToast } from '../../../components/ui/toast'
import { useSetSignInSettings, useSignInSettings } from '../../../lib/queries/platform'

const OPTIONS = [
  { value: 'code', label: 'platform.signIn.code', help: 'platform.signIn.codeHelp' },
  { value: 'password', label: 'platform.signIn.password', help: 'platform.signIn.passwordHelp' },
]

/** U7: the one second step everyone uses after typing their phone number or email. */
export default function SignInSetting() {
  const t = useT()
  const toast = useToast()
  const { data, isLoading, error, refetch } = useSignInSettings()
  const save = useSetSignInSettings()

  if (isLoading) return <SkeletonCards count={1} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const current = data?.second_step ?? 'code'
  const choose = (value) => {
    if (value === current || save.isPending) return
    save.mutate(
      { second_step: value },
      {
        onSuccess: () => toast.show({ tone: 'success', title: t('platform.signIn.saved') }),
        onError: (err) => toast.show({ tone: 'error', title: err?.message || t('platform.signIn.saveError') }),
      },
    )
  }

  return (
    <SectionCard title={t('platform.signIn.title')}>
      <p className="mb-3 text-[13px] text-muted">{t('platform.signIn.subtitle')}</p>
      <div role="radiogroup" aria-label={t('platform.signIn.title')} className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={clsx(
              'flex cursor-pointer items-start gap-3 rounded-control border p-3 focus-within:ring-2 focus-within:ring-primary',
              current === option.value ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface2',
              save.isPending && 'cursor-wait opacity-70',
            )}
          >
            <input
              type="radio"
              name="auth-second-step"
              className="mt-1 accent-primary"
              checked={current === option.value}
              disabled={save.isPending}
              onChange={() => choose(option.value)}
            />
            <span>
              <span className="block text-[13px] font-semibold text-text">{t(option.label)}</span>
              <span className="mt-0.5 block text-[12px] text-muted">{t(option.help)}</span>
            </span>
          </label>
        ))}
      </div>
    </SectionCard>
  )
}
