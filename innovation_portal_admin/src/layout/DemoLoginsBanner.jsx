import React from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useT } from '../i18n/context'
import { useAuth } from '../lib/auth/AuthContext'
import { usePublicConfig } from '../lib/queries/platform'

/**
 * U7: "Test accounts are on" strip at the top of every console page, so nobody forgets to
 * switch them off before launch. The public config only lists test accounts while both the
 * server setting and the demo_logins switch are on.
 */
export default function DemoLoginsBanner() {
  const t = useT()
  const { can } = useAuth()
  const { data } = usePublicConfig()
  if (!data?.demo_logins) return null
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-dashed border-amber bg-warning-soft px-4 py-2 text-[12px] text-text">
      <Users size={14} aria-hidden className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1">{t('demo.banner')}</span>
      {can('settings.manage') && (
        <Link to="/admin/platform" className="font-semibold text-primary hover:underline">
          {t('demo.bannerLink')}
        </Link>
      )}
    </div>
  )
}
