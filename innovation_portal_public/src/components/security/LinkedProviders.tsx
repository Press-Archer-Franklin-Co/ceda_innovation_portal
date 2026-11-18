import { useState } from 'react'
import { CheckCircle2, Link2, Link2Off, Star } from 'lucide-react'
import type { AccountSecurity, LinkedProviderInfo } from '../../types/security'
import type { SocialProvider } from '../../services/auth.service'
import { securityService } from '../../services/security.service'
import { PROVIDER_META, unlinkBlockReason, providerUnlinkedSuccessMsg } from '../../utils/securityLabels'
import { parseApiError } from '../../utils/apiError'


function ProviderIcon({ provider, size = 18 }: { provider: string; size?: number }) {
  if (provider === 'google') return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
  if (provider === 'github') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-gray-800" aria-hidden>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  )
  if (provider === 'microsoft') return (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden>
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1"  width="9" height="9" fill="#00a4ef"/>
      <rect x="1"  y="11" width="9" height="9" fill="#7fba00"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  )
  return <Link2 size={size} className="text-gray-400" />
}


interface RowProps {
  providerKey: string
  linked:      LinkedProviderInfo | undefined
  enabled:     boolean
  secData:     AccountSecurity
  onSuccess:   (msg: string) => void
}

function ProviderRow({ providerKey, linked, enabled, secData, onSuccess }: RowProps) {
  const [loadingAction, setLoadingAction] = useState<'link' | 'unlink' | null>(null)
  const [rowError,      setRowError]      = useState('')

  const meta      = PROVIDER_META[providerKey] ?? { label: providerKey, description: '' }
  const isLinked  = !!linked?.linked
  const isPrimary = !!linked?.is_primary

  const blockReason = isLinked
    ? unlinkBlockReason(secData.blocking_flags, secData.has_password, secData.linked_provider_count)
    : null

  const handleLink = async () => {
    if (!enabled) return
    setRowError('')
    setLoadingAction('link')
    try {
      sessionStorage.setItem('oauth_action',   'link')
      sessionStorage.setItem('oauth_provider', providerKey)
      const res = await securityService.startProviderLink(providerKey)
      if (res.authorization_url) {
        window.location.href = res.authorization_url
      } else {
        setRowError('Could not start the sign-in flow. Please try again.')
        setLoadingAction(null)
      }
    } catch (err) {
      setRowError(parseApiError(err, `Could not connect ${meta.label}. Please try again.`))
      setLoadingAction(null)
    }
  }

  const handleUnlink = async () => {
    if (blockReason) {
      setRowError(blockReason)
      return
    }
    setRowError('')
    setLoadingAction('unlink')
    try {
      await securityService.unlinkProvider(providerKey)
      const remaining = Math.max(0, secData.linked_provider_count - 1)
      onSuccess(providerUnlinkedSuccessMsg(providerKey, remaining))
    } catch (err) {
      setRowError(parseApiError(err, `Could not remove ${meta.label}. Please try again.`))
      setLoadingAction(null)
    }
  }

  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-50 last:border-0">
      <div className="w-10 h-10 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center shrink-0">
        <ProviderIcon provider={providerKey} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
          {isPrimary && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#A01E0A] bg-[#A01E0A]/8 px-2 py-0.5 rounded-full">
              <Star size={9} /> Primary
            </span>
          )}
          {isLinked && !isPrimary && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
              <CheckCircle2 size={9} /> Connected
            </span>
          )}
        </div>

        {rowError && (
          <p className="text-xs text-red-500 mt-1 leading-relaxed">{rowError}</p>
        )}
      </div>

      {isLinked ? (
        <button
          onClick={handleUnlink}
          disabled={loadingAction !== null}
          className={[
            'shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors',
            loadingAction !== null
              ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed'
              : 'border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-500 hover:bg-red-50',
          ].join(' ')}
        >
          <Link2Off size={12} />
          {loadingAction === 'unlink' ? 'Removing…' : 'Remove'}
        </button>
      ) : (
        <button
          onClick={handleLink}
          disabled={!enabled || loadingAction !== null}
          title={!enabled ? `${meta.label} sign-in is not yet available` : undefined}
          className={[
            'shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors',
            enabled && loadingAction === null
              ? 'border-[#A01E0A]/30 text-[#A01E0A] hover:bg-[#A01E0A]/5'
              : 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed',
          ].join(' ')}
        >
          <Link2 size={12} />
          {loadingAction === 'link' ? 'Connecting…' : enabled ? 'Connect' : 'Soon'}
        </button>
      )}
    </div>
  )
}


const KNOWN_PROVIDERS = ['google', 'github', 'microsoft'] as const

interface Props {
  data:      AccountSecurity
  providers: SocialProvider[]
  onRefresh: () => void
}

export default function LinkedProviders({ data, providers, onRefresh }: Props) {
  const [successMsg, setSuccessMsg] = useState('')

  const enabledMap = Object.fromEntries(providers.map(p => [p.provider, p.enabled]))
  const linkedMap  = Object.fromEntries((data.linked_accounts ?? []).map(a => [a.provider, a]))

  const handleSuccess = (msg: string) => {
    setSuccessMsg(msg)
    onRefresh()
    setTimeout(() => setSuccessMsg(''), 6000)
  }

  const allDisabled = providers.length > 0 && providers.every(p => !p.enabled)

  return (
    <div className="rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-white overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <p className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-[#F0641E] mb-0.5">Sign-in</p>
        <h3 className="font-bold text-gray-900">Connected accounts</h3>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Each connected account gives you another way to sign in.
        </p>
      </div>

      {successMsg && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 size={15} className="shrink-0" />
          {successMsg}
        </div>
      )}

      <div className="px-6">
        {KNOWN_PROVIDERS.map(key => (
          <ProviderRow
            key={key}
            providerKey={key}
            linked={linkedMap[key]}
            enabled={enabledMap[key] ?? false}
            secData={data}
            onSuccess={handleSuccess}
          />
        ))}
      </div>

      {allDisabled && (
        <p className="px-6 pb-5 text-xs text-gray-400">
          Social sign-in is coming soon.
        </p>
      )}
    </div>
  )
}
