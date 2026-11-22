import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Image as ImageIcon, Trophy } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import Textarea from '../../components/ui/Textarea'
import { SelectControl } from '../../components/ui/Select'
import Skeleton from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { Toggle } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { defaultWinnersChallenge } from '../../lib/content/winners'
import { usePrograms, useProgram } from '../../lib/queries/programs'

// 3.37 Winners (Figma 141:2192 website, 141:2449 phone). ① Pick the challenge; winners come from final decisions,
// so staff only order them and add a photo and a short story. ② Order the cards; each has a publish switch.
// ③ Publish results sends every applicant their own outcome and makes 1.10 public.
// Data: GET /api/programs/{id}/results/manage/ (R-59 item 3). Until it exists: winners from the winner spotlights
// (photo and story can be edited) and the shortlist from the staff list; order and the per-card switch wait for R-59.
// Phone: order and switches; photos from the phone camera.

const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const PLACE_ORDER = { '1st': 1, '2nd': 2, '3rd': 3, runner_up: 4, special: 5, shortlisted: 9 }
const PLACE_TONE = { '1st': 'orange', '2nd': 'orange', '3rd': 'orange', shortlisted: 'neutral' }

async function loadEntries(programId) {
  try {
    const data = await client.get(`/api/programs/${programId}/results/manage/`)
    return { managed: true, ...data, entries: [...(data.entries ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }
  } catch (err) {
    if (err?.status !== 404 && err?.status !== 405) throw err
  }
  // TODO(R-59): drop this once results/manage is on main.
  const [spotlights, shortlisted, finalists] = await Promise.all([
    client.get('/api/content/winners/', { program: programId }),
    client.get('/api/submissions/staff-list/', { program: programId, status: 'shortlisted', page_size: 100 }),
    client.get('/api/submissions/staff-list/', { program: programId, status: 'finalist', page_size: 100 }),
  ])
  const winners = asList(spotlights).map((w) => ({
    key: `w-${w.id}`,
    spotlight_id: w.id,
    submission_id: w.submission,
    title: w.project_name || w.team_name,
    applicant: w.team_name,
    district: '',
    place: w.position,
    photo_url: w.photo_url,
    story: { en: w.description ?? '', tn: '' },
    show_on_results: null,
  }))
  const taken = new Set(winners.map((w) => w.submission_id).filter(Boolean))
  const short = [...asList(finalists), ...asList(shortlisted)].filter((s) => !taken.has(s.id)).map((s) => ({
    key: `s-${s.id}`,
    submission_id: s.id,
    title: s.title,
    applicant: s.innovator?.name ?? '',
    district: s.district?.name ?? '',
    place: 'shortlisted',
    photo_url: null,
    story: null,
    show_on_results: null,
  }))
  return {
    managed: false,
    entries: [...winners.sort((a, b) => (PLACE_ORDER[a.place] ?? 8) - (PLACE_ORDER[b.place] ?? 8)), ...short],
  }
}

function EntryDialog({ entry, programId, managed, onClose, triggerRef }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [story, setStory] = useState({ en: '', tn: '' })
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setStory({ en: entry?.story?.en ?? '', tn: entry?.story?.tn ?? '' }); setPhoto(null) }, [entry])
  if (!entry) return null

  async function save() {
    setBusy(true)
    try {
      if (managed) {
        await client.patch(`/api/programs/${programId}/results/manage/${entry.submission_id}/`, { story })
        if (photo) { const f = new FormData(); f.append('file', photo); await client.post(`/api/programs/${programId}/results/manage/${entry.submission_id}/photo/`, f) }
      } else {
        const f = new FormData()
        f.append('description', story.en)
        if (photo) f.append('photo', photo)
        await client.patch(`/api/content/winners/${entry.spotlight_id}/`, f)
      }
      qc.invalidateQueries({ queryKey: ['results', programId] })
      toast.show({ tone: 'success', title: t('win.saved') })
      onClose()
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} triggerRef={triggerRef} title={entry.title} description={[entry.applicant, entry.district].filter(Boolean).join(' · ')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} loading={busy}>{t('common.save')}</Button></>}>
      <div className="flex flex-col gap-3">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        <Button variant="secondary" size="sm" className="self-start" icon={<ImageIcon size={14} aria-hidden />} onClick={() => fileRef.current?.click()}>{photo ? photo.name : entry.photo_url ? t('win.changePhoto') : t('win.addPhoto')}</Button>
        <Textarea label={t('win.story')} hint={t('win.storyHint')} rows={4} maxChars={400} value={story.en} onChange={(e) => setStory((s) => ({ ...s, en: e.target.value }))} />
        {managed && <Textarea label={t('win.storyTn')} optional rows={4} maxChars={400} value={story.tn} onChange={(e) => setStory((s) => ({ ...s, tn: e.target.value }))} />}
      </div>
    </Modal>
  )
}

