import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Button from '../../ui/Button'
import Input from '../../ui/Input'
import { useToast } from '../../ui/toast'
import { useT } from '../../../i18n/context'
import { siteSettings } from '../../../lib/api/websiteContent'
import { contentKeys, useSiteSettings } from '../../../lib/queries/websiteContent'

/**
 * The two public numbers that are set by hand (moved here from the old staff Settings page, U11 A). The other
 * numbers are counted by the portal. These are site settings: they save at once and do not wait for approval.
 */
export default function PublicNumbersCard() {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const settings = useSiteSettings()
  const [form, setForm] = useState({ prize_money_label: '', solutions_deployed: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!settings.data) return
    setForm({ prize_money_label: settings.data.prize_money_label ?? '', solutions_deployed: String(settings.data.solutions_deployed ?? 0) })
  }, [settings.data])

  const changed = settings.data && (form.prize_money_label !== (settings.data.prize_money_label ?? '') || form.solutions_deployed !== String(settings.data.solutions_deployed ?? 0))

  async function save() {
    setBusy(true)
    try {
      await siteSettings.update({ prize_money_label: form.prize_money_label.trim(), solutions_deployed: Number(form.solutions_deployed || 0) })
      qc.invalidateQueries({ queryKey: contentKeys.siteSettings() })
      toast.show({ tone: 'success', title: t('home.numbersSaved') })
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="home-numbers" className="mt-4 flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div>
        <h2 id="home-numbers" className="font-heading text-[15px] font-bold text-text">{t('home.numbersTitle')}</h2>
        <p className="mt-1 text-[12px] text-muted">{t('home.numbersHint')}</p>
      </div>
      <Input label={t('home.prizeLabel')} hint={t('home.prizeLabelHint')} optional value={form.prize_money_label} onChange={(e) => setForm((f) => ({ ...f, prize_money_label: e.target.value }))} maxLength={60} disabled={settings.isLoading} />
      <Input label={t('home.solutions')} hint={t('home.solutionsHint')} type="number" min="0" value={form.solutions_deployed} onChange={(e) => setForm((f) => ({ ...f, solutions_deployed: e.target.value }))} disabled={settings.isLoading} />
      <Button variant="secondary" size="sm" onClick={save} loading={busy} disabled={!changed} className="self-start">{t('common.save')}</Button>
    </section>
  )
}
