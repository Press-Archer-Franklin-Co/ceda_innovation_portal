import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2, User, Users, Bell, ShieldCheck,
  Globe, Linkedin, Calendar, MapPin, CreditCard, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import { profileService } from '../services/profile.service'
import { securityService } from '../services/security.service'
import { parseApiError, parseFieldErrors } from '../utils/apiError'
import type { InnovatorProfile } from '../types/api'
import type { AccountSecurity } from '../types/security'
import type { SocialProvider } from '../services/auth.service'
import { getSortedActions, providerLinkedSuccessMsg } from '../utils/securityLabels'
import SecurityOverview   from '../components/security/SecurityOverview'
import RecommendedActions from '../components/security/RecommendedActions'
import PasswordManagement from '../components/security/PasswordManagement'
import LinkedProviders    from '../components/security/LinkedProviders'


type Tab = 'profile' | 'security' | 'teams' | 'preferences' | 'activity'

type FormState = {
  national_id:   string
  gender:        string
  date_of_birth: string
  region:        string
  bio:           string
  portfolio_url: string
  linkedin_url:  string
}

function toForm(p: InnovatorProfile): FormState {
  return {
    national_id:   p.national_id   ?? '',
    gender:        p.gender        ?? '',
    date_of_birth: p.date_of_birth ?? '',
    region:        p.region        ?? '',
    bio:           p.bio           ?? '',
    portfolio_url: p.portfolio_url ?? '',
    linkedin_url:  p.linkedin_url  ?? '',
  }
}


const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say']

const REGION_OPTIONS = [
  'Central', 'Chobe', 'Francistown', 'Gaborone', 'Ghanzi',
  'Kgalagadi', 'Kgatleng', 'Kweneng', 'Lobatse', 'North East',
  'North West', 'South East', 'Southern', 'Selebi-Phikwe', 'Orapa',
]

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',     label: 'Profile',     icon: <User size={14} />         },
  { id: 'security',    label: 'Security',    icon: <ShieldCheck size={14} />  },
  { id: 'teams',       label: 'Teams',       icon: <Users size={14} />        },
  { id: 'preferences', label: 'Preferences', icon: <Bell size={14} />         },
  { id: 'activity',    label: 'Activity',    icon: <CheckCircle2 size={14} /> },
]


function PlaceholderPanel({
  icon, title, body,
}: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4 text-gray-300">
        {icon}
      </div>
      <p className="text-sm font-semibold text-gray-500 mb-1">{title}</p>
      <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">{body}</p>
    </div>
  )
}


