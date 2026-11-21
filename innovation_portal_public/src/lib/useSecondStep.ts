import { useEffect, useState } from 'react'
import { authService } from '../services/auth.service'

// U7: the owner's choice of second step after phone or email ("code" or "password"),
// from the public config. Fetched once per page load and shared.
let cached: Promise<'code' | 'password'> | null = null

function load(): Promise<'code' | 'password'> {
  if (!cached) {
    cached = authService
      .getPublicConfig()
      .then((config) => config.sign_in.second_step ?? 'code')
      .catch(() => {
        cached = null
        return 'code' as const
      })
  }
  return cached
}

/** null while loading. */
export function useSecondStep(): 'code' | 'password' | null {
  const [step, setStep] = useState<'code' | 'password' | null>(null)
  useEffect(() => {
    let alive = true
    load().then((value) => alive && setStep(value))
    return () => {
      alive = false
    }
  }, [])
  return step
}
