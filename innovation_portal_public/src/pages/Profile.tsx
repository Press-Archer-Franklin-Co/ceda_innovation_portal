import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Bell, ChevronLeft, ChevronRight, Globe, LucideIcon, Monitor, ShieldCheck, Smartphone, User } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/ui/Avatar'
import Button, { buttonClasses } from '../components/ui/Button'
import Input from '../components/ui/Input'
import Field from '../components/ui/Field'
import { SelectControl } from '../components/ui/Select'
import Tag from '../components/ui/Tag'
import Skeleton from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/EmptyState'
import PasswordRows from '../components/account/PasswordRows'
import { Lang, LANGS, useI18n } from '../i18n'
import { CONTACT_EMAIL } from '../lib/contact'
import { useAsync } from '../lib/useAsync'
import { useMediaQuery } from '../lib/useMediaQuery'
import { usePageTitle } from '../lib/usePageTitle'
import { useSecondStep } from '../lib/useSecondStep'
import { authService } from '../services/auth.service'
import { profileService } from '../services/profile.service'
import { referenceService } from '../services/reference.service'
import { securityService } from '../services/security.service'

// Figma 2.9 Profile and security (110:606 website, 110:827 phone): one page. /security redirects here.
// ① "Your account" on the left jumps to Profile, Security, Notifications and Language (on phones it is a list
// that opens each part). ② Language is the person's language for the portal. ③ Security: where you are signed
// in, and the password rows only when the second sign-in step is "password" (U7). ④ Delete my account.
// Waiting on the API (R-51): editing the name, the photo, other devices and deleting from here.

type Section = 'profile' | 'security' | 'language'

const SECTIONS: { id: Section | 'notifications'; icon: LucideIcon; label: 'account.profile' | 'account.security' | 'account.notifications' | 'account.language'; sub: 'account.profileSub' | 'account.securitySub' | 'account.notificationsSub' | null }[] = [
  { id: 'profile', icon: User, label: 'account.profile', sub: 'account.profileSub' },
  { id: 'security', icon: ShieldCheck, label: 'account.security', sub: 'account.securitySub' },
  { id: 'notifications', icon: Bell, label: 'account.notifications', sub: 'account.notificationsSub' },
  { id: 'language', icon: Globe, label: 'account.language', sub: null },
]

/** "Chrome on Windows" from the browser itself: this device is the one row we know without the API. */
function thisDevice(): { browser: string; os: string; phone: boolean } {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'this device'
  return { browser, os, phone: /Android|iPhone/.test(ua) }
}

function Card({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={clsx('scroll-mt-24 w-full rounded-card border border-border p-5 flex flex-col gap-[14px]', className)}>
      <h2 id={`${id}-title`} className="text-d-h5 font-heading text-text">{title}</h2>
      {children}
    </section>
  )
}

function LanguageRow() {
  const { t, lang, setLang } = useI18n()
  return (
    <div id="language" className="scroll-mt-24 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-d-label text-text">{t('account.language')}</p>
        <p className="text-d-cap text-muted">{t('account.languageHint')}</p>
      </div>
      <div role="group" aria-label={t('account.language')} className="inline-flex gap-0.5 p-[3px] rounded-[10px] bg-surface2 self-start sm:self-auto">
        {LANGS.map((l: Lang) => (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={clsx(
              'px-3.5 py-[7px] rounded-control text-d-btn-s font-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              lang === l ? 'bg-bg text-text shadow-[0_10px_15px_rgb(46_26_15/0.08)]' : 'text-muted hover:text-text',
            )}
          >
            {t(l === 'en' ? 'lang.en' : 'lang.tn')}
          </button>
        ))}
      </div>
    </div>
  )
}

