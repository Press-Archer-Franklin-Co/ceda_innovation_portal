import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import SectionCard from '../ui/SectionCard'
import Skeleton from '../ui/Skeleton'
import { useT } from '../../i18n/context'
import { pitchApi, pitchWhen } from '../../lib/api/pitch'
import PitchSessionModal from './PitchSessionModal'
import { WhereText } from './PitchSchedule'

/**
 * Staff idea page (3.16): the person's pitch time with "Change", for people who may change challenges (the same
 * capability the per-idea API checks). Shown on shortlisted ideas, or when the idea already has its own time.
 */
export default function PitchTimeCard({ programId, submissionId, name }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const data = useQuery({ queryKey: ['pitch', programId, submissionId], queryFn: () => pitchApi.get(programId, submissionId), enabled: !!programId })
  if (data.isError) return null // The idea page still works; nothing false is shown.
  if (data.isLoading) return <Skeleton className="h-28 rounded-card" />
  const { shortlisted, own, shown } = data.data ?? {}
  if (!shortlisted && !own) return null
  const session = own ?? shown
  return (
    <SectionCard
      title={t('pitch.card')}
      actions={<button ref={ref} type="button" onClick={() => setOpen(true)} className="text-[13px] font-bold text-primary hover:underline">{own ? t('pitch.change') : t('pitch.set')}</button>}
    >
      {session ? (
        <div className="flex flex-col gap-1 text-[14px] text-text">
          <span>{t('pitch.gaborone', { when: pitchWhen(session) })}{session.duration_minutes ? <span className="text-muted"> · {t('pitch.minutesShort', { n: session.duration_minutes })}</span> : null}</span>
          <WhereText session={session} />
          {!own && <span className="text-[12px] text-muted">{t('pitch.cardStage')}</span>}
        </div>
      ) : (
        <p className="text-[14px] text-muted">{t('pitch.cardNone')}</p>
      )}
      <PitchSessionModal open={open} onClose={() => setOpen(false)} programId={programId} submissionId={submissionId} name={name} triggerRef={ref} />
    </SectionCard>
  )
}
