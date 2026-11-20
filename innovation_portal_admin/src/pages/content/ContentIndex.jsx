import { Navigate, useSearchParams } from 'react-router-dom'
import ContentList from './ContentList'

// Old links (/content?tab=...) open the U6 screens that replaced each tab. Hackathon pages have no
// new screen yet, so that tab still opens the old list.
const MOVED = { news: '/content/news', winners: '/content/stories', leadership: '/content/quotes', faqs: '/content/faqs' }

export default function ContentIndex() {
  const [params] = useSearchParams()
  const tab = params.get('tab')
  if (tab === 'hackathons') return <ContentList />
  return <Navigate to={MOVED[tab] ?? '/content/home'} replace />
}
