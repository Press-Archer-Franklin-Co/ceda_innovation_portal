import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import SectionCard from '../../../components/ui/SectionCard'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import Tag from '../../../components/ui/Tag'
import Skeleton from '../../../components/ui/Skeleton'
import ErrorState from '../../../components/ui/ErrorState'
import ForbiddenState from '../../../components/ui/ForbiddenState'
import { Toggle } from '../../../components/ui/Choice'
import { buttonClasses } from '../../../components/ui/buttonClasses'
import { useConfirm } from '../../../components/ui/confirm'
import { useToast } from '../../../components/ui/toast'
import { useT } from '../../../i18n/context'
import { cn } from '../../../lib/cn'
import { siteSettings } from '../../../lib/api/websiteContent'
import { useFeatureFlags, useSetFeatureFlag, useSetSignInSettings, useSignInSettings } from '../../../lib/queries/platform'

// 3.26 Platform settings (Figma 122:1475 website, 122:1833 phone). ① Tabs keep settings short. ② Sign-in: one page
// for everyone; the owner picks the second step. A one-time code needs SMS, WhatsApp or email active in Integrations.
// ③ Feature switches: a feature that needs a key shows "Needs setup" and stays hidden on the site until its
// connection is active. ④ Demo: Test accounts on the sign-in page. Every change is written to the audit log (API).

const TABS = ['general', 'signin', 'languages']
const SIGN_IN_GROUP = 'sign_in'
const DEMO_FLAG = 'demo_logins'

