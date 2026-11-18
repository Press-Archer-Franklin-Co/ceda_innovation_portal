import React from 'react'
import { cn } from '../../lib/cn'

const STATUS_CONFIG = {
  available:  { label: 'Available',  className: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending:    { label: 'Pending',    className: 'bg-amber-50 text-amber-700 border-amber-200' },
  claimed:    { label: 'Claimed',    className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  accepted:   { label: 'In Progress', className: 'bg-ceda-green-pale text-ceda-forest border-ceda-green/30' },
  completed:  { label: 'Completed', className: 'bg-green-50 text-green-700 border-green-200' },
  declined:   { label: 'Declined',  className: 'bg-ceda-red-pale text-ceda-red border-ceda-red/20' },
  cancelled:  { label: 'Cancelled', className: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export default function AssignmentStatusBadge({ status, className }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status ?? 'Unknown', className: 'bg-slate-100 text-slate-500 border-slate-200' }
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border',
      cfg.className, className
    )}>
      {cfg.label}
    </span>
  )
}

export const TERMINAL_STATUSES = new Set(['completed', 'declined', 'cancelled'])

export function statusGroup(status) {
  if (['available', 'pending'].includes(status)) return 'pending'
  if (['claimed', 'accepted'].includes(status))  return 'inprogress'
  return 'done'
}
