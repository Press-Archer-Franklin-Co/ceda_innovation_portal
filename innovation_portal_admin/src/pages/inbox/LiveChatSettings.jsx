import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Tabs from '../../components/ui/Tabs'
import Avatar from '../../components/ui/Avatar'
import { Toggle } from '../../components/ui/Choice'
import { SelectControl } from '../../components/ui/Select'
import ErrorState from '../../components/ui/ErrorState'
import { FormPageSkeleton } from '../../components/ui/PageSkeleton'
import { useToast } from '../../components/ui/toast'
import { useT, useI18n } from '../../i18n/context'
import { useAuth } from '../../lib/auth/AuthContext'
import { buttonClasses } from '../../components/ui/buttonClasses'
import { cn } from '../../lib/cn'
import { liveChatSettingsApi } from '../../lib/api/inbox'
import { users } from '../../lib/api/endpoints'
import { useAdminRoles } from '../../lib/queries/adminRoles'

// 3.28 Live chat settings (Figma 123:1546 website, 123:1913 phone). ① Opening hours per day; outside them the
// bubble shows the away message. ② Who answers: roles (custom roles too) and named officers, each with a limit of
// open chats. ③ Welcome and away messages in English and Setswana. ④ Hand-over from the AI helper. ⑤ Saved
// replies officers can insert. A plain sentence at the top says what the settings mean. settings.manage.

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
// Toggle (components/ui/Choice) calls onChange with true or false, not with the event.