function Segmented({ label, value, options, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-grid grid-cols-2 gap-1 rounded-control bg-surface2 p-1">
      {options.map((o) => (
        <label key={o.value} className={cn(
          'flex min-h-[34px] cursor-pointer items-center justify-center rounded-control px-3 text-[13px] font-semibold focus-within:ring-2 focus-within:ring-primary',
          value === o.value ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
          (disabled || o.disabled) && 'cursor-not-allowed opacity-60',
        )}>
          <input type="radio" className="sr-only" name={label} value={o.value} checked={value === o.value} disabled={disabled || o.disabled} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  )
}

/** One switch row. needs_setup (U9 API) shows "Needs setup" and a Set up link instead of the switch. */
function FlagRow({ flag, busy, onToggle, tag }) {
  const t = useT()
  if (flag.needs_setup) {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="min-w-0">
          <span className="block text-[13px] text-text">{flag.label}</span>
          {flag.description && <span className="block text-[12px] text-muted">{flag.description}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <Tag tone="amber">{t('ps.features.needsSetup')}</Tag>
          <Link to="/admin/integrations" className="hidden text-[13px] font-bold text-primary hover:underline sm:inline">{t('ps.features.setUp')}</Link>
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 py-1">
      <Toggle className="min-w-0 flex-1" label={flag.label} description={flag.description} checked={!!flag.enabled}
        disabled={busy || flag.coming_soon} onChange={(next) => onToggle(flag, next)} />
      {flag.coming_soon && <Tag>{t('ps.features.comingSoon')}</Tag>}
      {tag}
    </div>
  )
}

function SignInTab() {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const flags = useFeatureFlags()
  const setFlag = useSetFeatureFlag()
  const signIn = useSignInSettings({ retry: false })
  const setSignIn = useSetSignInSettings()

  if (flags.error?.status === 403 || signIn.error?.status === 403) return <ForbiddenState title={t('ps.forbidden')} />
  if (flags.isError) return <ErrorState title={t('ps.loadError')} onRetry={() => flags.refetch()} />
  if (flags.isLoading || signIn.isLoading) {
    return <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-60 rounded-card" /><Skeleton className="h-72 rounded-card" /></div>
  }

  const list = flags.data ?? []
  const signInFlags = list.filter((f) => f.group === SIGN_IN_GROUP && f.key !== DEMO_FLAG)
  const featureFlags = list.filter((f) => f.group !== SIGN_IN_GROUP)
  const demo = list.find((f) => f.key === DEMO_FLAG)
  const second = signIn.data?.second_step ?? 'code'
  // U9 API (R-65): code_available. Until it is sent, nothing is blocked here; the API still checks.
  const codeBlocked = signIn.data?.code_available === false

  const failed = (e) => toast.show({ tone: 'error', title: t('ps.failed', { message: e?.message ?? '' }) })
  const done = () => toast.show({ tone: 'success', title: t('ps.saved') })
  const toggle = async (flag, enabled) => {
    if (!enabled && flag.group === SIGN_IN_GROUP && flag.key !== DEMO_FLAG) {
      const ok = await confirm({ title: t('ps.signIn.turnOffTitle', { name: flag.label }), body: t('ps.signIn.turnOffBody'), confirmLabel: t('ps.signIn.turnOff') })
      if (!ok) return
    }
    setFlag.mutate({ key: flag.key, enabled }, { onSuccess: done, onError: failed })
  }
  const chooseStep = (value) => {
    if (value === second || setSignIn.isPending) return
    setSignIn.mutate({ second_step: value }, { onSuccess: done, onError: failed })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard title={t('ps.signIn.title')} subtitle={t('ps.signIn.body')}>
          <div className="flex flex-col gap-3">
            {signIn.isError ? (
              <ErrorState title={t('ps.loadError')} onRetry={() => signIn.refetch()} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-text">{t('ps.signIn.secondStep')}</span>
                <Segmented label={t('ps.signIn.secondStep')} value={second} onChange={chooseStep} disabled={setSignIn.isPending}
                  options={[{ value: 'password', label: t('ps.signIn.password') }, { value: 'code', label: t('ps.signIn.code'), disabled: codeBlocked && second !== 'code' }]} />
              </div>
            )}
            {codeBlocked && (
              <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2.5 text-[12px] text-text" role="note">
                <CircleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                <span>{t('ps.signIn.codeNeeds')} <Link to="/admin/integrations" className="font-bold text-primary hover:underline">{t('ps.integrations')}</Link></span>
              </p>
            )}
            <div className="flex flex-col divide-y divide-border">
              {signInFlags.map((f) => <FlagRow key={f.key} flag={f} busy={setFlag.isPending} onToggle={toggle} />)}
            </div>
          </div>
        </SectionCard>
        <SectionCard title={t('ps.features.title')} subtitle={t('ps.features.body')}>
          <div className="flex flex-col divide-y divide-border">
            {featureFlags.map((f) => <FlagRow key={f.key} flag={f} busy={setFlag.isPending} onToggle={toggle} />)}
          </div>
        </SectionCard>
      </div>
      {demo && (
        <SectionCard title={t('ps.demo.title')} subtitle={t('ps.demo.body')}>
          <FlagRow flag={demo} busy={setFlag.isPending} onToggle={toggle} tag={<Tag tone="amber">{t('ps.demo.tag')}</Tag>} />
        </SectionCard>
      )}
    </div>
  )
}

const GENERAL_FIELDS = [
  { key: 'whatsapp_number', label: 'ps.general.whatsapp', type: 'tel', placeholder: '+267 71 234 567' },
  { key: 'ussd_code', label: 'ps.general.ussd', type: 'text', placeholder: '*123#' },
  { key: 'call_centre_number', label: 'ps.general.callCentre', type: 'tel', placeholder: '+267 317 0895' },
  { key: 'office_finder_url', label: 'ps.general.officeFinder', type: 'url', placeholder: 'https://' },
  { key: 'help_centre_url', label: 'ps.general.helpCentre', type: 'text', placeholder: '/faq' },
  { key: 'accessibility_url', label: 'ps.general.accessibility', type: 'text', placeholder: '/accessibility' },
]

function useSite() {
  return useQuery({ queryKey: ['content', 'site-settings'], queryFn: () => siteSettings.get() })
}
function useSaveSite() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (body) => siteSettings.update(body), onSuccess: (data) => { qc.setQueryData(['content', 'site-settings'], data); qc.invalidateQueries({ queryKey: ['platform'] }) } })
}

function GeneralTab() {
  const t = useT()
  const toast = useToast()
  const site = useSite()
  const save = useSaveSite()
  const [form, setForm] = useState(null)
  useEffect(() => { if (site.data) setForm(Object.fromEntries(GENERAL_FIELDS.map((f) => [f.key, site.data[f.key] ?? '']))) }, [site.data])

  if (site.error?.status === 403) return <ForbiddenState title={t('ps.forbidden')} />
  if (site.isError) return <ErrorState title={t('ps.loadError')} onRetry={() => site.refetch()} />
  if (!form) return <Skeleton className="h-80 max-w-3xl rounded-card" />

  const dirty = GENERAL_FIELDS.some((f) => (site.data?.[f.key] ?? '') !== form[f.key])
  const submit = (e) => {
    e.preventDefault()
    save.mutate(form, {
      onSuccess: () => toast.show({ tone: 'success', title: t('ps.saved') }),
      onError: (err) => toast.show({ tone: 'error', title: t('ps.failed', { message: err?.message ?? '' }) }),
    })
  }
  return (
    <form onSubmit={submit} className="max-w-3xl">
      <SectionCard title={t('ps.general.title')} subtitle={t('ps.general.body')}
        footer={(
          <div className="flex items-center justify-end gap-3">
            {dirty && <span className="text-[12px] text-muted" role="status">{t('ps.general.unsaved')}</span>}
            <Button type="submit" loading={save.isPending} disabled={!dirty}>{t('ps.general.save')}</Button>
          </div>
        )}>
        <div className="grid gap-4 sm:grid-cols-2">
          {GENERAL_FIELDS.map((f) => (
            <Input key={f.key} label={t(f.label)} type={f.type} optional placeholder={f.placeholder} value={form[f.key]}
              onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} />
          ))}
        </div>
      </SectionCard>
    </form>
  )
}

