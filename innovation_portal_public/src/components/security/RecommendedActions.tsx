import { ArrowRight, AlertTriangle, ChevronRight } from 'lucide-react'
import type { AccountSecurity } from '../../types/security'
import { getSortedActions } from '../../utils/securityLabels'

interface Props {
  data: AccountSecurity
  onActionClick?: (code: string) => void
}

export default function RecommendedActions({ data, onActionClick }: Props) {
  const actions = getSortedActions(data)
  if (actions.length === 0) return null

  const [primary, ...rest] = actions

  return (
    <div className="space-y-2.5">
      <div className={`rounded-2xl border shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden ${
        primary.isBlocking
          ? 'border-red-200 bg-red-50'
          : 'border-amber-200 bg-amber-50'
      }`}>
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
            {primary.isBlocking && (
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-bold mb-1 ${primary.isBlocking ? 'text-red-900' : 'text-amber-900'}`}>
                {primary.meta.label}
              </p>
              <p className={`text-sm leading-relaxed ${primary.isBlocking ? 'text-red-700' : 'text-amber-700'}`}>
                {primary.meta.description}
              </p>
              {!data.can_continue_without_action && primary.isBlocking && (
                <p className="text-xs font-semibold text-red-600 mt-2">
                  This is required before you can continue.
                </p>
              )}
            </div>
            {onActionClick && (
              <button
                onClick={() => onActionClick(primary.code)}
                className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors ${
                  primary.isBlocking
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-[#A01E0A] text-white hover:bg-[#7E1708]'
                }`}
              >
                {primary.meta.cta}
                <ArrowRight size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {rest.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden divide-y divide-gray-50">
          {rest.map(({ code, meta, isBlocking }) => (
            <div key={code} className="px-6 py-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800">{meta.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{meta.description}</p>
              </div>
              {onActionClick && (
                <button
                  onClick={() => onActionClick(code)}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#A01E0A] transition-colors"
                >
                  {meta.cta} <ChevronRight size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
