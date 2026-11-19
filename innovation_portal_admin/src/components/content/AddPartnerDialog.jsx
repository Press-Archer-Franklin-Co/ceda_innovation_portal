import { useEffect, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import { useToast } from '../ui/toast'
import { partners, uploadImage } from '../../lib/api/partners'
import { useT } from '../../i18n/context'

const EMPTY = { name: '', url: '', file: null }

/**
 * Figma Foundations › Modal ("Add partner"). Opens with the genie from the button (triggerRef),
 * saves the logo through the media library, creates the partner, then shows a success toast with Undo.
 * It is a create, so there is nothing to prefetch.
 * `api` can be swapped (the styleguide passes a fake one).
 */
export default function AddPartnerDialog({ open, onClose, triggerRef, api = { partners, uploadImage } }) {
  const t = useT()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})

  useEffect(() => { if (open) { setForm(EMPTY); setErrors({}) } }, [open])

  const undo = useMutation({
    mutationFn: (id) => api.partners.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partners'] }),
  })

  const save = useMutation({
    mutationFn: async () => {
      const logo = form.file ? await api.uploadImage(form.file, form.name) : null
      return api.partners.create({ name: form.name.trim(), url: form.url.trim(), logo_id: logo?.id ?? null })
    },
    onSuccess: (partner) => {
      queryClient.invalidateQueries({ queryKey: ['partners'] })
      onClose()
      toast.show({
        title: t('partner.saved'),
        body: t('partner.savedBody', { name: partner?.name ?? form.name }),
        tone: 'success',
        action: partner?.id ? { label: t('partner.undo'), onClick: () => undo.mutate(partner.id) } : undefined,
      })
    },
    onError: (err) => setErrors({ form: err?.message || t('partner.saveError') }),
  })

  const submit = (e) => {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = t('partner.nameError')
    if (form.url && !/^https?:\/\/\S+\.\S+/.test(form.url.trim())) next.url = t('partner.urlError')
    if (form.file && form.file.size > 2 * 1024 * 1024) next.file = t('partner.fileError')
    setErrors(next)
    if (Object.keys(next).length === 0) save.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      title={t('partner.add')}
      description={t('partner.addBody')}
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>{t('common.cancel')}</Button>
          <Button type="submit" form="add-partner-form" loading={save.isPending}>{t('partner.save')}</Button>
        </>
      }
    >
      <form id="add-partner-form" onSubmit={submit} noValidate className="space-y-3.5">
        <Input
          label={t('partner.name')}
          hint={t('partner.nameHint')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
          required
          data-autofocus
        />
        <Input
          label={t('partner.website')}
          placeholder="https://"
          optional
          type="url"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          error={errors.url}
        />
        <label className="flex items-center gap-3 rounded-card border border-dashed border-border bg-surface2 p-3 cursor-pointer focus-within:ring-2 focus-within:ring-primary">
          <span aria-hidden className="w-10 h-10 rounded-control bg-border/60 flex items-center justify-center text-muted shrink-0">
            <ImagePlus size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-bold text-text">{form.file ? form.file.name : t('partner.logo')}</span>
            <span className="block text-d-cap text-muted">{t('partner.logoHint')}</span>
            {errors.file && <span role="alert" className="block text-d-cap text-danger">{errors.file}</span>}
          </span>
          <input type="file" accept="image/png,image/svg+xml" className="sr-only" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
        </label>
        {errors.form && <p role="alert" className="rounded-control bg-danger-soft text-danger text-d-label-s px-3 py-2.5">{errors.form}</p>}
      </form>
    </Modal>
  )
}
