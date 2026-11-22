import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Button, { buttonClasses } from '../ui/Button'
import { StatusScreen } from './StatusScreen'
import { useI18n } from '../../i18n'
import api from '../../services/api'

// Figma 1.14 › error (something broke on our side): the 404 layout with Try again and a reference staff can
// look up. The reference ("ERR-7F3A2C") is made in the browser and sent to the audit log
// (POST /api/audit/client-errors/), where staff find it by searching for it. Sending is best effort: the page
// shows the same reference whether or not the report gets through.

export function newErrorReference(): string {
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  return `ERR-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export function reportClientError(reference: string, error: unknown) {
  const message = String((error as Error)?.message ?? error ?? '').slice(0, 500)
  api.post('/audit/client-errors/', { reference, path: window.location.pathname.slice(0, 300), message }).catch(() => undefined)
}

export default function ErrorPage({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  const { t } = useI18n()
  const reference = useMemo(newErrorReference, [])
  useEffect(() => reportClientError(reference, error), [reference, error])
  return (
    <StatusScreen title={t('error.title')} body={t('error.body', { code: reference })}>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button onClick={onRetry}>{t('common.retry')}</Button>
        <Link to="/" className={buttonClasses({ variant: 'secondary' })}>{t('notFound.home')}</Link>
      </div>
    </StatusScreen>
  )
}