export default function Winners() {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const programs = usePrograms()
  const list = useMemo(() => asList(programs.data).filter((p) => p.status !== 'archived' && !p.is_general_intake), [programs.data])
  const [programId, setProgramId] = useState('')
  useEffect(() => {
    if (!programId && list.length) setProgramId(String(defaultWinnersChallenge(list).id))
  }, [list, programId])
  const program = useProgram(programId)
  const results = useQuery({ queryKey: ['results', programId], enabled: !!programId, queryFn: () => loadEntries(programId) })
  const [editing, setEditing] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const editRef = useRef(null)

  useEffect(() => { document.title = `${t('win.title')} · CEDA Innovation` }, [t])

  const p = program.data
  const data = results.data
  const managed = !!data?.managed
  const published = managed ? !!data.results_published : !!p?.results_announced_at && new Date(p.results_announced_at) <= new Date()
  const publicUrl = p?.slug ? `${window.location.origin}/challenges/${p.slug}/results` : null

  async function patchEntry(entry, body) {
    try {
      await client.patch(`/api/programs/${programId}/results/manage/${entry.submission_id}/`, body)
      qc.invalidateQueries({ queryKey: ['results', programId] })
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    }
  }

  async function move(i, by) {
    const next = [...data.entries]
    const [it] = next.splice(i, 1)
    next.splice(i + by, 0, it)
    qc.setQueryData(['results', programId], { ...data, entries: next })
    await Promise.all(next.map((e, order) => (e.order === order ? null : client.patch(`/api/programs/${programId}/results/manage/${e.submission_id}/`, { order }))).filter(Boolean)).catch((err) => toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message }))
    qc.invalidateQueries({ queryKey: ['results', programId] })
  }

  async function toggleNames(on) {
    try {
      await client.patch(`/api/programs/${programId}/`, { show_names_on_results: on })
      qc.invalidateQueries({ queryKey: ['programs', programId] })
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    }
  }

  async function publish() {
    const ok = await confirm({ title: t('win.publishTitle', { name: p?.title ?? '' }), body: t('win.publishBody'), confirmLabel: t('win.publish') })
    if (!ok) return
    setPublishing(true)
    try {
      const res = await client.post(`/api/programs/${programId}/results/publish/`)
      qc.invalidateQueries({ queryKey: ['results', programId] })
      qc.invalidateQueries({ queryKey: ['programs', programId] })
      toast.show(res?.published === false ? { tone: 'warning', title: t('win.held'), body: res?.hold_reason } : { tone: 'success', title: t('win.published') })
    } catch (err) {
      toast.show({ tone: 'error', title: err?.data?.code === 'still_open' || /still_open/.test(err?.message ?? '') ? t('win.stillOpen') : t('common.somethingWrong'), body: err?.message })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('win.crumb')}</span>}
        title={t('win.title')}
        subtitle={t('win.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[14px] font-bold text-primary hover:underline">{t('win.preview')}</a>}
            <Button onClick={publish} loading={publishing} disabled={!programId || published || !data?.entries?.length}>{t('win.publish')}</Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-[360px]">
          {programs.isLoading ? <Skeleton className="h-10" /> : (
            <SelectControl aria-label={t('win.challenge')} options={list.map((x) => ({ value: String(x.id), label: x.title }))} value={programId} onChange={setProgramId} searchable placeholder={t('win.pick')} />
          )}
        </div>
        {p && <Tag tone={published ? 'green' : 'amber'}>{published ? t('win.isPublished') : t('win.notPublished')}</Tag>}
        {p && 'show_names_on_results' in p && (
          <Toggle className="sm:ml-auto" label={t('win.showNames')} checked={!!p.show_names_on_results} onChange={toggleNames} />
        )}
      </div>

      {!programId && !programs.isLoading ? (
        <EmptyState framed icon={Trophy} title={t('win.noChallenges')} />
      ) : results.isLoading || (!results.isError && !data) ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[270px] rounded-card" />)}</div>
      ) : results.isError ? (
        <ErrorState framed title={t('win.loadError')} message={results.error?.message} onRetry={results.refetch} />
      ) : data.entries.length === 0 ? (
        <EmptyState framed icon={Trophy} title={t('win.empty')} message={t('win.emptyBody')} />
      ) : (
        <>
          {!managed && <p className="rounded-control bg-surface2 px-3 py-2 text-[13px] text-muted">{t('win.orderSoon')}</p>}
          <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.entries.map((e, i) => {
              const editable = managed || e.spotlight_id
              return (
                <li key={e.key ?? e.submission_id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
                  <div className="flex aspect-[25/12] items-center justify-center overflow-hidden rounded-control bg-surface2 text-muted">
                    {e.photo_url ? <img src={e.photo_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={22} aria-hidden />}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Tag tone={PLACE_TONE[e.place] ?? 'orange'}>{t(`win.place.${e.place}`) !== `win.place.${e.place}` ? t(`win.place.${e.place}`) : e.place}</Tag>
                    {managed && (
                      <span className="flex">
                        <button type="button" className="btn-icon" disabled={i === 0} aria-label={t('win.earlier', { name: e.title })} onClick={() => move(i, -1)}><ArrowLeft size={14} aria-hidden /></button>
                        <button type="button" className="btn-icon" disabled={i === data.entries.length - 1} aria-label={t('win.later', { name: e.title })} onClick={() => move(i, 1)}><ArrowRight size={14} aria-hidden /></button>
                      </span>
                    )}
                  </div>
                  <h2 className="text-[15px] font-bold text-text">{e.title}</h2>
                  <p className="text-[12px] text-muted">{[e.applicant, e.district].filter(Boolean).join(' · ')}</p>
                  {editable && (
                    <button type="button" onClick={(ev) => { editRef.current = ev.currentTarget; setEditing(e) }} className="self-start text-[13px] font-bold text-primary hover:underline">
                      {t('win.photoStory')}
                    </button>
                  )}
                  {managed && (
                    <Toggle className="mt-auto" label={t('win.show')} checked={!!e.show_on_results} onChange={(v) => patchEntry(e, { show_on_results: v })} />
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}
      {editing && <EntryDialog entry={editing} programId={programId} managed={managed} triggerRef={editRef} onClose={() => setEditing(null)} />}
    </div>
  )
}
