import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { authService, SocialProvider } from '../../services/auth.service'
import { parseApiError } from '../../utils/apiError'


function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#00a4ef"/>
      <rect x="1" y="11" width="9" height="9" fill="#7fba00"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  )
}

const ICONS: Record<string, React.ReactNode> = {
  google:    <GoogleIcon />,
  github:    <GitHubIcon />,
  microsoft: <MicrosoftIcon />,
}


interface Props {
  onSuccess: (tokens: { access: string; refresh: string }) => void
}

export default function SocialAuthButtons({ onSuccess }: Props) {
  const [providers,  setProviders]  = useState<SocialProvider[]>([])
  const [loadingId,  setLoadingId]  = useState<string | null>(null)
  const [error,      setError]      = useState('')
  const [loaded,     setLoaded]     = useState(false)
  const [loadError,  setLoadError]  = useState(false)

  useEffect(() => {
    authService.getSocialProviders()
      .then(list => { setProviders(list); setLoaded(true) })
      .catch(err => {
        console.error('[SocialAuthButtons] Failed to load providers:', err)
        setLoadError(true)
      })
  }, [])

  if (!loaded && !loadError) return null

  if (loadError) return (
    <div className="mt-6">
      <div className="relative flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium shrink-0">or continue with</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <p className="text-center text-[11px] text-gray-400">Social sign-in temporarily unavailable</p>
    </div>
  )

  if (providers.length === 0) return null

  const handleClick = async (provider: SocialProvider) => {
    if (!provider.enabled) return
    setError('')
    setLoadingId(provider.provider)
    try {
      const res = await authService.startSocialAuth(provider.provider)
      if (res.authorization_url) {
        sessionStorage.setItem('oauth_provider', provider.provider)
        window.location.href = res.authorization_url
      }
    } catch (err) {
      setError(parseApiError(err, `Could not start ${provider.label} sign in.`))
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="mt-6">
      <div className="relative flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium shrink-0">or continue with</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      <div className="flex items-center justify-center gap-3">
        {providers.map(p => (
          <button
            key={p.provider}
            type="button"
            disabled={!p.enabled || loadingId !== null}
            onClick={() => handleClick(p)}
            aria-label={p.enabled ? `Continue with ${p.label}` : `${p.label} coming soon`}
            title={p.enabled ? `Continue with ${p.label}` : `${p.label} coming soon`}
            className={[
              'w-11 h-11 flex items-center justify-center rounded-xl border transition-all duration-150',
              p.enabled && loadingId === null
                ? 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
                : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-40',
            ].join(' ')}
          >
            {loadingId === p.provider
              ? <Loader2 size={16} className="animate-spin text-gray-400" />
              : ICONS[p.provider]
            }
          </button>
        ))}
      </div>
    </div>
  )
}
