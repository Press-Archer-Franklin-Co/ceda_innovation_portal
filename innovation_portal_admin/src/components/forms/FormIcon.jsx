import { FileText } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * The small document tile on a form (3.4): soft CEDA orange with the orange icon. stroke-accent is the brand
 * orange; text-accent is a darker orange kept for readable text, and this icon is decoration.
 * phoneRow: below 640px, the larger neutral tile of the 3.4 phone frame.
 */
export default function FormIcon({ className, phoneRow = false }) {
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-control', phoneRow ? 'h-10 w-10 bg-surface2 sm:h-9 sm:w-9 sm:bg-accent-soft' : 'h-9 w-9 bg-accent-soft', className)}>
      <FileText size={18} strokeWidth={1.5} className={phoneRow ? 'stroke-muted sm:stroke-accent' : 'stroke-accent'} />
    </span>
  )
}
