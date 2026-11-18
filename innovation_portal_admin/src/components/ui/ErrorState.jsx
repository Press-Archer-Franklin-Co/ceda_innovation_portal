import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'

export default function ErrorState({ message, onRetry, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      <div className="w-12 h-12 rounded-full bg-ceda-red-pale flex items-center justify-center mb-4">
        <AlertTriangle size={22} className="text-ceda-red" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-ceda-dark mb-1">Something went wrong</p>
      {message && (
        <p className="text-xs text-ceda-muted max-w-sm mb-4">{message}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary btn-sm flex items-center gap-1.5"
        >
          <RefreshCw size={13} /> Try again
        </button>
      )}
    </div>
  )
}
