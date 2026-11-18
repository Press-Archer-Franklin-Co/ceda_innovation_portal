import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { securityService } from '../services/security.service'
import type { AccountSecurity } from '../types/security'
import type { SocialProvider } from '../services/auth.service'
import { parseApiError } from '../utils/apiError'
import { getSortedActions, providerLinkedSuccessMsg } from '../utils/securityLabels'

import SecurityOverview   from '../components/security/SecurityOverview'
import RecommendedActions from '../components/security/RecommendedActions'
import PasswordManagement from '../components/security/PasswordManagement'
import LinkedProviders    from '../components/security/LinkedProviders'
import MfaManagement      from '../components/security/MfaManagement'


function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-2xl border border-gray-100 bg-white h-[100px]" />
      <div className="rounded-2xl border border-gray-100 bg-white h-[88px]" />
      <div className="rounded-2xl border border-gray-100 bg-white h-[160px]" />
      <div className="rounded-2xl border border-gray-100 bg-white h-[180px]" />
    </div>
  )
}


export default function Security() {
  const { user } = useAuth()
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

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Account Security</h1>
            <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#A01E0A] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-4">
        {banner && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <CheckCircle2 size={15} className="shrink-0" />
            {banner}
          </div>
        )}

        {loading && <Skeleton />}

        {!loading && error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-8 text-center">
            <p className="text-sm font-semibold text-red-600 mb-1">Couldn't load security info</p>
            <p className="text-sm text-red-500 mb-4 leading-relaxed">{error}</p>
            <button
              onClick={() => fetchData()}
              className="text-sm font-semibold text-[#A01E0A] hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && secData && (
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

            <MfaManagement data={secData} onRefresh={() => fetchData(true)} />

            <div ref={passwordRef} className="scroll-mt-4">
              <PasswordManagement
                data={secData}
                onRefresh={() => fetchData(true)}
                startExpanded={passwordStartExpanded}
              />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
