import { useEffect, useState } from 'react'
import { Mail, PencilLine } from 'lucide-react'
import { authService } from '../../services/auth.service'
import { useAuth } from '../../context/AuthContext'
import { parseApiError } from '../../utils/apiError'
import Button from './Button'

interface Props {
  email?: string
  title?: string
  message?: string
  variant?: 'card' | 'modal'
}

export default function VerificationRequired({
  email,
  title = 'Verify your email to continue',
  message = 'Email verification is required before you can submit.',
  variant = 'card',
}: Props) {
  const { refreshProfile } = useAuth()
  const [resendMsg, setResendMsg] = useState('')
  const [resendWait, setResendWait] = useState(0)
  const [editingEmail, setEditingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState(email ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (resendWait <= 0) return
    const timer = setTimeout(() => setResendWait((v) => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendWait])

  useEffect(() => {
    if (email) setNewEmail(email)
  }, [email])

  const handleResend = async () => {
    if (resendWait > 0) return
    setResendMsg('')
    try {
      await authService.resendVerification(email)
      setResendMsg('Verification email sent. Please check your inbox.')
      setResendWait(45)
    } catch (err) {
      setResendMsg(parseApiError(err, 'Could not resend verification email.'))
    }
  }

  const handleChangeEmail = async () => {
    if (!newEmail) return
    setSaving(true)
    setResendMsg('')
    try {
      await authService.changeEmail(newEmail)
      await refreshProfile()
      setEditingEmail(false)
      setResendMsg('Email updated. We sent a new verification link.')
      setResendWait(45)
    } catch (err) {
      setResendMsg(parseApiError(err, 'Could not update email.'))
    } finally {
      setSaving(false)
    }
  }

  const containerClass =
    variant === 'modal'
      ? 'space-y-3'
      : 'rounded-2xl border border-amber-100 bg-amber-50 px-6 py-5 space-y-3'

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Mail size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">{message}</p>
          {email && (
            <p className="text-xs text-gray-500 mt-1">
              Current email: <span className="font-semibold text-gray-700">{email}</span>
            </p>
          )}
        </div>
      </div>

      {resendMsg && (
        <div className="bg-white border border-emerald-100 text-emerald-700 rounded-xl px-4 py-3 text-sm">
          {resendMsg}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button onClick={handleResend} disabled={resendWait > 0} className="w-full sm:w-auto">
          {resendWait > 0 ? `Resend in ${resendWait}s` : 'Resend verification email'}
        </Button>
        <p className="text-xs text-gray-500">
          Tip: check your spam or promotions folder if you don’t see it.
        </p>
        {!editingEmail ? (
          <button
            onClick={() => setEditingEmail(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#A01E0A] hover:text-[#F0641E]"
          >
            <PencilLine size={14} /> Change email address
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="email"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@email.com"
            />
            <div className="flex gap-2">
              <Button onClick={handleChangeEmail} loading={saving} className="flex-1">
                Update email
              </Button>
              <button
                onClick={() => setEditingEmail(false)}
                className="flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
