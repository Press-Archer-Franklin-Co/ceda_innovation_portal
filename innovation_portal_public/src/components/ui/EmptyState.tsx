import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  body?: string
  action?: {
    label: string
    onClick: () => void
  }
  children?: ReactNode
}

export default function EmptyState({ icon: Icon, title, body, action, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Icon size={20} className="text-gray-400" />
        </div>
      )}
      <p className="text-gray-700 font-semibold text-sm mb-1">{title}</p>
      {body && <p className="text-gray-400 text-sm max-w-xs leading-relaxed">{body}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 text-sm font-semibold text-[#F0641E] hover:underline"
        >
          {action.label}
        </button>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
