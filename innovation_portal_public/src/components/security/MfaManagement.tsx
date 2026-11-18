import { useState } from 'react'
import { ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react'
import type { AccountSecurity } from '../../types/security'
import { securityService } from '../../services/security.service'
import { parseApiError } from '../../utils/apiError'
import Button from '../ui/Button'

interface Props {
  data: AccountSecurity
  onRefresh: () => void
}

const METHOD_LABEL: Record<string, string> = {
  email: 'Email OTP',
  totp: 'Authenticator app',
}

export default function MfaManagement({ data, onRefresh }: Props) {
  const [flow, setFlow] = useState<'idle' | 'choose' | 'setup-email' | 'setup-totp' | 'disable'>('idle')
  const [setup, setSetup] = useState<{
    method?: string
    challenge_id?: string
    email_hint?: string
    secret?: string
    otpauth_uri?: string
    qr_png?: string
  }>({})
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const enabled = !!data.mfa_enabled
  const method = data.mfa_method ?? ''

  const reset = () => {
    setFlow('idle')
    setSetup({})
    setCode('')
    setError('')
    setMessage('')
  }

  const startSetup = async (methodChoice: 'email' | 'totp') => {
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const payload = await securityService.startMfaSetup(methodChoice)
      setSetup(payload)
      setFlow(methodChoice === 'email' ? 'setup-email' : 'setup-totp')
    } catch (err) {
      setError(parseApiError(err, 'Could not start MFA setup.'))
    } finally {
      setLoading(false)
    }
  }

  const confirmSetup = async () => {
    if (!setup.method) return
    setError('')
    setLoading(true)
    try {
      await securityService.confirmMfaSetup({
        method: setup.method as 'email' | 'totp',
        code,
        challenge_id: setup.challenge_id,
      })
      setMessage('Multi-factor authentication enabled.')
      setCode('')
      setSetup({})
      setFlow('idle')
      onRefresh()
    } catch (err) {
      setError(parseApiError(err, 'Could not verify the code.'))
    } finally {
      setLoading(false)
    }
  }

  const startDisable = async () => {
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const payload = await securityService.startMfaDisable()
      setSetup(payload)
      setFlow('disable')
    } catch (err) {
      setError(parseApiError(err, 'Could not start MFA disable.'))
    } finally {
      setLoading(false)
    }
  }

  const confirmDisable = async () => {
    if (!setup.challenge_id) return
    setError('')
    setLoading(true)
    try {
      await securityService.confirmMfaDisable(setup.challenge_id, code)
      setMessage('Multi-factor authentication disabled.')
      setCode('')
      setSetup({})
      setFlow('idle')
      onRefresh()
    } catch (err) {
      setError(parseApiError(err, 'Could not disable MFA.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          enabled ? 'bg-emerald-50' : 'bg-amber-50'
        }`}>
          {enabled ? <ShieldCheck size={16} className="text-emerald-600" /> : <ShieldAlert size={16} className="text-amber-500" />}
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-sm">Multi-factor authentication</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {enabled
              ? `Enabled — ${METHOD_LABEL[method] ?? method}.`
              : 'Add a second step to protect your account.'}
          </p>
        </div>
        {enabled && (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shrink-0">
            Enabled
          </span>
        )}
      </div>

      <div className="px-6 py-5 space-y-4">
        {message && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!enabled && flow === 'idle' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => startSetup('email')}
              className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <p className="text-sm font-semibold text-gray-900">Email OTP</p>
              <p className="text-xs text-gray-500 mt-1">Receive a 6-digit code in your inbox.</p>
            </button>
            <button
              onClick={() => startSetup('totp')}
              className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <p className="text-sm font-semibold text-gray-900">Authenticator app</p>
              <p className="text-xs text-gray-500 mt-1">Use Google Authenticator or similar.</p>
            </button>
          </div>
        )}

        {enabled && flow === 'idle' && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setFlow('choose')}>Switch method</Button>
            <Button onClick={startDisable} variant="secondary">
              Disable MFA
            </Button>
          </div>
        )}

        {flow === 'choose' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => startSetup('email')}
                className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <p className="text-sm font-semibold text-gray-900">Email OTP</p>
                <p className="text-xs text-gray-500 mt-1">Receive a code each time you sign in.</p>
              </button>
              <button
                onClick={() => startSetup('totp')}
                className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <p className="text-sm font-semibold text-gray-900">Authenticator app</p>
                <p className="text-xs text-gray-500 mt-1">Use an authenticator app code.</p>
              </button>
            </div>
            <button onClick={reset} className="text-xs font-semibold text-gray-500 hover:underline">
              Cancel
            </button>
          </div>
        )}

        {flow === 'setup-email' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              We sent a 6-digit code to {setup.email_hint ?? 'your email'}.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30"
            />
            <div className="flex gap-2 items-center">
              <Button onClick={confirmSetup} loading={loading}>Verify & enable</Button>
              <button onClick={() => startSetup('email')} className="text-xs font-semibold text-gray-500 hover:text-[#A01E0A] inline-flex items-center gap-1">
                <RefreshCw size={12} /> Resend code
              </button>
            </div>
          </div>
        )}

        {flow === 'setup-totp' && (
          <div className="space-y-3">
            {setup.qr_png && (
              <div className="flex justify-center">
                <img src={setup.qr_png} alt="Authenticator QR code" className="w-36 h-36" />
              </div>
            )}
            {setup.secret && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-600">
                Manual key: <span className="font-mono text-gray-800">{setup.secret}</span>
              </div>
            )}
            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30"
            />
            <Button onClick={confirmSetup} loading={loading}>Verify & enable</Button>
          </div>
        )}

        {flow === 'disable' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Enter the code from {setup.method === 'email' ? 'your email' : 'your authenticator app'} to disable MFA.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30"
            />
            <div className="flex gap-2 items-center">
              <Button onClick={confirmDisable} loading={loading}>Disable</Button>
              {setup.method === 'email' && (
                <button onClick={startDisable} className="text-xs font-semibold text-gray-500 hover:text-[#A01E0A] inline-flex items-center gap-1">
                  <RefreshCw size={12} /> Resend code
                </button>
              )}
              <button onClick={reset} className="text-xs font-semibold text-gray-500 hover:underline ml-auto">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