function Card({ title, action, children, className }) {
  return (
    <section className={cn('rounded-card border border-border bg-surface p-4 2xl:p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-heading text-[15px] font-bold text-text 2xl:text-[16px]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const rowsOf = (data) => (Array.isArray(data) ? data : data?.results ?? [])

export default function LiveChatSettings() {
  const t = useT()
  const { can } = useAuth()
  const { lang } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['live-chat', 'settings'], queryFn: liveChatSettingsApi.get })
  const roles = useAdminRoles()
  // People who can be named answerers: officers and managers (custom roles answer through "Roles").
  const staff = useQuery({
    queryKey: ['users', 'staff-for-chat'],
    queryFn: async () => {
      const lists = await Promise.all(['innovation_officer', 'innovation_manager'].map((role) => users.list({ role, active: 'true', page_size: 100 })))
      const byId = new Map()
      for (const l of lists) for (const u of rowsOf(l)) byId.set(String(u.id), u)
      return [...byId.values()]
    },
  })
  const [form, setForm] = useState(null)
  const [msgLang, setMsgLang] = useState('en')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const loaded = useRef(false)

  useEffect(() => { document.title = `${t('chatset.title')} · CEDA Innovation` }, [t])
  useEffect(() => {
    if (query.data && !loaded.current) { loaded.current = true; setForm(structuredClone(query.data)) }
  }, [query.data])

  const roleList = rowsOf(roles.data)
  const staffList = rowsOf(staff.data)
  const nameOf = (id) => {
    const u = staffList.find((x) => String(x.id) === String(id))
    return u ? (u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email) : t('chatset.someone')
  }
  // Role names arrive as {en, tn} (custom roles too).
  const labelOf = (r) => (r?.name && typeof r.name === 'object' ? r.name[lang] || r.name.en : r?.name) || r?.code || ''
  const roleName = (code) => labelOf(roleList.find((r) => r.code === code)) || code
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const sentence = useMemo(() => (form ? summary(form, t, roleName) : ''), [form, roleList]) // eslint-disable-line react-hooks/exhaustive-deps

  if (query.isLoading || !form) {
    if (query.isError) return <ErrorState framed title={t('chatset.loadError')} message={query.error?.message} onRetry={query.refetch} />
    return <FormPageSkeleton />
  }

  async function save() {
    setBusy(true)
    setErrors({})
    try {
      const body = { ...form }
      delete body.open_now
      const saved = await liveChatSettingsApi.save(body)
      setForm(structuredClone(saved))
      qc.invalidateQueries({ queryKey: ['live-chat'] })
      qc.invalidateQueries({ queryKey: ['platform', 'public-config'] })
      toast.show({ tone: 'success', title: t('chatset.saved') })
    } catch (err) {
      setErrors(err?.data?.errors ?? {})
      toast.show({ tone: 'error', title: t('chatset.saveError'), body: err?.message })
    } finally {
      setBusy(false)
    }
  }

  const window0 = (day) => form.hours?.[day]?.[0]
  const setDay = (day, value) => set({ hours: { ...form.hours, [day]: value ? [value] : [] } })
  const answerers = form.answerers ?? []
  const unpicked = staffList.filter((u) => !answerers.some((a) => String(a.id) === String(u.id)))

  return (
    <div className="flex flex-col gap-[14px] pb-20 2xl:gap-[18px]">
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('staff.group.admin')} / {t('chatset.crumb')}</span>}
        title={t('chatset.title')}
        subtitle={t('chatset.subtitle')}
        actions={<>{can('analytics.view') && <Link to="/reports?tab=chat" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t('chatset.seeReport')}</Link>}<Button onClick={save} loading={busy}>{t('common.save')}</Button></>}
      />

      <section className="flex flex-col gap-2 rounded-card bg-surface2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <Toggle label={form.enabled ? t('chatset.on') : t('chatset.off')} description={form.enabled ? (form.open_now ? t('chatset.openNow') : t('chatset.closedNow')) : t('chatset.offHint')}
          checked={Boolean(form.enabled)} onChange={(on) => set({ enabled: on })} />
        <p className="text-[13px] text-text lg:max-w-[60%]" aria-live="polite">{sentence}</p>
      </section>

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-2 2xl:gap-[18px]">
        <div className="flex flex-col gap-[14px] 2xl:gap-[18px]">
          <Card title={t('chatset.hours')}>
            <ul className="flex flex-col divide-y divide-border">
              {DAYS.map((day) => {
                const w = window0(day)
                return (
                  <li key={day} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="w-[120px] text-[14px] text-text">{t(`chatset.day.${day}`)}</span>
                    {w ? (
                      <span className="flex items-center gap-1.5">
                        <Input type="time" aria-label={t('chatset.opens', { day: t(`chatset.day.${day}`) })} value={w.opens} onChange={(e) => setDay(day, { ...w, opens: e.target.value })} className="w-[130px]" />
                        <span className="text-[13px] text-muted">{t('chatset.to')}</span>
                        <Input type="time" aria-label={t('chatset.closes', { day: t(`chatset.day.${day}`) })} value={w.closes} onChange={(e) => setDay(day, { ...w, closes: e.target.value })} className="w-[130px]" />
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted">{t('chatset.closed')}</span>
                    )}
                    <span className="ml-auto">
                      <Toggle aria-label={t('chatset.openOn', { day: t(`chatset.day.${day}`) })} checked={Boolean(w)} onChange={(on) => setDay(day, on ? { opens: '08:00', closes: '16:30' } : null)} />
                    </span>
                  </li>
                )
              })}
            </ul>
            {errors.hours && <p role="alert" className="mt-2 text-[12px] text-danger">{flat(errors.hours)}</p>}
          </Card>

          <Card title={t('chatset.whoAnswers')}>
            <p className="mb-2 text-[12px] font-bold text-text">{t('chatset.roles')}</p>
            <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={t('chatset.roles')}>
              {roleList.filter((r) => r.code !== 'innovator' && r.code !== 'judge').map((r) => {
                const on = (form.roles ?? []).includes(r.code)
                return (
                  <button key={r.code} type="button" aria-pressed={on}
                    onClick={() => set({ roles: on ? form.roles.filter((c) => c !== r.code) : [...(form.roles ?? []), r.code] })}
                    className={cn('h-7 rounded-full px-2.5 text-[12px] font-bold', on ? 'bg-banner text-on-banner' : 'bg-surface2 text-text hover:bg-border/60')}>
                    {labelOf(r)}
                  </button>
                )
              })}
            </div>
            <p className="mb-1 text-[12px] font-bold text-text">{t('chatset.people')}</p>
            <ul className="flex flex-col divide-y divide-border">
              {answerers.map((a, i) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
                  <Avatar name={nameOf(a.id)} size="sm" decorative />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-text">{nameOf(a.id)}{a.backup ? ` (${t('chatset.backup')})` : ''}</span>
                  <label className="flex items-center gap-1.5 text-[12px] text-muted">
                    {t('chatset.maxOpen')}
                    <Input type="number" min={1} max={50} aria-label={t('chatset.maxOpenFor', { name: nameOf(a.id) })} value={a.max_open ?? 5} className="w-[64px]"
                      onChange={(e) => set({ answerers: answerers.map((x, j) => (j === i ? { ...x, max_open: Number(e.target.value) || 1 } : x)) })} />
                  </label>
                  <Toggle label={t('chatset.backup')} checked={Boolean(a.backup)} onChange={(on) => set({ answerers: answerers.map((x, j) => (j === i ? { ...x, backup: on } : x)) })} />
                  <button type="button" aria-label={t('chatset.remove', { name: nameOf(a.id) })} onClick={() => set({ answerers: answerers.filter((_, j) => j !== i) })} className="text-muted hover:text-danger"><Trash2 size={16} aria-hidden /></button>
                </li>
              ))}
            </ul>
            <div className="mt-2 max-w-[320px]">
              <SelectControl
                aria-label={t('chatset.addPerson')}
                placeholder={t('chatset.addPerson')}
                value=""
                searchable
                options={unpicked.map((u) => ({ value: String(u.id), label: u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email }))}
                onChange={(v) => v && set({ answerers: [...answerers, { kind: 'person', id: v, max_open: 5, backup: false }] })}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[12px] font-bold text-text">{t('chatset.shareOut')}</p>
                <SelectControl aria-label={t('chatset.shareOut')} value={form.share_out ?? 'pick'} onChange={(v) => set({ share_out: v })}
                  options={[{ value: 'pick', label: t('chatset.share.pick') }, { value: 'take_turns', label: t('chatset.share.take_turns') }]} />
              </div>
              <Input type="number" min={1} max={1440} label={t('chatset.escalate')} hint={t('chatset.escalateHint')} value={form.escalate_after_minutes ?? ''}
                onChange={(e) => set({ escalate_after_minutes: e.target.value ? Number(e.target.value) : null })} error={flat(errors.escalate_after_minutes) || undefined} />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-[14px] 2xl:gap-[18px]">
          <Card title={t('chatset.messages')} action={<Tabs variant="segment" tabs={[{ key: 'en', label: 'English' }, { key: 'tn', label: 'Setswana' }]} active={msgLang} onChange={setMsgLang} label={t('chatset.language')} idPrefix="chatlang" />}>
            <div className="flex flex-col gap-3">
              <Textarea label={t('chatset.welcome')} rows={2} maxChars={500} value={form.welcome?.[msgLang] ?? ''}
                onChange={(e) => set({ welcome: { en: '', tn: '', ...form.welcome, [msgLang]: e.target.value } })} error={flat(errors.welcome) || undefined} />
              <Textarea label={t('chatset.away')} rows={3} maxChars={500} value={form.away?.[msgLang] ?? ''}
                onChange={(e) => set({ away: { en: '', tn: '', ...form.away, [msgLang]: e.target.value } })} error={flat(errors.away) || undefined} />
            </div>
          </Card>

          <Card title={t('chatset.handover')}>
            <div className="flex flex-col gap-3">
              <Toggle label={t('chatset.askHuman')} checked={Boolean(form.handoff_on_ask_human)} onChange={(on) => set({ handoff_on_ask_human: on })} />
              <Toggle label={t('chatset.aiUnsure')} checked={Boolean(form.handoff_on_ai_unsure)} onChange={(on) => set({ handoff_on_ai_unsure: on })} />
              <Toggle label={t('chatset.whatsappFollowUp', { n: form.whatsapp_follow_up_minutes || 10 })} checked={form.whatsapp_follow_up_minutes != null}
                onChange={(on) => set({ whatsapp_follow_up_minutes: on ? 10 : null })} />
              <Toggle label={t('chatset.askRating')} checked={Boolean(form.ask_rating)} onChange={(on) => set({ ask_rating: on })} />
              <Toggle label={t('chatset.allowGuests')} description={t('chatset.allowGuestsHint')} checked={Boolean(form.allow_guests)} onChange={(on) => set({ allow_guests: on })} />
            </div>
          </Card>

          <Card title={t('chatset.savedReplies')}
            action={<button type="button" onClick={() => set({ saved_replies: [...(form.saved_replies ?? []), { title: '', body: { en: '', tn: '' } }] })} className="inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:underline"><Plus size={14} aria-hidden />{t('chatset.add')}</button>}>
            {(form.saved_replies ?? []).length === 0 ? <p className="text-[13px] text-muted">{t('chatset.noReplies')}</p> : (
              <ul className="flex flex-col gap-3">
                {form.saved_replies.map((r, i) => (
                  <li key={r.id || `new-${i}`} className="flex flex-col gap-2 rounded-control border border-border p-3">
                    <div className="flex items-end gap-2">
                      <Input label={t('chatset.replyTitle')} value={r.title} maxLength={120} className="flex-1"
                        onChange={(e) => set({ saved_replies: form.saved_replies.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                      <button type="button" aria-label={t('chatset.removeReply', { title: r.title || '' })} onClick={() => set({ saved_replies: form.saved_replies.filter((_, j) => j !== i) })} className="mb-2 text-muted hover:text-danger"><Trash2 size={16} aria-hidden /></button>
                    </div>
                    <Textarea label={msgLang === 'tn' ? t('chatset.replyTn') : t('chatset.replyEn')} rows={2} maxChars={500} value={r.body?.[msgLang] ?? ''}
                      onChange={(e) => set({ saved_replies: form.saved_replies.map((x, j) => (j === i ? { ...x, body: { en: '', tn: '', ...x.body, [msgLang]: e.target.value } } : x)) })} />
                  </li>
                ))}
              </ul>
            )}
            {errors.saved_replies && <p role="alert" className="mt-2 text-[12px] text-danger">{flat(errors.saved_replies)}</p>}
          </Card>
        </div>
      </div>
    </div>
  )
}

function flat(e) {
  if (!e) return ''
  if (typeof e === 'string') return e
  if (Array.isArray(e)) return e.map(flat).filter(Boolean).join(' ')
  return Object.values(e).map(flat).filter(Boolean).join(' ')
}

/** "Chats go to Innovation officers, one at a time, 8:00 to 16:30 on weekdays. Unanswered chats go to a manager after 15 minutes." */
function summary(form, t, roleName) {
  if (!form.enabled) return t('chatset.sum.off')
  const who = (form.roles ?? []).map(roleName).join(', ')
  const people = (form.answerers ?? []).length
  const whom = who ? (people ? t('chatset.sum.whoAndPeople', { who, n: people }) : who) : people ? t('chatset.sum.people', { n: people }) : t('chatset.sum.nobody')
  const days = DAYS.filter((d) => form.hours?.[d]?.length)
  const first = days.length ? form.hours[days[0]][0] : null
  const sameTimes = days.every((d) => form.hours[d][0].opens === first?.opens && form.hours[d][0].closes === first?.closes)
  const weekdays = days.length === 5 && days.join() === 'mon,tue,wed,thu,fri'
  const when = !days.length
    ? t('chatset.sum.noHours')
    : sameTimes
      ? t(weekdays ? 'chatset.sum.weekdays' : 'chatset.sum.days', { from: first.opens, to: first.closes, n: days.length })
      : t('chatset.sum.varies')
  const share = form.share_out === 'take_turns' ? t('chatset.sum.turns') : t('chatset.sum.pick')
  const esc = form.escalate_after_minutes ? ` ${t('chatset.sum.escalate', { n: form.escalate_after_minutes })}` : ''
  return `${t('chatset.sum.goTo', { whom, share, when })}${esc}`
}
