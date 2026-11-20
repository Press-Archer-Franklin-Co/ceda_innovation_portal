import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import Button from '../ui/Button'
import { InputControl } from '../ui/Input'
import Field from '../ui/Field'
import { SelectControl } from '../ui/Select'
import Skeleton from '../ui/Skeleton'
import { useI18n } from '../../i18n'
import { useAsync } from '../../lib/useAsync'
import { referenceService } from '../../services/reference.service'
import { intakeService, resumeStorage } from '../../services/intake.service'
import { publicContent, ChallengeCard } from '../../services/publicContent.service'
import { useSearchParams } from 'react-router-dom'

// Figma 1.1 › Hero › Quick start card (10:280), step 1 of 2. Typing a title (with a sector chosen) creates a
// saved guest draft, debounced 800 ms; later changes save to the same draft. The resume token stays in
// localStorage so a refresh keeps the draft. Continue opens step 2 (1.2).

export interface QuickStartDraft {
  draftId: string
  token: string
  title: string
  sectorId: string
  sectorName: string
  programId: string | null
  programTitle: string | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// TODO(R-21): the API needs a real sector; "Not sure" shows only when the list has such an entry.
const NOT_SURE_SLUGS = ['not-sure', 'not_sure', 'other']

export default function QuickStartCard({ challenges, onContinue }: { challenges: ChallengeCard[]; onContinue: (draft: QuickStartDraft) => void }) {
  const { t, lang } = useI18n()
  const sectors = useAsync(() => referenceService.sectors(lang), [lang])
  const [title, setTitle] = useState('')
  const [sectorId, setSectorId] = useState<string | null>(null)
  // 1.8 "Enter this challenge" lands here with ?challenge=<id>: preselect it.
  const [params] = useSearchParams()
  const wanted = params.get('challenge') ?? ''
  const [programId, setProgramId] = useState<string>(wanted)
  const needList = Boolean(wanted) && !challenges.some((c) => c.id === wanted)
  const openList = useAsync(() => (needList ? publicContent.challenges({ status: 'open' }).then((r) => r.results) : Promise.resolve([] as ChallengeCard[])), [needList, lang])
  const allChallenges = useMemo(() => {
    const extra = (openList.data ?? []).filter((c) => !challenges.some((h) => h.id === c.id))
    return [...challenges, ...extra]
  }, [challenges, openList.data])
  const [draft, setDraft] = useState<{ draftId: string; token: string } | null>(() => resumeStorage.get())
  const [save, setSave] = useState<SaveState>('idle')
  const [errors, setErrors] = useState<{ title?: string; sector?: string }>({})
  const lastSaved = useRef<string>('')
  const [retry, setRetry] = useState(0)

  const sectorList = useMemo(() => {
    const all = sectors.data ?? []
    const notSure = all.filter((s) => NOT_SURE_SLUGS.includes(s.slug))
    return [...all.filter((s) => !NOT_SURE_SLUGS.includes(s.slug)), ...notSure]
  }, [sectors.data])

  // Restore a draft kept from an earlier visit.
  useEffect(() => {
    const kept = resumeStorage.get()
    if (!kept) return
    intakeService
      .getDraft(kept.draftId, kept.token)
      .then((d) => {
        setTitle((v) => v || d.title || '')
        setSectorId((v) => v ?? d.sector)
        if (d.program_detail && !d.program_detail.is_general_intake) setProgramId(d.program)
        lastSaved.current = JSON.stringify([d.title, d.sector, d.program_detail?.is_general_intake ? '' : d.program])
        setSave('saved')
      })
      .catch(() => {
        resumeStorage.clear()
        setDraft(null)
      })
  }, [])

  // Autosave, 800 ms after the last change, once there is a title and a sector.
  useEffect(() => {
    const clean = title.trim()
    if (clean.length < 2 || !sectorId) return
    const key = JSON.stringify([clean, sectorId, programId])
    if (key === lastSaved.current) return
    const timer = window.setTimeout(async () => {
      setSave('saving')
      try {
        if (!draft) {
          const res = await intakeService.quickStart({ title: clean, sector: sectorId, ...(programId ? { program_id: programId } : {}) })
          resumeStorage.set(res.draft_id, res.resume_token)
          setDraft({ draftId: res.draft_id, token: res.resume_token })
        } else {
          await intakeService.updateDraft(draft.draftId, { title: clean, sector: sectorId, ...(programId ? { program: programId } : {}) }, draft.token)
        }
        lastSaved.current = key
        setSave('saved')
      } catch {
        setSave('error')
      }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [title, sectorId, programId, draft, retry])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (title.trim().length < 2) next.title = t('qs.titleError')
    if (!sectorId) next.sector = t('qs.sectorError')
    setErrors(next)
    if (Object.keys(next).length) return
    if (save === 'error') {
      lastSaved.current = ''
      setRetry((n) => n + 1)
      return
    }
    if (!draft || save === 'saving') return
    const program = allChallenges.find((c) => c.id === programId)
    onContinue({
      draftId: draft.draftId,
      token: draft.token,
      title: title.trim(),
      sectorId: sectorId as string,
      sectorName: sectorList.find((s) => s.id === sectorId)?.name ?? '',
      programId: programId || null,
      programTitle: program?.title ?? null,
    })
  }

  const ready = Boolean(draft) && save === 'saved'
  const options = [{ value: '', label: t('qs.general') }, ...allChallenges.filter((c) => c.status === 'open').map((c) => ({ value: c.id, label: c.title }))]

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="qs-title"
      className="relative flex flex-col gap-4 bg-surface text-text rounded-[16px] p-5 sm:p-7 shadow-[0_10px_15px_rgba(46,26,15,0.25)] w-full lg:w-[470px] shrink-0"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="qs-title" className="text-d-h4 font-heading">{t('qs.title')}</h2>
        <p className="text-d-label-s text-muted whitespace-nowrap pt-1">{t('qs.step', { n: 1 })}</p>
      </div>
      <div aria-hidden className="h-1 rounded-full bg-surface2">
        <div className="h-1 w-1/2 rounded-full bg-primary" />
      </div>
      <p className="text-d-body-s text-muted">{t('qs.intro')}</p>

      <Field label={t('qs.ideaLabel')} hint={t('qs.ideaHint')} error={errors.title} required>
        <InputControl value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('qs.ideaPlaceholder')} maxLength={255} autoComplete="off" />
      </Field>

      <fieldset aria-describedby={errors.sector ? 'qs-sector-err' : undefined}>
        <legend className="text-d-label text-text mb-2">{t('qs.sector')}</legend>
        {sectors.loading ? (
          <div className="flex flex-wrap gap-2" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
          </div>
        ) : sectors.error ? (
          <p className="text-d-cap text-danger">{t('qs.sectorsError')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sectorList.map((s) => {
              const on = s.id === sectorId
              return (
                <label
                  key={s.id}
                  className={clsx(
                    'inline-flex items-center min-h-[32px] px-3 rounded-full text-d-label-s cursor-pointer border transition-colors',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2',
                    on ? 'bg-primary border-primary text-on-primary' : 'bg-surface border-border text-text hover:border-muted/60',
                  )}
                >
                  <input type="radio" name="qs-sector" value={s.id} checked={on} onChange={() => setSectorId(s.id)} className="sr-only" />
                  {NOT_SURE_SLUGS.includes(s.slug) ? t('qs.notSure') : s.name}
                </label>
              )
            })}
          </div>
        )}
        {errors.sector && <p id="qs-sector-err" role="alert" className="text-d-cap text-danger mt-1.5">{errors.sector}</p>}
      </fieldset>

      <Field label={t('qs.challenge')}>
        <SelectControl options={options} value={programId} onChange={setProgramId} />
      </Field>

      <Button type="submit" block disabled={!ready && save !== 'error'}>
        {t('qs.continue')}
      </Button>

      <p className="flex items-start gap-1.5 text-d-cap text-muted" aria-live="polite">
        {save === 'saving' ? (
          <span>{t('qs.saving')}</span>
        ) : save === 'saved' ? (
          <span className="inline-flex items-center gap-1 text-success font-bold"><Check size={14} strokeWidth={3} aria-hidden />{t('qs.saved')}</span>
        ) : save === 'error' ? (
          <span role="alert" className="text-danger">{t('qs.saveError')}</span>
        ) : title.trim().length >= 2 && !sectorId ? (
          <span>{t('qs.needSector')}</span>
        ) : null}
      </p>
      <p className="flex items-start gap-1.5 text-d-cap text-muted -mt-2">
        <ShieldCheck size={14} aria-hidden className="mt-0.5 shrink-0" />
        {t('qs.privacy')}
      </p>
    </form>
  )
}
