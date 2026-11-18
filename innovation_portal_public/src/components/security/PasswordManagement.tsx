import { useState } from 'react'
import { Eye, EyeOff, CheckCircle2, KeyRound } from 'lucide-react'
import type { AccountSecurity } from '../../types/security'
import { securityService } from '../../services/security.service'
import { parseApiError, parseFieldErrors } from '../../utils/apiError'
import { passwordSetSuccessMsg, passwordChangedSuccessMsg } from '../../utils/securityLabels'
import Button from '../ui/Button'

interface Props {
  data:            AccountSecurity
  onRefresh:       () => void
  startExpanded?:  boolean
}

const inp = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30'


function SetPasswordForm({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrs({})
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await securityService.setPassword(password)
      onSuccess(passwordSetSuccessMsg())
    } catch (err) {
      setFieldErrs(parseFieldErrors(err))
      setError(parseApiError(err, 'Failed to set password. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'} required placeholder="At least 8 characters"
            value={password} onChange={e => setPassword(e.target.value)}
            className={`${inp} pr-10 ${fieldErrs.password ? 'border-red-400' : ''}`}
          />
          <button type="button" onClick={() => setShowPw(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {fieldErrs.password && <p className="text-xs text-red-500 mt-1">{fieldErrs.password}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
        <input
          type={showPw ? 'text' : 'password'} required placeholder="Re-enter your password"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          className={`${inp} ${confirm && password !== confirm ? 'border-red-400' : ''}`}
        />
        {confirm && password !== confirm && (
          <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
        )}
      </div>
      <Button type="submit" loading={loading} className="w-full sm:w-auto">
        Add password
      </Button>
    </form>
  )
}


function ChangePasswordForm({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const [current,   setCurrent]   = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrs({})
    if (!current) { setError('Enter your current password.'); return }
    if (password.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await securityService.changePassword(current, password)
      onSuccess(passwordChangedSuccessMsg())
    } catch (err) {
      setFieldErrs(parseFieldErrors(err))
      setError(parseApiError(err, 'Could not change password. Check your current password and try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Current password</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'} required placeholder="Your current password"
            value={current} onChange={e => setCurrent(e.target.value)}
            className={`${inp} pr-10 ${fieldErrs.current_password ? 'border-red-400' : ''}`}
          />
          <button type="button" onClick={() => setShowPw(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {fieldErrs.current_password && <p className="text-xs text-red-500 mt-1">{fieldErrs.current_password}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
        <input
          type={showPw ? 'text' : 'password'} required placeholder="At least 8 characters"
          value={password} onChange={e => setPassword(e.target.value)}
          className={`${inp} ${fieldErrs.new_password ? 'border-red-400' : ''}`}
        />
        {fieldErrs.new_password && <p className="text-xs text-red-500 mt-1">{fieldErrs.new_password}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
        <input
          type={showPw ? 'text' : 'password'} required placeholder="Re-enter new password"
          value={confirm} onChange={e => setConfirm(e.target.value)}
          className={`${inp} ${confirm && password !== confirm ? 'border-red-400' : ''}`}
        />
        {confirm && password !== confirm && (
          <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
        )}
      </div>
      <Button type="submit" loading={loading} className="w-full sm:w-auto">
        Update password
      </Button>
    </form>
  )
}


export default function PasswordManagement({ data, onRefresh, startExpanded = false }: Props) {
  const [showSetForm,    setShowSetForm]    = useState(startExpanded && data.can_set_password)
  const [showChangeForm, setShowChangeForm] = useState(false)
  const [successMsg,     setSuccessMsg]     = useState('')

  const handleSuccess = (msg: string) => {
    setShowSetForm(false)
    setShowChangeForm(false)
    setSuccessMsg(msg)
    onRefresh()
    setTimeout(() => setSuccessMsg(''), 6000)
  }

  return (
    <div className="rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          data.has_password ? 'bg-green-50' : 'bg-gray-100'
        }`}>
          <KeyRound size={16} className={data.has_password ? 'text-green-600' : 'text-gray-400'} />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-sm">Password</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {data.has_password
              ? 'You can sign in with email and password.'
              : 'Add a password to have a backup way to sign in.'}
          </p>
        </div>
        {data.has_password && (
          <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200 shrink-0">
            Set
          </span>
        )}
      </div>

      <div className="px-6 py-5 space-y-4">
        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <CheckCircle2 size={15} className="shrink-0" />
            {successMsg}
          </div>
        )}

        {data.can_set_password && !successMsg && (
          <div>
            {!showSetForm ? (
              <button
                onClick={() => setShowSetForm(true)}
                className="text-sm font-semibold text-[#A01E0A] hover:text-[#F0641E] transition-colors underline underline-offset-2"
              >
                Add a password
              </button>
            ) : (
              <SetPasswordForm onSuccess={handleSuccess} />
            )}
          </div>
        )}

        {data.can_change_password && !successMsg && (
          <div>
            {!showChangeForm ? (
              <button
                onClick={() => setShowChangeForm(true)}
                className="text-sm font-semibold text-gray-500 hover:text-[#A01E0A] transition-colors"
              >
                Change password
              </button>
            ) : (
              <ChangePasswordForm onSuccess={handleSuccess} />
            )}
          </div>
        )}

        {data.has_password && !data.can_change_password && !successMsg && (
          <p className="text-xs text-gray-400">
            Password changes are not available right now. Contact support if you need help.
          </p>
        )}

        {!data.has_password && !data.can_set_password && !successMsg && (
          <p className="text-xs text-gray-400">
            Password sign-in is not available for your account type.
          </p>
        )}
      </div>
    </div>
  )
}
