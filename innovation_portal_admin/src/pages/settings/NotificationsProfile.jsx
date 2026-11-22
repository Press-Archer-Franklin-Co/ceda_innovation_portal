import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Checkbox, Toggle } from '../../components/ui/Choice'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { useAuth } from '../../lib/auth/AuthContext'
import { client } from '../../lib/api/client'
import { notifications as notificationsApi } from '../../lib/api/endpoints'
import { relativeTime } from '../../lib/forms/format'
import { cn } from '../../lib/cn'

// 3.39 Staff notifications and profile (Figma 141:2912 website, 141:3187 phone). ① The bell opens this list:
// unread in bold, Mark all read. ② Each item links to the right page. ③ Profile: name, language, phone (photo
// when the API has it, R-48). ④ How to be told, per type: in the portal, email or WhatsApp. Sign-in follows the one
// sign-in page; there are no password settings here. Names come from the account (no name fields in the frame). Phone: the list first, then profile and alerts.

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
  const [form, setForm] = useState({ phone_number: '' })
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef(null)

  async function uploadPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.show({ tone: 'error', title: t('ntf.photoTooBig') }); return }
    setPhotoBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      await client.post('/api/auth/me/photo/', body)
      await refreshUser?.()
      toast.show({ tone: 'success', title: t('ntf.photoSaved') })
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    } finally {
      setPhotoBusy(false)
    }
  }
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || ''

  useEffect(() => {
    setForm({ phone_number: user?.phone_number ?? '' })
  }, [user?.phone_number])

  const changed = form.phone_number !== (user?.phone_number ?? '')

  async function save(extra = {}) {
    setBusy(true)
    try {
      // PATCH /api/auth/me/ (R-48 item 7). An API without it answers 404 or 405, and we say so.
      await client.patch('/api/auth/me/', { phone_number: form.phone_number.trim(), ...extra })
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
    // The language is kept on the account (R-48 item 7); the screen changes at once either way.
    client.patch('/api/auth/me/', { preferred_language: next }).catch(() => {})
  }

  return (
    <section aria-labelledby="ntf-profile" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <h2 id="ntf-profile" className="text-[16px] font-bold text-text">{t('ntf.profile')}</h2>
      <div className="flex items-center gap-3">
        <Avatar name={name} src={user?.photo_url} size="lg" decorative />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-text">{name}</p>
          <p className="truncate text-[12px] text-muted">{user?.email}</p>
        </div>
        {user && 'photo_url' in user && (
          <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={uploadPhoto} />
            <Button variant="link" size="sm" loading={photoBusy} onClick={() => fileRef.current?.click()}>{t('ntf.changePhoto')}</Button>
          </>
        )}
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
  const [summary, setSummary] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (prefs.data?.preferences) setLocal(prefs.data.preferences)
    setSummary(!!prefs.data?.daily_summary)
  }, [prefs.data])

  // Rows: the staff groups (R-48) when the API sends them, each switching all its types at once. A group whose types
  // the preferences do not hold yet is left out (R-57). Without groups: one row per type the API knows, in plain words.
  const known = useMemo(() => new Set(Object.keys(prefs.data?.preferences ?? {})), [prefs.data])
  const groups = prefs.data?.staff_groups
  const rows = useMemo(() => {
    if (Array.isArray(groups)) {
      return groups
        .map((g) => ({ key: g.code, label: t(`ntf.group.${g.code}`), types: (g.types ?? []).filter((x) => known.has(x)) }))
        .filter((r) => r.types.length > 0 && r.label !== `ntf.group.${r.key}`)
    }
    return (prefs.data?.notification_types ?? [])
      .map((x) => ({ key: x.code, label: t(`ntf.type.${x.code}`), types: [x.code] }))
      .filter((r) => r.label !== `ntf.type.${r.key}`)
  }, [groups, known, prefs.data, t])
  const hiddenGroups = Array.isArray(groups) && rows.length < groups.length
  const changed = local && prefs.data && (JSON.stringify(local) !== JSON.stringify(prefs.data.preferences) || summary !== !!prefs.data.daily_summary)
  const hasSummary = prefs.data && 'daily_summary' in prefs.data

  const isOn = (row, c) => row.types.every((x) => !!local[x]?.[c])
  const setOn = (row, c, on) => setLocal((p) => ({ ...p, ...Object.fromEntries(row.types.map((x) => [x, { ...(p[x] ?? {}), [c]: on }])) }))

  async function save() {
    setBusy(true)
    try {
      await client.put('/api/notifications/preferences/', { preferences: local, ...(hasSummary ? { daily_summary: summary } : {}) })
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
              <span role="columnheader"><span className="sr-only">{t('ntf.what')}</span></span>
              {CHANNELS.map((c) => <span key={c} role="columnheader" className="text-center">{t(`ntf.channel.${c}`)}</span>)}
            </div>
            {rows.map((row) => (
              <div key={row.key} role="row" className="grid grid-cols-[1fr_repeat(3,64px)] items-center gap-1 border-t border-border py-2">
                <span role="rowheader" className="text-[14px] text-text">{row.label}</span>
                {CHANNELS.map((c) => (
                  <span key={c} role="cell" className="flex justify-center">
                    <Checkbox aria-label={`${row.label}: ${t(`ntf.channel.${c}`)}`} label="" checked={isOn(row, c)} onChange={(e) => setOn(row, c, e.target.checked)} />
                  </span>
                ))}
              </div>
            ))}
          </div>
          {hiddenGroups && <p className="text-[12px] text-muted">{t('ntf.groupsSoon')}</p>}
          {hasSummary && <Toggle label={t('ntf.dailySummary')} checked={summary} onChange={setSummary} />}
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
      <div className="grid grid-cols-1 items-start gap-[14px] lg:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-[22px]">
        <NotificationList />
        <div className="flex flex-col gap-[14px]">
          <ProfileCard />
          <AlertsCard />
        </div>
      </div>
    </div>
  )
}