function ProfileCard() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const profile = useAsync(() => profileService.get(), [])
  const districts = useAsync(() => Promise.all([referenceService.districts('en'), referenceService.districts(lang)]), [lang])
  const [region, setRegion] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [linkSent, setLinkSent] = useState(false)

  useEffect(() => {
    if (profile.data) setRegion(profile.data.region ?? '')
  }, [profile.data])

  // Stored as the English district name (as before); shown in the current language.
  const options = useMemo(() => {
    const [en, local] = districts.data ?? [[], []]
    const names = new Map(local.map((d) => [d.slug, d.name]))
    return en.map((d) => ({ value: d.name, label: names.get(d.slug) ?? d.name }))
  }, [districts.data])

  if (!user) return null
  const changed = profile.data && region !== null && region !== (profile.data.region ?? '')

  async function save() {
    setSaving(true)
    setStatus('idle')
    try {
      await profileService.update({ region: region || undefined })
      profile.reload()
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  async function sendLink() {
    try {
      await authService.resendVerification(user!.email)
      setLinkSent(true)
    } catch {
      setStatus('error')
    }
  }

  const emailHint = user.email_verified ? (
    t('account.confirmed')
  ) : linkSent ? (
    t('account.linkSent')
  ) : (
    <>
      {t('account.notConfirmed')} ·{' '}
      <button type="button" onClick={sendLink} className="text-primary hover:underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {t('account.sendLink')}
      </button>
    </>
  )

  return (
    <Card id="profile" title={t('account.profile')}>
      <Avatar name={user.name || user.email || '?'} size="lg" decorative className="!w-16 !h-16 !text-[23px] !bg-yellow !text-banner" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('account.fullName')} value={user.name} readOnly hint={t('account.nameHint')} />
        <Field label={t('account.district')}>
          {profile.loading || districts.loading ? (
            <Skeleton className="h-[46px] w-full rounded-control" />
          ) : (
            <SelectControl value={region || null} onChange={(v) => { setRegion(v); setStatus('idle') }} options={options} placeholder={t('account.districtPick')} />
          )}
        </Field>
        <Input label={t('account.phone')} value={user.phone_number || t('account.notGiven')} readOnly hint={user.phone_number ? (user.phone_verified ? t('account.confirmed') : t('account.notConfirmed')) : undefined} />
        <Input label={t('account.email')} value={user.email || t('account.notGiven')} readOnly hint={user.email ? emailHint : undefined} />
      </div>
      {(changed || status !== 'idle') && (
        <div className="flex items-center justify-end gap-3">
          {status === 'saved' && <p role="status" className="text-d-cap text-success">{t('account.saved')}</p>}
          {status === 'error' && <p role="alert" className="text-d-cap text-danger">{t('account.saveError')}</p>}
          {changed && <Button size="sm" onClick={save} loading={saving}>{t('account.save')}</Button>}
        </div>
      )}
      <LanguageRow />
    </Card>
  )
}

function SecurityCard() {
  const { t } = useI18n()
  const secondStep = useSecondStep()
  const security = useAsync(() => securityService.getAccountSecurity(), [])
  const device = useMemo(thisDevice, [])
  const DeviceIcon = device.phone ? Smartphone : Monitor
  return (
    <Card id="security" title={t('account.security')}>
      <p className="text-d-label-s text-muted">{t('account.signedIn')}</p>
      <div className="flex items-center gap-3">
        <DeviceIcon size={18} aria-hidden className="shrink-0 text-text" />
        <div className="flex-1 min-w-0">
          <p className="text-d-body-s text-text">{t('account.device', { browser: device.browser, os: device.os })}</p>
          <p className="text-d-cap text-muted">{t('account.now')}</p>
        </div>
        <Tag tone="green">{t('account.thisDevice')}</Tag>
      </div>
      {secondStep === 'password' &&
        (security.data ? (
          <PasswordRows hasPassword={security.data.has_password} onSaved={security.reload} />
        ) : security.error ? (
          <ErrorState framed={false} title={t('account.loadError')} onRetry={security.reload} retrying={security.fetching} />
        ) : (
          <Skeleton className="h-12 w-full" />
        ))}
    </Card>
  )
}

