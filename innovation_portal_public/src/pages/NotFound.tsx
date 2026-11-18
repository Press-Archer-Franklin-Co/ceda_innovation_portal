import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const STAFF_PORTAL_ROLES = [
  'administrator', 'admin',
  'innovation_officer', 'innovation_manager', 'innovation_analyst',
  'staff_member', 'specialist', 'exo', 'management_viewer',
  'judge', 'reviewer',
  'mentor',
]

export default function NotFound() {
  const { user } = useAuth()
  const location = useLocation()
  const isStaff  = (user?.roles ?? []).some(r => STAFF_PORTAL_ROLES.includes(r))

  const STAFF_PATHS = [
    '/dashboard', '/programs', '/submissions', '/assignments', '/history',
    '/evaluate', '/evaluations', '/analytics', '/users', '/audit',
    '/settings', '/content', '/marking-criteria', '/admin',
  ]
  const looksLikeStaffPath = STAFF_PATHS.some(p =>
    location.pathname === p || location.pathname.startsWith(p + '/')
  )

  if (isStaff && looksLikeStaffPath) {
    const staffUrl = window.location.origin + '/staff' + location.pathname + location.search
    window.location.replace(staffUrl)
    return null
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <p className="text-6xl font-black text-gray-200 mb-4">404</p>
      <h1 className="text-xl font-bold text-gray-800 mb-2">Page not found</h1>
      <p className="text-sm text-gray-500 mb-8 max-w-sm">
        The page you're looking for doesn't exist on this portal.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link to="/" className="btn-dark px-5 py-2.5 text-sm">
          Back to Home
        </Link>
        {isStaff && (
          <a
            href="/staff/dashboard"
            className="px-5 py-2.5 text-sm rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
          >
            Go to Staff Portal
          </a>
        )}
      </div>
    </div>
  )
}
