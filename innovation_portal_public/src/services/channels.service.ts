import api from './api'
import { unwrapData } from './envelope'

// GET /api/channels/public/: which channels are live and their addresses, from the console's Channels settings.

export interface PublicChannel { live: boolean; addresses: string[] }
export interface PublicChannels { whatsapp?: PublicChannel; ussd?: PublicChannel }

export interface OtherWays {
  whatsapp: { number: string; href: string } | null
  ussd: { code: string; href: string } | null
}

/** A channel's first address, only when it is live. */
const liveAddress = (channel?: PublicChannel) => (channel?.live ? channel.addresses?.find((a) => a?.trim())?.trim() ?? '' : '')

/** What the block may show. An address that cannot make a working link is left out, never shown broken. */
export function otherWays(data: PublicChannels | null | undefined): OtherWays {
  const number = liveAddress(data?.whatsapp).replace(/^whatsapp:/i, '').trim()
  const digits = number.replace(/\D/g, '')
  const code = liveAddress(data?.ussd)
  return {
    whatsapp: /^\+?[\d\s()-]+$/.test(number) && digits.length >= 10 && digits.length <= 15 ? { number, href: `https://wa.me/${digits}` } : null,
    ussd: /^\*[\d*]+#$/.test(code) ? { code, href: `tel:${code.replace(/#/g, '%23')}` } : null,
  }
}

export const channelsService = {
  /** Never fails: when it cannot be read, the block simply does not show. */
  async publicChannels(): Promise<PublicChannels | null> {
    try {
      const { data } = await api.get('/channels/public/', { timeout: 3000 })
      return unwrapData<PublicChannels>(data)
    } catch {
      return null
    }
  },
}
