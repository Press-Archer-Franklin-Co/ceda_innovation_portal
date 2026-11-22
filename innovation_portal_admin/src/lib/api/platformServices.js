import { useQuery } from '@tanstack/react-query'
import { client } from './client'

// U9 API (3.26, 3.27): one card per outside service with its state and the features that need it, and the
// "Turn off?" preview of what would hide.
export const platformServices = {
  list: () => client.get('/api/platform/services/'),
  hidesIfOff: (id) => client.get(`/api/platform/integrations/${id}/deactivate/`),
}

/** Under ['platform'], so saving or switching a connection refreshes the cards. */
export function usePlatformServices(options = {}) {
  return useQuery({ queryKey: ['platform', 'services'], queryFn: () => platformServices.list(), ...options })
}

/** A one-time code needs one of these services active (3.26 ②). */
export const CODE_SERVICES = ['sms', 'whatsapp', 'email']
