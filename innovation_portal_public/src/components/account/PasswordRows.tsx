import { FormEvent, useState } from 'react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import { useI18n } from '../../i18n'
import { securityService } from '../../services/security.service'

// U7 + U11C (2.9): password rows show only when the owner has set the second sign-in step to "password".

export default function PasswordRows({ hasPassword, onSaved }: { hasPassword: boolean; onSaved: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (next.length < 8) {
      setError(t('account.passwordRule'))
      return
    }
    setSaving(true)
    setError('')
    try {
      if (hasPassword) await securityService.changePassword(current, next)
      else await securityService.setPassword(next)
      setOpen(false)
      setCurrent('')
      setNext('')
      setDone(true)
      onSaved()
    } catch {
      setError(t('account.passwordError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-[14px]">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-d-label text-text">{t('account.password')}</p>
          <p className="text-d-cap text-muted">{done ? t('account.passwordSaved') : hasPassword ? t('account.passwordSet') : t('account.passwordNone')}</p>
        </div>
        {!open && (
          <Button size="sm" variant="secondary" onClick={() => { setOpen(true); setDone(false) }}>
            {hasPassword ? t('account.changePassword') : t('account.setPassword')}
          </Button>
        )}
      </div>
      {open && (
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {hasPassword && (
            <Input label={t('account.currentPassword')} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          )}
          <Input label={t('account.newPassword')} type="password" autoComplete="new-password" hint={t('account.passwordRule')} value={next} onChange={(e) => setNext(e.target.value)} error={error || undefined} required />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setError('') }}>{t('common.cancel')}</Button>
            <Button type="submit" size="sm" loading={saving}>{t('common.save')}</Button>
          </div>
        </form>
      )}
    </div>
  )
}
