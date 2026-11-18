import React, { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Users as UsersIcon,
  ShieldCheck,
  UserRound,
  Mail,
  Phone,
  KeyRound,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Send,
  X,
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import DataTable from '../../components/ui/DataTable'
import ErrorState from '../../components/ui/ErrorState'
import StatusPill from '../../components/ui/StatusPill'
import { users as usersApi } from '../../lib/api/endpoints'
import ActionDrawer from '../../components/assignments/ActionDrawer'

const ROLE_OPTIONS = [
  { value: 'innovator', label: 'Innovator', description: 'Can submit and track innovation ideas.' },
  { value: 'innovation_officer', label: 'Innovation Officer', description: 'Claims and scores officer review steps.' },
  { value: 'innovation_manager', label: 'Innovation Manager', description: 'Approves officer and committee outcomes before the workflow moves on.' },
  { value: 'administrator', label: 'Administrator', description: 'Full staff administration access.' },
  { value: 'specialist', label: 'Specialist / Committee Reviewer', description: 'Can complete invited specialist or committee reviews.' },
  { value: 'judge', label: 'Judge', description: 'Can review assigned judging work.' },
  { value: 'mentor', label: 'Mentor', description: 'Supports assigned innovation work.' },
]

function roleLabel(value) {
  return ROLE_OPTIONS.find(r => r.value === value)?.label ?? (value ? value.replace(/_/g, ' ') : '—')
}

const AUTH_METHOD_LABELS = {
  password: 'Password',
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
}

function fmtDate(value, includeTime = false) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

function authLabel(value) {
  return value ? (AUTH_METHOD_LABELS[value] ?? String(value).replace(/_/g, ' ')) : '—'
}

function boolPill(value, trueLabel = 'Yes', falseLabel = 'No') {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      {value ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {value ? trueLabel : falseLabel}
    </span>
  )
}

export default function Users() {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [active, setActive] = useState('')
  const [verified, setVerified] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedRoles, setSelectedRoles] = useState([])
  const [drawerError, setDrawerError] = useState('')
  const [ccInput, setCcInput] = useState('')
  const [ccEmails, setCcEmails] = useState([])
  const [resendSuccess, setResendSuccess] = useState('')
  const [resendError, setResendError] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', { search, role, active, verified, page, pageSize }],
    queryFn: () => usersApi.list({ search, role, active, verified, page, page_size: pageSize }),
  })

  const items = Array.isArray(data) ? data : data?.results ?? []
  const totalCount = Array.isArray(data) ? items.length : data?.count ?? items.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const pageStart = totalCount === 0 ? 0 : ((page - 1) * pageSize) + 1
  const pageEnd = Math.min(page * pageSize, totalCount)
  const verifiedCount = items.filter((user) => user.email_verified).length
  const staffCount = items.filter((user) => user.is_staff || user.is_superuser || (user.roles ?? []).some((r) => r !== 'innovator')).length

  const resetPage = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const mutation = useMutation({
    mutationFn: ({ id, roles }) => usersApi.updateRole(id, { roles }),
    onSuccess: () => {
      setDrawerError('')
      setSelectedUser(null)
      setSelectedRoles([])
      refetch()
    },
    onError: (err) => {
      setDrawerError(err?.message ?? 'Could not update role.')
    },
  })

  const resendMutation = useMutation({
    mutationFn: ({ id, cc }) => usersApi.resendVerification(id, { cc }),
    onSuccess: () => {
      setResendSuccess('Verification email sent successfully.')
      setResendError('')
      setCcEmails([])
      setCcInput('')
    },
    onError: (err) => {
      setResendError(err?.message ?? 'Could not send verification email.')
      setResendSuccess('')
    },
  })

  const handleOpen = (user) => {
    setSelectedUser(user)
    setSelectedRoles(user.roles ?? [])
    setDrawerError('')
    setCcEmails([])
    setCcInput('')
    setResendSuccess('')
    setResendError('')
  }

  const handleAddCc = () => {
    const email = ccInput.trim().toLowerCase()
    if (!email) return
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!isValid) return
    if (ccEmails.includes(email)) { setCcInput(''); return }
    if (ccEmails.length >= 10) return
    setCcEmails((prev) => [...prev, email])
    setCcInput('')
  }

  const handleCcKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddCc()
    }
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Users" subtitle="Manage account roles and access for staff and innovators." />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <SectionCard title="Total Users" subtitle="Matching filters">
          <p className="text-2xl font-bold text-ceda-dark">{totalCount}</p>
        </SectionCard>
        <SectionCard title="This Page" subtitle={`${pageStart}-${pageEnd} currently shown`}>
          <p className="text-2xl font-bold text-ceda-dark">{items.length}</p>
        </SectionCard>
        <SectionCard title="Verified Here" subtitle="On current page">
          <p className="text-2xl font-bold text-ceda-dark">{verifiedCount}</p>
        </SectionCard>
        <SectionCard title="Staff Here" subtitle="Non-innovator or staff">
          <p className="text-2xl font-bold text-ceda-dark">{staffCount}</p>
        </SectionCard>
      </div>
      <SectionCard
        title="Directory"
        subtitle={totalCount ? `Showing ${pageStart}-${pageEnd} of ${totalCount} users` : 'No users match the current filters'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input h-9 py-0 text-sm w-36" value={role} onChange={(e) => resetPage(setRole)(e.target.value)}>
              <option value="">All roles</option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="input h-9 py-0 text-sm w-32" value={active} onChange={(e) => resetPage(setActive)(e.target.value)}>
              <option value="">Any status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <select className="input h-9 py-0 text-sm w-36" value={verified} onChange={(e) => resetPage(setVerified)(e.target.value)}>
              <option value="">Any verification</option>
              <option value="true">Verified</option>
              <option value="false">Pending verify</option>
            </select>
            <input className="input h-9 py-0 text-sm w-56" placeholder="Search name or email…" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} />
          </div>
        }
        padding={false}
      >
        <DataTable
          loading={isLoading}
          columns={[
            {
              key: 'full_name',
              label: 'User',
              sortable: true,
              render: (value, row) => (
                <button type="button" onClick={() => handleOpen(row)} className="text-left group">
                  <p className="text-sm font-semibold text-ceda-dark group-hover:text-ceda-forest">{value || row.email || '—'}</p>
                  <p className="text-xs text-ceda-muted flex items-center gap-1 mt-0.5">
                    <Mail size={11} /> {row.email}
                  </p>
                  {row.phone_number && (
                    <p className="text-[11px] text-ceda-muted flex items-center gap-1 mt-0.5">
                      <Phone size={10} /> {row.phone_number}
                    </p>
                  )}
                </button>
              ),
            },
            {
              key: 'primary_role',
              label: 'Roles',
              render: (value, row) => (
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-ceda-green-pale text-ceda-forest px-2.5 py-1 text-[11px] font-semibold">
                    <ShieldCheck size={12} /> {roleLabel(value)}
                  </span>
                  {row.primary_role_source && row.primary_role_source !== value && (
                    <p className="text-[10px] text-ceda-muted mt-1">Legacy: {row.primary_role_source}</p>
                  )}
                  {Array.isArray(row.roles) && row.roles.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.roles.map((r) => (
                        <span key={r} className="inline-flex items-center rounded-full border border-ceda-border px-2 py-0.5 text-[10px] text-ceda-muted">
                          {roleLabel(r)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'auth',
              label: 'Access',
              width: 190,
              render: (value, row) => (
                <div className="space-y-1.5">
                  <p className="text-xs text-ceda-dark flex items-center gap-1.5">
                    <KeyRound size={12} className="text-ceda-muted" />
                    {authLabel(row.primary_auth_method || value?.provider)}
                    {Array.isArray(value?.linked_providers) && value.linked_providers.length > 0 && (
                      <span className="text-ceda-muted">+{value.linked_providers.length}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {boolPill(row.email_verified, 'Verified', 'Pending')}
                    {value?.mfa_enabled && boolPill(true, 'MFA', 'MFA')}
                  </div>
                </div>
              ),
            },
            { key: 'is_active', label: 'Status', width: 120, render: (value) => <StatusPill status={value ? 'active' : 'inactive'} /> },
            {
              key: 'last_login',
              label: 'Activity',
              width: 160,
              render: (value, row) => (
                <div>
                  <p className="text-xs text-ceda-dark">Last: {fmtDate(value)}</p>
                  <p className="text-[11px] text-ceda-muted">Joined: {fmtDate(row.created_at)}</p>
                </div>
              ),
            },
            {
              key: 'actions',
              label: '',
              width: 140,
              align: 'right',
              render: (_, row) => (
                <button
                  onClick={(e) => { e.stopPropagation(); handleOpen(row) }}
                  className="text-xs font-semibold text-ceda-forest hover:underline"
                >
                  Change role
                </button>
              ),
            },
          ]}
          data={items}
          emptyTitle="No users found"
          emptyMessage="Adjust the current filters or search term."
          emptyIcon={UsersIcon}
          footer={(
            <>
              <div className="flex items-center gap-2 text-xs text-ceda-muted">
                <span>Rows per page</span>
                <select
                  className="input h-8 py-0 text-xs w-20"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                >
                  {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                <span>{pageStart}-{pageEnd} of {totalCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <span className="text-xs text-ceda-muted">Page {page} of {totalPages}</span>
                <button
                  className="btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}
        />
      </SectionCard>

      <ActionDrawer
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="Change user role"
        subtitle={selectedUser ? `${selectedUser.full_name || 'User'} · ${selectedUser.email}` : ''}
        footer={(
          <div className="flex items-center gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setSelectedUser(null)}>Cancel</button>
            <button
              onClick={() => mutation.mutate({ id: selectedUser.id, roles: selectedRoles })}
              className="btn-primary"
              disabled={selectedRoles.length === 0}
            >
              {mutation.isLoading ? 'Saving…' : 'Save role'}
            </button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-ceda-border bg-ceda-surface p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-ceda-muted">
              <UserRound size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ceda-dark">{selectedUser?.full_name || 'User'}</p>
              <p className="text-xs text-ceda-muted">{selectedUser?.email}</p>
            </div>
          </div>

          {selectedUser && !selectedUser.email_verified && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <XCircle size={16} className="text-amber-600 shrink-0" />
                <p className="text-sm font-semibold text-amber-800">Account not verified</p>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                We noticed this user has not verified their account. You can resend the verification
                email on their behalf. They will be notified that support has resent the link.
              </p>

              <div className="space-y-2">
                <label className="label text-amber-800">CC (optional)</label>
                <div className="flex gap-2">
                  <input
                    className="input h-9 py-0 text-sm flex-1"
                    placeholder="cc@example.com then press Enter"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    onKeyDown={handleCcKeyDown}
                    onBlur={handleAddCc}
                  />
                  <button
                    type="button"
                    onClick={handleAddCc}
                    className="btn-secondary h-9 px-3 text-xs"
                  >
                    Add
                  </button>
                </div>
                {ccEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {ccEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 rounded-full bg-white border border-amber-200 px-2.5 py-1 text-[11px] font-medium text-amber-800"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => setCcEmails((prev) => prev.filter((e) => e !== email))}
                          className="hover:text-red-600"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-amber-600">
                  These addresses will receive a copy of the verification email. Max 10.
                </p>
              </div>

              {resendSuccess && (
                <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 px-3 py-2 text-xs flex items-center gap-2">
                  <CheckCircle2 size={13} /> {resendSuccess}
                </div>
              )}
              {resendError && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 px-3 py-2 text-xs">
                  {resendError}
                </div>
              )}

              <button
                type="button"
                onClick={() => resendMutation.mutate({ id: selectedUser.id, cc: ccEmails })}
                disabled={resendMutation.isLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2 transition-colors disabled:opacity-60"
              >
                <Send size={13} />
                {resendMutation.isLoading ? 'Sending…' : 'Resend verification email'}
              </button>
            </div>
          )}

          <div>
            <label className="label">Roles</label>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${
                    selectedRoles.includes(opt.value)
                      ? 'border-ceda-forest bg-ceda-green-pale/50 text-ceda-dark'
                      : 'border-ceda-border bg-white text-ceda-dark hover:bg-ceda-surface'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="checkbox mt-1"
                    checked={selectedRoles.includes(opt.value)}
                    onChange={(e) => {
                      setSelectedRoles((prev) => (
                        e.target.checked
                          ? [...prev, opt.value]
                          : prev.filter((r) => r !== opt.value)
                      ))
                    }}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {opt.label}
                      {opt.value === 'innovation_manager' && (
                        <span className="rounded-full bg-ceda-forest px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Manager approval
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-ceda-muted">{opt.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-ceda-muted mt-2">
              Select all roles that should apply to this user. At least one role is required.
            </p>
          </div>

          {drawerError && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 px-3 py-2 text-xs">
              {drawerError}
            </div>
          )}

          {selectedUser?.auth && (
            <div className="rounded-xl border border-ceda-border bg-white p-4 space-y-2">
              <p className="text-xs font-semibold text-ceda-muted uppercase tracking-widest">Auth</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ceda-muted">Provider</span>
                  <span className="text-ceda-dark">{authLabel(selectedUser.auth.provider)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ceda-muted">Email Verified</span>
                  <span className="text-ceda-dark">{selectedUser.auth.email_verified ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ceda-muted">MFA</span>
                  <span className="text-ceda-dark">{selectedUser.auth.mfa_enabled ? (selectedUser.auth.mfa_method || 'Enabled') : 'Disabled'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ceda-muted">Active</span>
                  <span className="text-ceda-dark">{selectedUser.auth.is_active ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ceda-muted">Last Login</span>
                  <span className="text-ceda-dark">{fmtDate(selectedUser.auth.last_login, true)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ceda-muted">Created</span>
                  <span className="text-ceda-dark">{fmtDate(selectedUser.auth.created_at)}</span>
                </div>
              </div>
              {Array.isArray(selectedUser.auth.linked_providers) && selectedUser.auth.linked_providers.length > 0 && (
                <div className="text-xs text-ceda-muted">
                  Linked providers: {selectedUser.auth.linked_providers.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      </ActionDrawer>
    </div>
  )
}