function LanguagesTab() {
  const t = useT()
  const toast = useToast()
  const site = useSite()
  const save = useSaveSite()
  if (site.error?.status === 403) return <ForbiddenState title={t('ps.forbidden')} />
  if (site.isError) return <ErrorState title={t('ps.loadError')} onRetry={() => site.refetch()} />
  if (site.isLoading) return <Skeleton className="h-48 max-w-3xl rounded-card" />
  const enabled = site.data?.languages_enabled?.length ? site.data.languages_enabled : ['en', 'tn']
  const setTn = (on) => save.mutate({ languages_enabled: on ? ['en', 'tn'] : ['en'] }, {
    onSuccess: () => toast.show({ tone: 'success', title: t('ps.saved') }),
    onError: (err) => toast.show({ tone: 'error', title: t('ps.failed', { message: err?.message ?? '' }) }),
  })
  return (
    <div className="max-w-3xl">
      <SectionCard title={t('ps.lang.title')} subtitle={t('ps.lang.body')}>
        <div className="flex flex-col divide-y divide-border">
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-[13px] text-text">{t('ps.lang.en')}</span>
            <Tag tone="green">{t('ps.lang.always')}</Tag>
          </div>
          <Toggle className="py-1" label={t('ps.lang.tn')} checked={enabled.includes('tn')} disabled={save.isPending} onChange={setTn} />
        </div>
      </SectionCard>
    </div>
  )
}

export default function PlatformSettings() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'signin'
  const tabs = useMemo(() => [
    { key: 'general', label: t('ps.tab.general') },
    { key: 'signin', label: t('ps.tab.signIn') },
    { key: 'languages', label: t('ps.tab.languages') },
  ], [t])
  return (
    <div>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('staff.group.admin')} / {t('ps.crumb')}</span>}
        title={t('ps.title')}
        subtitle={t('ps.subtitle')}
        actions={<Link to="/admin/integrations" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t('ps.integrations')}</Link>}
      />
      <Tabs tabs={tabs} active={tab} onChange={(key) => setParams(key === 'signin' ? {} : { tab: key }, { replace: true })} label={t('ps.title')} className="mb-4" />
      {tab === 'general' && <GeneralTab />}
      {tab === 'signin' && <SignInTab />}
      {tab === 'languages' && <LanguagesTab />}
    </div>
  )
}
