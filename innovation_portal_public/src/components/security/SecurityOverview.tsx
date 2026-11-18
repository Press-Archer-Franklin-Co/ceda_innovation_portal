import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react'
import type { AccountSecurity } from '../../types/security'
import { SECURITY_LEVEL, buildHealthSummary, getSortedActions } from '../../utils/securityLabels'

interface Props {
  data: AccountSecurity
  onActionClick?: (code: string) => void
}

const SHIELD_ICON = {
  high:   ShieldCheck,
  medium: Shield,
  low:    ShieldAlert,
}

export default function SecurityOverview({ data, onActionClick }: Props) {
  const level   = SECURITY_LEVEL[data.security_level] ?? SECURITY_LEVEL.medium
  const Icon    = SHIELD_ICON[data.security_level as keyof typeof SHIELD_ICON] ?? Shield
  const summary = buildHealthSummary(data)

  const actions   = getSortedActions(data)
  const topAction = actions[0] ?? null

  const isClean = data.policy_compliant && actions.length === 0

  return (
    <div className="rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-white overflow-hidden">
      <div className="px-6 py-6 flex items-start gap-4">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${level.bg}`}
          style={{ border: `1.5px solid ${level.dotColor}25` }}
        >
          <Icon size={22} style={{ color: level.dotColor }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[13px] font-bold text-gray-900">Account health</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${level.color}`}
              style={{ background: `${level.dotColor}14`, border: `1px solid ${level.dotColor}30` }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: level.dotColor }} />
              {level.label}
            </span>
          </div>

          <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>

          {topAction && onActionClick && (
            <button
              onClick={() => onActionClick(topAction.code)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: isClean ? undefined : `${level.dotColor}12`,
                color:      level.dotColor,
                border:     `1px solid ${level.dotColor}30`,
              }}
            >
              {topAction.meta.cta} →
            </button>
          )}

          {isClean && (
            <p className="mt-2 text-xs text-green-700 flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-green-600 shrink-0" />
              No action needed.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
