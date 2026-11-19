import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Card from '../../components/ui/Card'
import { Checkbox } from '../../components/ui/Choice'
import { ErrorState } from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import NotificationsPanel from '../../components/innovator/NotificationsPanel'
import { useI18n, type StringKey } from '../../i18n'
import { notificationsService } from '../../services/notifications.service'
import type { NotificationChannel, NotificationPreferences } from '../../types/innovator'

const CHANNELS: NotificationChannel[] = ['web', 'whatsapp', 'sms', 'email']

/** Screen 2.5 as a page: every notification, and where each kind of message goes. */
export default function Notifications() {
  const { t } = useI18n()
  const { hash } = useLocation()

  useEffect(() => {
    document.title = `${t('notif.title')} · CEDA Innovation`
  }, [t])

  useEffect(() => {
    if (hash === '#settings') window.setTimeout(() => document.getElementById('settings')?.scrollIntoView(), 0)
  }, [hash])

  return (
    <div className="bg-bg">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <section className="min-w-0">
          <NotificationsPanel />
        </section>
        <Settings />
      </div>
    </div>
  )
}

function Settings() {
  const { t } = useI18n()
  const toast = useToast()
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setPrefs(await notificationsService.preferences())
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(type: string, channel: NotificationChannel, on: boolean) {
    if (!prefs) return
    const before = prefs
    setPrefs({ ...prefs, preferences: { ...prefs.preferences, [type]: { ...prefs.preferences[type], [channel]: on } } })
    setSaving(`${type}.${channel}`)
    try {
      const saved = await notificationsService.savePreferences({ [type]: { [channel]: on } })
      setPrefs(saved)
      toast.show({ tone: 'success', title: t('notif.settingsSaved'), duration: 2500 })
    } catch {
      setPrefs(before)
      toast.show({ tone: 'error', title: t('notif.settingsError') })
    } finally {
      setSaving(null)
    }
  }

  const channelLabel = (code: NotificationChannel) => t(`channel.${code}` as StringKey)
  const typeLabel = (code: string, fallback: string) => {
    const key = `notif.type.${code}` as StringKey
    const text = t(key)
    return text === key ? fallback : text
  }

  return (
    <Card id="settings" padding="lg" className="self-start scroll-mt-24">
      <h2 className="font-heading text-d-h4 text-text">{t('notif.settingsTitle')}</h2>
      <p className="mt-1 text-d-body-s text-muted">{t('notif.settingsBody')}</p>
      {failed ? (
        <ErrorState title={t('common.somethingWrong')} onRetry={load} framed={false} className="mt-4" />
      ) : !prefs ? (
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 rounded-control" />)}
        </div>
      ) : (
        <div className="mt-4 flex flex-col divide-y divide-border">
          {prefs.notification_types.map((type) => {
            const channels = CHANNELS.filter((c) => prefs.channels.some((available) => available.code === c))
            return (
              <fieldset key={type.code} className="py-4">
                <legend className="text-d-label text-text">{typeLabel(type.code, type.label)}</legend>
                <div className="mt-2 grid grid-cols-2 gap-x-4">
                  {channels.map((channel) => (
                    <Checkbox
                      key={channel}
                      label={channelLabel(channel)}
                      checked={Boolean(prefs.preferences[type.code]?.[channel])}
                      disabled={saving === `${type.code}.${channel}`}
                      onChange={(e) => toggle(type.code, channel, e.target.checked)}
                    />
                  ))}
                </div>
              </fieldset>
            )
          })}
        </div>
      )}
    </Card>
  )
}
