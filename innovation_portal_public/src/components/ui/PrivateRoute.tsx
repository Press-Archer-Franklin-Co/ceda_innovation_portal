import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function PrivateRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return null

  if (!isAuthenticated) {
    // The code sign-in is the main way in (2.0); it returns the person to state.from.
    return <Navigate to="/sign-in" state={{ from: location }} replace />
  }

  return <Outlet />
}
