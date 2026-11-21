import api from './api'
import { unwrapData } from './envelope'

// U11C: policy page text (About, Guidelines, Terms of use, Terms of agreement, Privacy). Staff edit it in
// the Terms manager (3.35) and it goes live through the website approvals. Bodies are plain text: a blank
// line starts a paragraph and a line starting with "• " is a bullet.

export type PolicyKey = 'about' | 'guidelines' | 'terms_of_use' | 'terms_of_agreement' | 'privacy'

export interface PolicySection {
  heading: string
  body: string
}

export interface PolicyDocument {
  key: PolicyKey
  lang: 'en' | 'tn'
  title: string
  intro: string
  sections: PolicySection[]
  updated_at: string | null
  version: number
  /** True when some Setswana is missing and English shows in its place. */
  english_fallback: boolean
}

export const policiesService = {
  async get(key: PolicyKey, lang: string): Promise<PolicyDocument> {
    const { data } = await api.get(`/content/public/policies/${key}/`, { params: { lang } })
    return unwrapData<PolicyDocument>(data)
  },
}
