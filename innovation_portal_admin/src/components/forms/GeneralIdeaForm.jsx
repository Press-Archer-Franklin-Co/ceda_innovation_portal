import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import Skeleton from '../ui/Skeleton'
import { useToast } from '../ui/toast'
import { useT } from '../../i18n/context'
import { forms as formsApi } from '../../lib/api/formBuilder'

// Prompt 31: the one setting for which form takes ordinary ideas (home quick start, /submit, WhatsApp, USSD,
// the Need help guide). Challenges and hackathons keep their own forms.

export default function GeneralIdeaForm({ liveForms }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const trigger = useRef(null)
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const current = useQuery({ queryKey: ['forms', 'general-ideas'], queryFn: () => formsApi.generalIdeas() })
  const form = current.data?.form
  const options = (liveForms ?? []).filter((f) => !f.is_template && f.latest_version).map((f) => ({ value: f.id, label: f.name }))

  async function save() {
    setBusy(true)
    try {
      await formsApi.setGeneralIdeas(chosen)
      qc.invalidateQueries({ queryKey: ['forms'] })
      toast.show({ tone: 'success', title: t('forms.general.changed') })
      setOpen(false)
    } catch (err) {
      toast.show({ tone: 'error', title: err?.message || t('common.somethingWrong') })
    } finally {
      setBusy(false)
    }
  }

  if (current.isLoading) return <Skeleton className="h-[52px] rounded-card" />
  if (current.isError) return null
  return (
    <section aria-labelledby="general-idea-form" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-border bg-surface px-4 py-3">
      <h2 id="general-idea-form" className="text-[13px] font-bold text-text">{t('forms.general.title')}</h2>
      {form ? <Link to={`/forms/${form.id}`} className="text-[13px] text-primary hover:underline">{form.name}</Link> : <span className="text-[13px] text-muted">{t('forms.general.none')}</span>}
      <span className="text-[12px] text-muted">{t('forms.general.hint')}</span>
      <Button ref={trigger} variant="secondary" size="sm" className="sm:ml-auto" onClick={() => { setChosen(form?.id ?? ''); setOpen(true) }}>{t('forms.general.change')}</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={trigger}
        size="sm"
        title={t('forms.general.changeTitle')}
        description={t('forms.general.changeBody')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button onClick={save} loading={busy} disabled={!chosen || chosen === form?.id}>{t('common.save')}</Button></>}
      >
        <Select label={t('forms.general.choose')} options={options} value={chosen} onChange={setChosen} />
      </Modal>
    </section>
  )
}
