import { Navigate, useSearchParams } from 'react-router-dom'

// U11C (2.9): Profile and security are one page. Old links to /security land on its Security part.
export default function Security() {
  const [params] = useSearchParams()
  const linked = params.get('linked')
  return <Navigate to={`/profile?section=security${linked ? `&linked=${encodeURIComponent(linked)}` : ''}#security`} replace />
}
