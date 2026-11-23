import { FileText } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * The small document tile on a form (3.4): soft CEDA orange with the orange icon. stroke-accent is the brand
 * orange; text-accent is a darker orange kept for readable text, and this icon is decoration.
 */
export default function FormIcon({ className }) {
  return (
    <span aria-hidden className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft', className)}>
      <FileText size={18} strokeWidth={1.5} className="stroke-accent" />
    </span>
  )
}
