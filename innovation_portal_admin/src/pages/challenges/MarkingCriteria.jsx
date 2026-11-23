import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import EditorWorkspace from '../../components/ui/EditorWorkspace'
import Button from '../../components/ui/Button'
import { SelectControl } from '../../components/ui/Select'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toast'
import JudgingEditor from '../../components/challenges/JudgingEditor'
import { useT } from '../../i18n/context'
import { usePrograms } from '../../lib/queries/programs'
import { useProgramJudging, useSaveProgramJudging } from '../../lib/queries/forms'
import { toPayload, total } from '../../lib/challenges/judging'

/** 3.7: one challenge's marking criteria, picked from the shared library. */
export default function MarkingCriteria() {
  const t = useT()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const programId = params.get('program') || ''
  const programs = usePrograms({ page_size: 100 })
  const judging = useProgramJudging(programId || null)
  const save = useSaveProgramJudging(programId)
  const [value, setValue] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = `${t('mc.title')} · CEDA Innovation`
  }, [t])

  useEffect(() => {
    setValue(null)
    setError('')
  }, [programId])

  useEffect(() => {
    if (judging.data) {
      setValue({ criteria: judging.data.criteria ?? [], pass_mark: judging.data.pass_mark ?? '', reviewers_per_idea: judging.data.reviewers_per_idea ?? '' })
      setError('')
    }
  }, [judging.data])

  const options = useMemo(() => {
    const list = Array.isArray(programs.data) ? programs.data : programs.data?.results ?? []
    return list.filter((p) => !p.is_general_intake && p.status !== 'archived').map((p) => ({ value: p.id, label: p.title }))
  }, [programs.data])

  const ok = value && Math.abs(total(value.criteria) - 100) < 0.001

  async function onSave() {
    setError('')
    try {
      await save.mutateAsync(toPayload(value))
      toast.show({ tone: 'success', title: t('mc.saved') })
    } catch (err) {
      const data = err?.data?.errors ?? err?.data ?? {}
      setError(data.weights || data.criteria || err?.message || t('common.somethingWrong'))
    }
  }

  const header = (
      <PageHeader
        back={<Link to="/programs" className="text-[12px] text-muted hover:text-text hover:underline">{t('mc.crumb')}</Link>}
        title={t('mc.title')}
        subtitle={t('mc.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[300px] max-w-full">
              <SelectControl
                aria-label={t('mc.for')}
                placeholder={`${t('mc.for')}: ${t('mc.pickChallenge')}`}
                options={options}
                value={programId || null}
                onChange={(id) => setParams({ program: id }, { replace: true })}
              />
            </div>
            <Button onClick={onSave} loading={save.isPending} disabled={!value || !ok}>{t('mc.save')}</Button>
          </div>
        }
      />
  )
  const notices = error ? <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-[13px] text-danger">{String(error)}</p> : null

  // One workspace with no panel until there is a rubric to show.
  if (!programId || judging.isError || !value) {
    return (
      <EditorWorkspace header={header} notices={notices} noPanel>
        {!programId ? (
          <EmptyState title={t('mc.noChallenge')} framed />
        ) : judging.isError ? (
          <ErrorState title={t('mc.loadError')} message={judging.error?.message} onRetry={judging.refetch} framed />
        ) : (
          <Skeleton className="h-[420px] rounded-card" />
        )}
      </EditorWorkspace>
    )
  }

  return (
    <EditorWorkspace
      header={header}
      notices={notices}
      side={<div className="lg:w-[240px] xl:w-[260px]"><JudgingEditor variant="library" value={value} onChange={setValue} /></div>}
      panel={<JudgingEditor variant="previews" value={value} onChange={setValue} />}
      panelLabel={t('mc.previewPublic')}
      phonePanel="inline"
    >
      <JudgingEditor variant="rubric" value={value} onChange={setValue} />
    </EditorWorkspace>
  )
}