function ProfileTab() {
  const { user } = useAuth()
  const [form,        setForm]        = useState<FormState>({
    national_id: '', gender: '', date_of_birth: '', region: '',
    bio: '', portfolio_url: '', linkedin_url: '',
  })
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saved,       setSaved]       = useState(false)

  const up = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    profileService.get()
      .then(p => setForm(toForm(p)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})
    setSaved(false)
    try {
      await profileService.update({
        national_id:   form.national_id   || undefined,
        gender:        form.gender        || undefined,
        date_of_birth: form.date_of_birth || undefined,
        region:        form.region        || undefined,
        bio:           form.bio           || undefined,
        portfolio_url: form.portfolio_url || undefined,
        linkedin_url:  form.linkedin_url  || undefined,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setFieldErrors(parseFieldErrors(err))
      setError(parseApiError(err, 'Failed to save profile. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const inp     = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30 bg-white'
  const errInp  = (key: keyof FormState) => `${inp} ${fieldErrors[key] ? 'border-red-400' : ''}`
  const readInp = `${inp} bg-gray-50 text-gray-500 cursor-default`

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-gray-100 p-5">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
            <div className="h-10 bg-gray-100 rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 size={15} /> Profile saved successfully.
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <User size={14} className="text-gray-400" /> Account Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">First Name</label>
            <input className={readInp} value={user?.first_name ?? ''} readOnly />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Last Name</label>
            <input className={readInp} value={user?.last_name ?? ''} readOnly />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
            <input className={readInp} value={user?.email ?? ''} readOnly />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone</label>
            <input className={readInp} value={user?.phone_number ?? '—'} readOnly />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          To change your email or password, visit{' '}
          <Link to="/security" className="font-medium hover:underline" style={{ color: '#A01E0A' }}>
            Account Security
          </Link>.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <CreditCard size={14} className="text-gray-400" /> Personal Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              <span className="flex items-center gap-1"><CreditCard size={11} /> National ID</span>
            </label>
            <input
              className={errInp('national_id')}
              placeholder="000000000"
              value={form.national_id}
              onChange={e => up('national_id', e.target.value)}
            />
            {fieldErrors.national_id && <p className="text-xs text-red-500 mt-1">{fieldErrors.national_id}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              <span className="flex items-center gap-1"><Calendar size={11} /> Date of Birth</span>
            </label>
            <input
              type="date"
              className={errInp('date_of_birth')}
              value={form.date_of_birth}
              onChange={e => up('date_of_birth', e.target.value)}
            />
            {fieldErrors.date_of_birth && <p className="text-xs text-red-500 mt-1">{fieldErrors.date_of_birth}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Gender</label>
            <select className={errInp('gender')} value={form.gender} onChange={e => up('gender', e.target.value)}>
              <option value="">Select…</option>
              {GENDER_OPTIONS.map(g => <option key={g}>{g}</option>)}
            </select>
            {fieldErrors.gender && <p className="text-xs text-red-500 mt-1">{fieldErrors.gender}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              <span className="flex items-center gap-1"><MapPin size={11} /> Region</span>
            </label>
            <select className={errInp('region')} value={form.region} onChange={e => up('region', e.target.value)}>
              <option value="">Select…</option>
              {REGION_OPTIONS.map(r => <option key={r}>{r}</option>)}
            </select>
            {fieldErrors.region && <p className="text-xs text-red-500 mt-1">{fieldErrors.region}</p>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Globe size={14} className="text-gray-400" /> Bio & Links
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Bio</label>
            <textarea
              rows={3}
              className={`${errInp('bio')} resize-none`}
              placeholder="Tell us about yourself and your work…"
              value={form.bio}
              onChange={e => up('bio', e.target.value)}
            />
            {fieldErrors.bio && <p className="text-xs text-red-500 mt-1">{fieldErrors.bio}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                <span className="flex items-center gap-1"><Globe size={11} /> Portfolio URL</span>
              </label>
              <input
                type="url"
                className={errInp('portfolio_url')}
                placeholder="https://yourportfolio.com"
                value={form.portfolio_url}
                onChange={e => up('portfolio_url', e.target.value)}
              />
              {fieldErrors.portfolio_url && <p className="text-xs text-red-500 mt-1">{fieldErrors.portfolio_url}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                <span className="flex items-center gap-1"><Linkedin size={11} /> LinkedIn URL</span>
              </label>
              <input
                type="url"
                className={errInp('linkedin_url')}
                placeholder="https://linkedin.com/in/…"
                value={form.linkedin_url}
                onChange={e => up('linkedin_url', e.target.value)}
              />
              {fieldErrors.linkedin_url && <p className="text-xs text-red-500 mt-1">{fieldErrors.linkedin_url}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>Save changes</Button>
      </div>
    </form>
  )
}


function SecurityTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [secData,    setSecData]    = useState<AccountSecurity | null>(null)
  const [providers,  setProviders]  = useState<SocialProvider[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [banner,     setBanner]     = useState<string | null>(null)

  const passwordRef  = useRef<HTMLDivElement>(null)
  const providersRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    else        setRefreshing(true)
    setError('')
    try {
      const [sec, prov] = await Promise.all([
        securityService.getAccountSecurity(),
        securityService.getSocialProviders(),
      ])
      setSecData(sec)
      setProviders(prov)
    } catch (err) {
      setError(parseApiError(err, 'Could not load your account security information. Please try again.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const linked = searchParams.get('linked')
    if (linked) {
      setBanner(providerLinkedSuccessMsg(linked))
      setSearchParams({}, { replace: true })
      setTimeout(() => setBanner(null), 6000)
    }
  }, [searchParams, setSearchParams])

  const handleActionClick = (code: string) => {
    if (['add_password', 'set_password', 'change_password', 'avoid_unlink'].includes(code)) {
      passwordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (['link_provider', 'add_provider', 'add_recovery_method'].includes(code)) {
      providersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const topActionCode = secData ? (getSortedActions(secData)[0]?.code ?? '') : ''
  const passwordStartExpanded = ['set_password', 'add_password'].includes(topActionCode)

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="rounded-2xl border border-gray-100 bg-white h-[100px]" />
        <div className="rounded-2xl border border-gray-100 bg-white h-[88px]" />
        <div className="rounded-2xl border border-gray-100 bg-white h-[160px]" />
        <div className="rounded-2xl border border-gray-100 bg-white h-[180px]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#A01E0A] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {banner && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 size={15} className="shrink-0" />
          {banner}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-red-600 mb-1">Couldn't load security info</p>
          <p className="text-sm text-red-500 mb-4 leading-relaxed">{error}</p>
          <button onClick={() => fetchData()} className="text-sm font-semibold text-[#A01E0A] hover:underline">
            Try again
          </button>
        </div>
      )}

      {!error && secData && (
        <>
          <SecurityOverview data={secData} onActionClick={handleActionClick} />

          {getSortedActions(secData).length > 0 && (
            <RecommendedActions data={secData} onActionClick={handleActionClick} />
          )}

          <div ref={providersRef} className="scroll-mt-4">
            <LinkedProviders
              data={secData}
              providers={providers}
              onRefresh={() => fetchData(true)}
            />
          </div>

          <div ref={passwordRef} className="scroll-mt-4">
            <PasswordManagement
              data={secData}
              onRefresh={() => fetchData(true)}
              startExpanded={passwordStartExpanded}
            />
          </div>
        </>
      )}
    </div>
  )
}


export default function Profile() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')

  const initials = user
    ? (user.first_name.charAt(0) + user.last_name.charAt(0)).toUpperCase()
    : ''

  return (
    <div className="bg-gray-50 min-h-screen">

      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5">

            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-extrabold shrink-0"
              style={{ background: '#A01E0A' }}
            >
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-extrabold text-gray-900 leading-tight">
                {user?.first_name} {user?.last_name}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
            </div>

          </div>

          <div className="flex gap-1 mt-7 -mb-px">
            {TABS.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={[
                  'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold rounded-t-xl border-b-2 transition-colors duration-150',
                  tab === id
                    ? 'text-[#A01E0A] border-[#A01E0A] bg-white'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-16">
        {tab === 'profile' && <ProfileTab />}

        {tab === 'security' && <SecurityTab />}

        {tab === 'teams' && (
          <PlaceholderPanel
            icon={<Users size={28} />}
            title="Teams coming soon"
            body="You'll be able to form and join teams for hackathons and challenges here. Team collaboration features are on their way."
          />
        )}

        {tab === 'preferences' && (
          <PlaceholderPanel
            icon={<Bell size={28} />}
            title="Preferences coming soon"
            body="Notification preferences, communication settings, and portal customisation options will appear here."
          />
        )}

        {tab === 'activity' && (
          <PlaceholderPanel
            icon={<CheckCircle2 size={28} />}
            title="Activity coming soon"
            body="A timeline of your submissions, status changes, team activity, and portal interactions will appear here."
          />
        )}
      </div>
    </div>
  )
}
