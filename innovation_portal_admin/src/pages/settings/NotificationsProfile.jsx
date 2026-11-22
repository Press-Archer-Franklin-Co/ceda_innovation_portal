import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Calendar, Eye, Megaphone, MessageCircle, Trophy } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import Avatar from '../../components/ui/Avatar'
import Input from '../../components/ui/Input'
import Skeleton from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { Checkbox } from '../../components/ui/Choice'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { useAuth } from '../../lib/auth/AuthContext'
import { client } from '../../lib/api/client'
import { notifications as notificationsApi } from '../../lib/api/endpoints'
import { relativeTime } from '../../lib/forms/format'
import { cn } from '../../lib/cn'

// 3.39 Staff notifications and profile (Figma 141:2912 website, 141:3187 phone). ① The bell opens this list:
// unread in bold, Mark all read. ② Each item links to the right page. ③ Profile: name, language, phone (photo
// when the API has it, R-51). ④ How to be told, per type: in the portal, email or WhatsApp. Sign-in follows the one
// sign-in page; there are no password settings here. Phone: the list first, then profile and alerts.

const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const CHANNELS = ['web', 'email', 'whatsapp']
const ICONS = { deadline: Calendar, officer_message: MessageCircle, stage_change: Eye, new_challenge: Trophy, news: Megaphone, digest: Megaphone }

