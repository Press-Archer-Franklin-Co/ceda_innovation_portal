import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../../../lib/cn'

const STATUS = {
  draft:    { label: 'Draft',       cls: 'bg-status-draft-bg text-status-draft-text' },
  tested:   { label: 'Tested',      cls: 'bg-status-review-bg text-status-review-text' },
  failed:   { label: 'Test failed', cls: 'bg-status-rejected-bg text-status-rejected-text' },
  active:   { label: 'Active',      cls: 'bg-status-active-bg text-status-active-text' },
  disabled: { label: 'Switched off', cls: 'bg-status-draft-bg text-status-draft-text' },
}

export function ConnectionStatusBadge({ status }) {
  const item = STATUS[status] ?? STATUS.draft
  return <span className={cn('badge', item.cls)}>{item.label}</span>
}

const SOURCE = {
  database:    { label: 'Saved in Platform settings', cls: 'bg-status-active-bg text-status-active-text' },
  environment: { label: 'Server environment variables', cls: 'bg-status-pending-bg text-status-pending-text' },
  none:        { label: 'Not set up', cls: 'bg-status-draft-bg text-status-draft-text' },
}

export function SourceBadge({ source }) {
  const item = SOURCE[source] ?? SOURCE.none
  return <span className={cn('badge', item.cls)}>{item.label}</span>
}

export function formatWhen(value) {
  if (!value) return 'Never'
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return String(value)
  }
}

export function CopyField({ label, value, hint }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input className="input font-mono text-xs" value={value} readOnly onFocus={(e) => e.target.select()} />
        <button type="button" className="btn-secondary btn-sm flex-shrink-0" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {hint && <p className="text-xs text-ceda-muted mt-1">{hint}</p>}
    </div>
  )
}

export function ErrorBanner({ error }) {
  if (!error) return null
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {error.message ?? String(error)}
    </div>
  )
}

export function WarningList({ warnings }) {
  if (!warnings?.length) return null
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
      {warnings.map((w) => <p key={w}>{w}</p>)}
    </div>
  )
}
