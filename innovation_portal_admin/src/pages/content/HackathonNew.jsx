import { useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import Skeleton from '../../components/ui/Skeleton'
import ErrorState from '../../components/ui/ErrorState'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'

// Old link from a challenge: /content/hackathons/new?program=<id>. Opens that challenge's hackathon page (3.36),
// making an empty one first when it has none.
export default function HackathonNew() {
  const t = useT()
  const [params] = useSearchParams()
  const program = params.get('program')
  const [target, setTarget] = useState(null)
  const [error, setError] = useState(null)
  const started = useRef(false)

  useEffect(() => {
    if (!program || started.current) return
    started.current = true
    ;(async () => {
      try {
        const list = await client.get('/api/content/hackathons/', { program })
        const rows = Array.isArray(list) ? list : list?.results ?? []
        const found = rows.find((x) => String(x.program) === String(program))
        const page = found ?? (await client.post('/api/content/hackathons/', { program }))
        setTarget(`/content/hackathons/${page.id}`)
      } catch (err) {
        setError(err)
      }
    })()
  }, [program])

  if (!program) return <Navigate to="/content/hackathon" replace />
  if (target) return <Navigate to={target} replace />
  if (error) return <ErrorState framed title={t('hk.loadError')} message={error.message} />
  return <Skeleton className="h-[480px] rounded-card" />
}