function NotificationList() {
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState('all')
  const list = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => notificationsApi.list() })
  const items = asList(list.data)
  const unread = items.filter((n) => !n.is_read)
  const shown = tab === 'unread' ? unread : items

  async function open(n) {
    if (!n.is_read) {
      notificationsApi.markRead(n.id).then(() => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
      }).catch(() => {})
    }
    const link = n.link || ''
    if (/^https?:\/\//.test(link)) window.open(link, '_blank', 'noopener')
    else if (link.startsWith('/staff/')) navigate(link.slice('/staff'.length))
    else if (link.startsWith('/')) window.location.assign(link)
  }

  async function markAll() {
    try {
      await notificationsApi.markAllRead()
      qc.invalidateQueries({ queryKey: ['notifications'] })
      toast.show({ tone: 'success', title: t('ntf.allRead') })
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    }
  }

  return (
    <section aria-labelledby="ntf-list" className="flex flex-col rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <h2 id="ntf-list" className="sr-only">{t('ntf.listTitle')}</h2>
        <Tabs
          variant="segment"
          label={t('ntf.listTitle')}
          idPrefix="ntf"
          tabs={[{ key: 'all', label: t('ntf.all') }, { key: 'unread', label: t('ntf.unread'), count: unread.length }]}
          active={tab}
          onChange={setTab}
        />
        <Button variant="link" size="sm" onClick={markAll} disabled={unread.length === 0}>{t('ntf.markAll')}</Button>
      </div>
      {list.isLoading ? (
        <div aria-hidden className="flex flex-col gap-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : list.isError ? (
        <ErrorState compact title={t('ntf.loadError')} message={list.error?.message} onRetry={list.refetch} className="m-3" />
      ) : shown.length === 0 ? (
        <EmptyState compact icon={Bell} title={tab === 'unread' ? t('ntf.noneUnread') : t('ntf.none')} className="m-3" />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((n) => {
            const Icon = ICONS[n.notification_type] ?? Bell
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary', !n.is_read && 'bg-primary-soft/60')}
                >
                  <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-border bg-surface text-text">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-[14px] text-text', !n.is_read && 'font-bold')}>{n.title}</span>
                    {n.body && <span className="block truncate text-[12px] text-muted">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">{relativeTime(n.created_at, t)}</span>
                  {!n.is_read && <span className="sr-only">{t('ntf.unreadItem')}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ProfileCard() {
  const t = useT()
  const { lang, setLang } = useI18n()
  const toast = useToast()
  const { user, refreshUser } = useAuth()
  const [form, setForm] = useState({ first_name: '', last_name: '', phone_number: '' })
  const [busy, setBusy] = useState(false)
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || ''

  useEffect(() => {
    setForm({ first_name: user?.first_name ?? '', last_name: user?.last_name ?? '', phone_number: user?.phone_number ?? '' })
  }, [user?.first_name, user?.last_name, user?.phone_number])

  const changed = form.first_name !== (user?.first_name ?? '') || form.last_name !== (user?.last_name ?? '') || form.phone_number !== (user?.phone_number ?? '')

  async function save(extra = {}) {
    setBusy(true)
    try {
      // TODO(R-51): PATCH /api/auth/me/. Until it lands the API answers 404 or 405 and we say so.
      await client.patch('/api/auth/me/', { first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone_number: form.phone_number.trim(), ...extra })
      await refreshUser?.()
      toast.show({ tone: 'success', title: t('ntf.profileSaved') })
    } catch (err) {
      toast.show({ tone: 'error', title: err?.status === 404 || err?.status === 405 ? t('ntf.profileNotYet') : t('common.somethingWrong'), body: err?.status === 404 || err?.status === 405 ? undefined : err?.message })
    } finally {
      setBusy(false)
    }
  }

  function chooseLanguage(next) {
    setLang(next)
    // The language is kept for the account when the API can (R-51); the screen changes at once either way.
    client.patch('/api/auth/me/', { preferred_language: next }).catch(() => {})
  }

  return (
    <section aria-labelledby="ntf-profile" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <h2 id="ntf-profile" className="text-[16px] font-bold text-text">{t('ntf.profile')}</h2>
      <div className="flex items-center gap-3">
        <Avatar name={name} src={user?.photo_url} size="lg" decorative />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-text">{name}</p>
          <p className="truncate text-[12px] text-muted">{user?.email}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label={t('ntf.firstName')} value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
        <Input label={t('ntf.lastName')} value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-bold text-text" id="ntf-lang">{t('ntf.language')}</span>
        <Tabs variant="segment" label={t('ntf.language')} idPrefix="ntf-lang" tabs={[{ key: 'en', label: 'English' }, { key: 'tn', label: 'Setswana' }]} active={lang} onChange={chooseLanguage} />
      </div>
      <Input label={t('ntf.phone')} hint={t('ntf.phoneHint')} type="tel" value={form.phone_number} onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))} />
      <Button variant="secondary" size="sm" onClick={() => save()} loading={busy} disabled={!changed} className="self-start">{t('common.save')}</Button>
    </section>
  )
}

function AlertsCard() {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const prefs = useQuery({ queryKey: ['notifications', 'preferences'], queryFn: () => client.get('/api/notifications/preferences/') })
  const [local, setLocal] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (prefs.data?.preferences) setLocal(prefs.data.preferences) }, [prefs.data])

  // TODO(R-48 item 7): the staff groups (new assignment, replies, approvals, deadlines) and the daily summary.
  // Until then: the types the API knows, in plain words; a type without words is left out, never shown raw.
  const types = useMemo(() => (prefs.data?.notification_types ?? []).map((x) => x.code).filter((code) => t(`ntf.type.${code}`) !== `ntf.type.${code}`), [prefs.data, t])
  const changed = local && prefs.data && JSON.stringify(local) !== JSON.stringify(prefs.data.preferences)

  async function save() {
    setBusy(true)
    try {
      await client.put('/api/notifications/preferences/', { preferences: local })
      qc.invalidateQueries({ queryKey: ['notifications', 'preferences'] })
      toast.show({ tone: 'success', title: t('ntf.alertsSaved') })
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="ntf-alerts" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <h2 id="ntf-alerts" className="text-[16px] font-bold text-text">{t('ntf.howToTell')}</h2>
      {prefs.isLoading || !local ? (
        prefs.isError ? <ErrorState compact title={t('ntf.alertsError')} onRetry={prefs.refetch} /> : <Skeleton className="h-40" />
      ) : (
        <>
          <div role="table" aria-label={t('ntf.howToTell')} className="flex flex-col">
            <div role="row" className="grid grid-cols-[1fr_repeat(3,64px)] items-end gap-1 pb-2 text-[12px] text-muted">
              <span role="columnheader" className="sr-only">{t('ntf.what')}</span>
              {CHANNELS.map((c) => <span key={c} role="columnheader" className="text-center">{t(`ntf.channel.${c}`)}</span>)}
            </div>
            {types.map((code) => (
              <div key={code} role="row" className="grid grid-cols-[1fr_repeat(3,64px)] items-center gap-1 border-t border-border py-2">
                <span role="rowheader" className="text-[14px] text-text">{t(`ntf.type.${code}`)}</span>
                {CHANNELS.map((c) => (
                  <span key={c} role="cell" className="flex justify-center">
                    <Checkbox
                      aria-label={`${t(`ntf.type.${code}`)}: ${t(`ntf.channel.${c}`)}`}
                      label=""
                      checked={!!local[code]?.[c]}
                      onChange={(e) => setLocal((p) => ({ ...p, [code]: { ...(p[code] ?? {}), [c]: e.target.checked } }))}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={save} loading={busy} disabled={!changed} className="self-start">{t('common.save')}</Button>
        </>
      )}
    </section>
  )
}

export default function NotificationsProfile() {
  const t = useT()
  const { user } = useAuth()
  useEffect(() => {
    document.title = `${t('ntf.title')} · CEDA Innovation`
  }, [t])
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader back={name ? <span className="text-[12px] text-muted">{name}</span> : undefined} title={t('ntf.title')} subtitle={t('ntf.subtitle')} />
      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-[22px]">
        <NotificationList />
        <div className="flex flex-col gap-[14px]">
          <ProfileCard />
          <AlertsCard />
        </div>
      </div>
    </div>
  )
}
