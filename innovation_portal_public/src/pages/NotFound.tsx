import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { buttonClasses } from '../components/ui/Button'
import { SearchField, StatusScreen } from '../components/status/StatusScreen'
import { useI18n } from '../i18n'
import { isStaff as isStaffUser } from '../lib/roles'
import { usePageTitle } from '../lib/usePageTitle'

// Figma 1.14 › 404 (138:2787 website, 138:3113 phone): calm words, search and the main ways back.

const STAFF_PATHS = [
  '/dashboard', '/programs', '/submissions', '/assignments', '/history',
  '/evaluate', '/evaluations', '/analytics', '/users', '/audit',
  '/settings', '/content', '/marking-criteria', '/admin',
]

export default function NotFound() {
  const { t } = useI18n()
  const { user } = useAuth()
  const location = useLocation()
  const isStaff = isStaffUser(user)
  usePageTitle(t('notFound.title'))

  // Staff who followed an old console link land in the console instead.
  const looksLikeStaffPath = STAFF_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))
  if (isStaff && looksLikeStaffPath) {
    window.location.replace(window.location.origin + '/staff' + location.pathname + location.search)
    return null
  }

  return (
    <StatusScreen title={t('notFound.title')} body={t('notFound.body')}>
      <SearchField />
      <div className="flex flex-wrap justify-center gap-2.5">
        <Link to="/" className={buttonClasses({ variant: 'primary' })}>{t('notFound.home')}</Link>
        <Link to="/challenges" className={buttonClasses({ variant: 'secondary' })}>{t('notFound.challenges')}</Link>
        {isStaff && <a href="/staff/dashboard" className={buttonClasses({ variant: 'secondary' })}>{t('notFound.staff')}</a>}
      </div>
    </StatusScreen>
  )
}
