import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import Button from '../ui/Button'
import { InputControl } from '../ui/Input'
import Field from '../ui/Field'
import { SelectControl } from '../ui/Select'
import Skeleton from '../ui/Skeleton'
import StepProgress from '../ui/StepProgress'
import { useJourney } from './journeySteps'
import { useI18n } from '../../i18n'
import { useAsync } from '../../lib/useAsync'
import { useBasicsOnly } from '../../lib/usePublicConfig'
import { referenceService } from '../../services/reference.service'
import { intakeService, resumeStorage } from '../../services/intake.service'
import { publicContent, ChallengeCard } from '../../services/publicContent.service'
import { useSearchParams } from 'react-router-dom'

// Figma 1.1 › Hero › Quick start card (10:280). Prompt 31 part B: this card is step 1 of the real form, so its bar
// shows that form's own steps (the General ideas form, or the chosen challenge's form). Typing a title (with a sector chosen) creates a
// saved guest draft, debounced 800 ms; later changes save to the same draft. The resume token stays in
// localStorage so a refresh keeps the draft. Continue opens step 2 (1.2).

export interface QuickStartDraft {
  draftId: string
  token: string
  title: string
  /** null when the person chose "Not sure". */
  sectorId: string | null
  sectorName: string
  programId: string | null
  programTitle: string | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// "Not sure" is always the last chip. It is saved as no sector; officers set it later (R-21).
const NOT_SURE = 'not-sure'
const sectorForApi = (id: string) => (id === NOT_SURE ? null : id)

export default function QuickStartCard({ challenges, onContinue, busy = false }: { challenges: ChallengeCard[]; onContinue: (draft: QuickStartDraft) => void; busy?: boolean }) {
  const { t, lang } = useI18n()
  const basicsOnly = useBasicsOnly()
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
  // The chosen challenge's form once its draft is saved; until then, and for general ideas, the General ideas form.
  const [formId, setFormId] = useState<string | null>(null)
  const journey = useJourney(programId ? formId : null)
  const restored = useRef<QuickStartDraft | null>(null)
  const resumed = useRef(false)

  const sectorList = useMemo(
    () => [...(sectors.data ?? []).map((s) => ({ id: s.id, name: s.name })), { id: NOT_SURE, name: t('qs.notSure') }],
    [sectors.data, t],
  )

  // Restore a draft kept from an earlier visit.
  useEffect(() => {
    const kept = resumeStorage.get()
    if (!kept) return
    intakeService
      .getDraft(kept.draftId, kept.token)
      .then((d) => {
        setTitle((v) => v || d.title || '')
        // A kept draft was saved with a choice, so no sector means "Not sure".
        const sector = d.sector ?? NOT_SURE
        setSectorId((v) => v ?? sector)
        if (d.program_detail && !d.program_detail.is_general_intake) {
          setProgramId(d.program)
          setFormId(d.form_id)
        }
        // A refresh on the phone step (1.2) reopens it, with everything kept.
        if (resumeStorage.stage() === 'confirm' && d.title) {
          restored.current = {
            draftId: kept.draftId, token: kept.token, title: d.title, sectorId: d.sector,
            sectorName: '', programId: d.program_detail?.is_general_intake ? null : d.program,
            programTitle: d.program_detail?.is_general_intake ? null : d.program_detail?.title ?? null,
          }
        }
        lastSaved.current = JSON.stringify([d.title, sector, d.program_detail?.is_general_intake ? '' : d.program])
        setSave('saved')
      })
      .catch(() => {
        resumeStorage.clear()
        setDraft(null)
      })
  }, [])

  // Reopen the phone step after a refresh, once the sector names are in.
  useEffect(() => {
    const draftKept = restored.current
    if (!draftKept || resumed.current || sectors.loading) return
    resumed.current = true
    const name = draftKept.sectorId ? (sectors.data ?? []).find((s) => s.id === draftKept.sectorId)?.name ?? '' : t('qs.notSure')
    onContinue({ ...draftKept, sectorName: name })
  }, [sectors.loading, sectors.data, onContinue, t, save])

  // A challenge entry uses that challenge's form, so the bar shows its steps.
  useEffect(() => {
    if (!programId || !draft || save !== 'saved') return
    let alive = true
    intakeService.getDraft(draft.draftId, draft.token).then((d) => alive && setFormId(d.form_id)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [programId, draft, save])

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
          const res = await intakeService.quickStart({ title: clean, sector: sectorForApi(sectorId), ...(programId ? { program_id: programId } : {}) })
          resumeStorage.set(res.draft_id, res.resume_token)
          setDraft({ draftId: res.draft_id, token: res.resume_token })
        } else {
          await intakeService.updateDraft(draft.draftId, { title: clean, sector: sectorForApi(sectorId), ...(programId ? { program: programId } : {}) }, draft.token)
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
    if (!draft || save === 'saving' || busy) return
    const program = allChallenges.find((c) => c.id === programId)
    onContinue({
      draftId: draft.draftId,
      token: draft.token,
      title: title.trim(),
      sectorId: sectorForApi(sectorId as string),
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
      <h2 id="qs-title" className="text-d-h4 font-heading">{t('qs.title')}</h2>
      <JourneyBar names={journey.names} current={0} />
      <p className="text-d-body-s text-muted">{basicsOnly ? t('qs.intro') : t('qs.introFull')}</p>

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
                    'inline-flex items-center min-h-[32px] lg:min-h-[30px] px-3 rounded-full text-d-label-s cursor-pointer border transition-colors',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2',
                    on ? 'bg-primary border-primary text-on-primary' : 'bg-surface border-border text-text hover:border-muted/60',
                  )}
                >
                  <input type="radio" name="qs-sector" value={s.id} checked={on} onChange={() => setSectorId(s.id)} className="sr-only" />
                  {s.name}
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

      <Button type="submit" block loading={busy} disabled={!ready && save !== 'error'}>
        {t('qs.continue')}
      </Button>

      {/* Empty until there is something to say; then it takes no extra room above the privacy line (Figma 10:280). */}
      <p className="flex items-start gap-1.5 text-d-cap text-muted empty:-mt-2" aria-live="polite">
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

/** The real form's steps on the quick start (1.1 and 1.2): step 1 is this card. */
export function JourneyBar({ names, current }: { names: string[]; current: number }) {
  if (names.length === 0) return <Skeleton className="h-10 w-full" />
  return <StepProgress steps={names} current={current} className="!bg-transparent !p-0" />
}