function DeleteRow() {
  const { t } = useI18n()
  // Until the API can delete an account (R-51), the request goes to the innovation team by email.
  const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('account.deleteMailSubject'))}`
  return (
    <div className="w-full rounded-card border border-border px-4 py-[14px] flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-d-label text-danger">{t('account.delete')}</p>
        <p className="text-d-cap text-muted">{t('account.deleteBody')}</p>
      </div>
      <a href={href} className={buttonClasses({ variant: 'danger', size: 'sm', className: 'self-start sm:self-auto' })}>{t('account.deleteButton')}</a>
    </div>
  )
}

function SideNav() {
  const { t } = useI18n()
  const [active, setActive] = useState<string>('profile')
  return (
    <nav aria-labelledby="account-nav-title" className="hidden lg:flex flex-col gap-1 w-[240px] shrink-0 lg:sticky lg:top-28">
      <h1 id="account-nav-title" className="font-heading text-d-h4 text-text mb-2">{t('account.title')}</h1>
      {SECTIONS.map(({ id, icon: Icon, label }) => {
        const cls = clsx(
          'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-d-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          active === id ? 'bg-surface2 text-text' : 'text-muted hover:text-text hover:bg-surface2',
        )
        const icon = <Icon size={18} aria-hidden className={active === id ? 'text-primary' : ''} />
        return id === 'notifications' ? (
          <Link key={id} to="/notifications" className={cls}>{icon}{t(label)}</Link>
        ) : (
          <a key={id} href={`#${id}`} onClick={() => setActive(id)} aria-current={active === id ? 'location' : undefined} className={cls}>{icon}{t(label)}</a>
        )
      })}
    </nav>
  )
}

/** Phones: the account list (110:827); each row opens one part on its own. */
function PhoneIndex() {
  const { t, lang } = useI18n()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 mb-1">
        <Avatar name={user.name || user.email || '?'} size="lg" decorative className="!w-[52px] !h-[52px] !text-[19px] !bg-yellow !text-banner" />
        <div className="min-w-0">
          <h1 className="font-heading text-d-h4 text-text truncate">{user.name || user.email}</h1>
          <p className="text-d-body-s text-muted truncate">{user.phone_number || user.email}</p>
        </div>
      </div>
      {SECTIONS.map(({ id, icon: Icon, label, sub }) => (
        <Link
          key={id}
          to={id === 'notifications' ? '/notifications' : `/profile?section=${id}`}
          className="flex items-center gap-3 rounded-card border border-border px-4 py-3.5 hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon size={18} aria-hidden className="shrink-0 text-primary" />
          <span className="flex-1 min-w-0">
            <span className="block text-d-label text-text">{t(label)}</span>
            <span className="block text-d-cap text-muted">{sub ? t(sub) : t(lang === 'en' ? 'lang.en' : 'lang.tn')}</span>
          </span>
          <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
        </Link>
      ))}
      <button type="button" onClick={() => logout().then(() => navigate('/'))} className="self-start mt-1 text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {t('account.signOut')}
      </button>
    </div>
  )
}

export default function Profile() {
  const { t } = useI18n()
  usePageTitle(t('account.title'))
  const wide = useMediaQuery('(min-width: 1024px)')
  const [params] = useSearchParams()
  const section = params.get('section') as Section | null

  // Phones show the list first, then one part at a time.
  if (!wide) {
    return (
      <div className="px-4 py-5">
        {!section ? (
          <PhoneIndex />
        ) : (
          <div className="flex flex-col gap-4">
            <Link to="/profile" className="self-start inline-flex items-center gap-1.5 font-heading text-d-h4 text-text rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <ChevronLeft size={20} aria-hidden /> {t('account.back')}
            </Link>
            {section === 'security' ? (
              <>
                <SecurityCard />
                <DeleteRow />
              </>
            ) : section === 'language' ? (
              <Card id="language-card" title={t('account.language')}><LanguageRow /></Card>
            ) : (
              <ProfileCard />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 pt-10 pb-[72px] flex gap-10 items-start">
      <SideNav />
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        <ProfileCard />
        <SecurityCard />
        <DeleteRow />
      </div>
    </div>
  )
}
