import { Info } from 'lucide-react'
import StateCard from './StateCard'

/** Not allowed: say whose area it is and who to ask ("Ask an administrator if you need Users and roles."). */
export default function ForbiddenState({ title, message, compact = false, framed = false, className }) {
  return <StateCard icon={Info} tone="info" title={title} body={message} compact={compact} framed={framed} className={className} />
}
