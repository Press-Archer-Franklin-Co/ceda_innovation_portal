import { useAuth } from './AuthContext'

/**
 * The judge's simpler console: someone who scores entries but neither assigns them nor sees every entry.
 * Built from capabilities only (S1). TODO(R-25): entries.score and entries.search come with R-25.
 */
export function useJudgeOnly() {
  const { can } = useAuth()
  return can('entries.score') && !can('entries.assign') && !can('entries.search')
}
