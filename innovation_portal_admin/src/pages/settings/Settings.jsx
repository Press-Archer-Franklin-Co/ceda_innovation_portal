import React, { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { User, Bell, Shield, Video, Upload, Trash2, Volume2, VolumeX, BarChart2 } from 'lucide-react'
import PageHeader  from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import Tabs        from '../../components/ui/Tabs'
import { useAuth } from '../../lib/auth/AuthContext'
import { profile as profileApi, auth as authApi, content as contentApi } from '../../lib/api/endpoints'

const TABS = [
  { key: 'profile',       label: 'Profile' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'security',      label: 'Security' },
  { key: 'site_media',    label: 'Site Media' },
]

function SiteMediaTab() {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [msg, setMsg] = useState(null)

  const [prizeMoneyLabel, setPrizeMoneyLabel] = useState('')
  const [solutionsDeployed, setSolutionsDeployed] = useState('')
  const [statsMsg, setStatsMsg] = useState(null)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['site-settings'],
    queryFn: () => contentApi.getSiteSettings(),
  })

  useEffect(() => {
    if (!settings) return
    setPrizeMoneyLabel(settings.prize_money_label ?? '')
    setSolutionsDeployed(settings.solutions_deployed != null ? String(settings.solutions_deployed) : '')
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (fd) => contentApi.updateSiteSettings(fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-settings'] })
      setPendingFile(null)
      setPreview(null)
      setMsg({ type: 'ok', text: 'Settings saved.' })
    },
    onError: (err) => setMsg({ type: 'err', text: err.message }),
  })

  const clearMutation = useMutation({
    mutationFn: () => contentApi.updateSiteSettings({ hero_video_clear: 'true' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-settings'] })
      setPendingFile(null)
      setPreview(null)
      setMsg({ type: 'ok', text: 'Video removed.' })
    },
    onError: (err) => setMsg({ type: 'err', text: err.message }),
  })

  const statsMutation = useMutation({
    mutationFn: (body) => contentApi.updateSiteSettings(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-settings'] })
      setStatsMsg({ type: 'ok', text: 'Stats settings saved.' })
    },
    onError: (err) => setStatsMsg({ type: 'err', text: err.message }),
  })

  const handleSaveStats = () => {
    setStatsMsg(null)
    statsMutation.mutate({
      prize_money_label: prizeMoneyLabel,
      solutions_deployed: solutionsDeployed === '' ? 0 : parseInt(solutionsDeployed, 10) || 0,
    })
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setPreview(URL.createObjectURL(file))
    setMsg(null)
  }

  const handleSave = () => {
    setMsg(null)
    const fd = new FormData()
    if (pendingFile) fd.append('hero_video', pendingFile)
    fd.append('hero_video_muted', settings?.hero_video_muted ?? true)
    saveMutation.mutate(fd)
  }

  const handleMutedToggle = (muted) => {
    setMsg(null)
    const fd = new FormData()
    fd.append('hero_video_muted', muted)
    saveMutation.mutate(fd)
  }

  const activeVideoUrl = preview || settings?.hero_video_url || null
  const hasSavedVideo  = Boolean(settings?.hero_video_url)

  if (isLoading) return <div className="h-32 rounded-xl bg-ceda-surface animate-pulse" />

  return (
    <div className="space-y-5">
      <SectionCard title="Public Stats">
        <p className="text-sm text-ceda-muted mb-5">
          Configure the live statistics shown on the public site. Innovator count and challenge count
          are computed automatically. Set the optional overrides below to surface additional stats.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Prize Money Label</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. BWP 1.2M+"
              value={prizeMoneyLabel}
              onChange={e => setPrizeMoneyLabel(e.target.value)}
            />
            <p className="text-xs text-ceda-muted mt-1">Leave blank to hide this stat.</p>
          </div>
          <div>
            <label className="label">Solutions Deployed</label>
            <input
              type="number"
              className="input"
              placeholder="e.g. 34"
              min="0"
              value={solutionsDeployed}
              onChange={e => setSolutionsDeployed(e.target.value)}
            />
            <p className="text-xs text-ceda-muted mt-1">Set to 0 to hide this stat.</p>
          </div>
        </div>

        {statsMsg && (
          <div className={`mt-4 px-3 py-2 rounded-lg text-sm ${
            statsMsg.type === 'ok' ? 'bg-ceda-green-pale text-ceda-green-muted' : 'bg-ceda-red-pale text-ceda-red'
          }`}>
            {statsMsg.text}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button
            className="btn-primary"
            onClick={handleSaveStats}
            disabled={statsMutation.isPending}
          >
            {statsMutation.isPending ? 'Saving…' : 'Save Stats'}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Homepage Hero Video">
        <p className="text-sm text-ceda-muted mb-5">
          Upload an MP4 or WebM video to play as the background of the homepage hero banner.
          Leave empty to use the default gradient background.
        </p>

        {activeVideoUrl && (
          <div className="mb-5 rounded-xl overflow-hidden bg-black relative group">
            <video
              key={activeVideoUrl}
              src={activeVideoUrl}
              className="w-full max-h-52 object-cover"
              muted
              autoPlay
              loop
              playsInline
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-white text-xs font-medium">Preview</span>
            </div>
            {preview && (
              <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                Unsaved
              </span>
            )}
          </div>
        )}

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-ceda-border rounded-xl px-6 py-8 flex flex-col items-center gap-2 cursor-pointer hover:border-ceda-forest/50 hover:bg-ceda-surface/60 transition-colors"
        >
          <Upload size={20} className="text-ceda-muted" />
          <p className="text-sm font-medium text-ceda-dark">
            {pendingFile ? pendingFile.name : 'Click to upload video'}
          </p>
          <p className="text-xs text-ceda-muted">MP4 or WebM · max 100 MB recommended</p>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div className="mt-5 flex items-center justify-between py-3 border-t border-ceda-border/60">
          <div>
            <p className="text-sm font-medium text-ceda-dark flex items-center gap-1.5">
              {settings?.hero_video_muted !== false ? <VolumeX size={15} /> : <Volume2 size={15} />}
              Default audio
            </p>
            <p className="text-xs text-ceda-muted mt-0.5">
              {settings?.hero_video_muted !== false
                ? 'Video starts muted — visitors can unmute manually.'
                : 'Video starts with sound — visitors can mute manually.'}
            </p>
          </div>
          <label className="relative inline-flex items-center flex-shrink-0 cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings?.hero_video_muted === false}
              onChange={(e) => handleMutedToggle(!e.target.checked)}
              disabled={saveMutation.isPending}
            />
            <div className="w-10 h-5 rounded-full bg-ceda-border peer-checked:bg-ceda-forest transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
          </label>
        </div>

        {msg && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-sm ${
            msg.type === 'ok' ? 'bg-ceda-green-pale text-ceda-green-muted' : 'bg-ceda-red-pale text-ceda-red'
          }`}>
            {msg.text}
          </div>
        )}

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-ceda-border/60">
          {hasSavedVideo && !preview && (
            <button
              className="flex items-center gap-1.5 text-sm text-ceda-red hover:underline disabled:opacity-50"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending || saveMutation.isPending}
            >
              <Trash2 size={13} />
              {clearMutation.isPending ? 'Removing…' : 'Remove video'}
            </button>
          )}
          {preview && (
            <button
              className="text-sm text-ceda-muted hover:underline"
              onClick={() => { setPendingFile(null); setPreview(null) }}
            >
              Cancel
            </button>
          )}
          <div className="ml-auto">
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saveMutation.isPending || (!pendingFile && !hasSavedVideo)}
            >
              {saveMutation.isPending ? 'Saving…' : pendingFile ? 'Upload & Save' : 'Save'}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

export default function Settings() {
  const [tab, setTab] = useState('profile')
  const { user, refreshUser } = useAuth()

  const [firstName,    setFirstName]    = useState(user?.first_name ?? '')
  const [lastName,     setLastName]     = useState(user?.last_name  ?? '')
  const [email,        setEmail]        = useState(user?.email      ?? '')

  const [currentPw,   setCurrentPw]   = useState('')
  const [newPw,       setNewPw]       = useState('')
  const [confirmPw,   setConfirmPw]   = useState('')

  const [profileMsg,  setProfileMsg]  = useState(null)
  const [passwordMsg, setPasswordMsg] = useState(null)

  const updateProfile = useMutation({
    mutationFn: (body) => profileApi.update(body),
    onSuccess: async () => {
      await refreshUser()
      setProfileMsg({ type: 'ok', text: 'Profile updated successfully.' })
    },
    onError: (err) => {
      setProfileMsg({ type: 'err', text: err.message })
    },
  })

  const changePassword = useMutation({
    mutationFn: (body) => authApi.changePassword(body),
    onSuccess: () => {
      setPasswordMsg({ type: 'ok', text: 'Password changed successfully.' })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    },
    onError: (err) => {
      setPasswordMsg({ type: 'err', text: err.message })
    },
  })

  const handleSaveProfile = (e) => {
    e.preventDefault()
    setProfileMsg(null)
    updateProfile.mutate({
      national_id: user?.profile?.national_id ?? '',
      bio:         user?.profile?.bio         ?? '',
      user: { first_name: firstName, last_name: lastName },
    })
  }

  const handleChangePassword = (e) => {
    e.preventDefault()
    setPasswordMsg(null)
    if (newPw !== confirmPw) {
      setPasswordMsg({ type: 'err', text: 'New passwords do not match.' })
      return
    }
    changePassword.mutate({ current_password: currentPw, new_password: newPw })
  }

  const initials = ((user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '')).toUpperCase() ||
    user?.username?.[0]?.toUpperCase() || '?'

  return (
    <div className="animate-fade-in max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="Manage your account preferences and profile."
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-5" />

      {tab === 'profile' && (
        <div className="space-y-5">
          <SectionCard title="Profile Information">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-ceda-forest flex items-center justify-center ring-4 ring-ceda-green/20 flex-shrink-0">
                <span className="text-white text-xl font-bold">{initials}</span>
              </div>
              <div>
                <p className="font-semibold text-ceda-dark">
                  {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || '—'}
                </p>
                <p className="text-sm text-ceda-muted">{user?.email}</p>
                {user?.is_admin && (
                  <span className="mt-1 inline-block badge bg-ceda-green-pale text-ceda-forest">Administrator</span>
                )}
                {user?.roles?.length > 0 && !user?.is_admin && (
                  <span className="mt-1 inline-block badge bg-ceda-surface text-ceda-muted capitalize">
                    {user.roles.join(', ')}
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">First Name</label>
                  <input
                    type="text"
                    className="input"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input
                    type="text"
                    className="input"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    className="input"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email address"
                    disabled
                  />
                  <p className="text-xs text-ceda-muted mt-1">Email cannot be changed here.</p>
                </div>
              </div>

              {profileMsg && (
                <div className={`mt-4 px-3 py-2 rounded-lg text-sm ${
                  profileMsg.type === 'ok'
                    ? 'bg-ceda-green-pale text-ceda-green-muted'
                    : 'bg-ceda-red-pale text-ceda-red'
                }`}>
                  {profileMsg.text}
                </div>
              )}

              <div className="flex justify-end mt-5">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={updateProfile.isPending}
                >
                  {updateProfile.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </SectionCard>
        </div>
      )}

      {tab === 'notifications' && (
        <SectionCard title="Notification Preferences">
          <div className="space-y-5">
            {[
              { label: 'New task assigned to me',   desc: 'Get notified when a review or evaluation task is assigned.',  checked: true },
              { label: 'Submission status changes',  desc: 'Notifications when a submission you manage changes state.',   checked: true },
              { label: 'Claimable tasks available',  desc: 'Alert when new tasks are available to claim.',                checked: false },
              { label: 'Program deadlines',          desc: 'Reminders for upcoming program submission deadlines.',        checked: true },
              { label: 'System announcements',       desc: 'Important platform updates and maintenance notices.',         checked: true },
            ].map(item => (
              <div key={item.label} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ceda-dark">{item.label}</p>
                  <p className="text-xs text-ceda-muted">{item.desc}</p>
                </div>
                <label className="relative inline-flex items-center flex-shrink-0 cursor-pointer mt-0.5">
                  <input type="checkbox" className="sr-only peer" defaultChecked={item.checked} />
                  <div className="w-9 h-5 rounded-full bg-ceda-border peer-checked:bg-ceda-forest transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                </label>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-6">
            <button className="btn-primary">Save Preferences</button>
          </div>
        </SectionCard>
      )}

      {tab === 'site_media' && <SiteMediaTab />}

      {tab === 'security' && (
        <div className="space-y-5">
          <SectionCard title="Change Password">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="label">Current Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                />
              </div>
              <div>
                <label className="label">New Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                />
              </div>

              {passwordMsg && (
                <div className={`px-3 py-2 rounded-lg text-sm ${
                  passwordMsg.type === 'ok'
                    ? 'bg-ceda-green-pale text-ceda-green-muted'
                    : 'bg-ceda-red-pale text-ceda-red'
                }`}>
                  {passwordMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={changePassword.isPending || !currentPw || !newPw || !confirmPw}
                >
                  {changePassword.isPending ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Account Info">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ceda-muted">Email</span>
                <span className="text-ceda-dark">{user?.email ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ceda-muted">Roles</span>
                <span className="text-ceda-dark capitalize">{user?.roles?.join(', ') ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ceda-muted">Admin</span>
                <span className="text-ceda-dark">{user?.is_admin ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  )
}
