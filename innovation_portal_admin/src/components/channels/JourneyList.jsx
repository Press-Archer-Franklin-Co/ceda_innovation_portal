import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import EmptyState from '../ui/EmptyState'
import { useToast } from '../ui/toast'
import { journeyStatusWords } from './format'
import { useCreateJourney, useJourneys, useNodeTypes } from '../../lib/queries/channels'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { newNode, typeMap } from './journeyModel'

// Left column of 3.31 (Menus) and 3.31b (Flows); on a phone it is the whole page (Figma 137:1696, 145:2060).
// A journey set up for both channels shows in both builders.

export function NewJourneyModal({ channel, open, onClose, basePath }) {
  const { t } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const create = useCreateJourney()
  const typesQuery = useNodeTypes()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError(t('ch.journeys.nameRequired'))
    const first = newNode(channel === 'ussd' ? 'menu' : 'message', [], typeMap(typesQuery.data))
    try {
      const journey = await create.mutateAsync({ name: name.trim(), channel, nodes: [first], start_key: first.key })
      toast.show({ title: t('ch.journeys.created'), tone: 'success' })
      setName('')
      onClose()
      navigate(`${basePath}/${journey.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(channel === 'ussd' ? 'ch.ussd.newTitle' : 'ch.wa.newTitle')}
      description={t(channel === 'ussd' ? 'ch.ussd.newBody' : 'ch.wa.newBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={`new-journey-${channel}`} loading={create.isPending}>{t('ch.journeys.create')}</Button>
        </>
      }
    >
      <form id={`new-journey-${channel}`} onSubmit={submit}>
        <Input label={t('ch.journeys.name')} value={name} maxLength={120} required autoFocus error={error || undefined} onChange={(e) => { setName(e.target.value); setError('') }} />
      </form>
    </Modal>
  )
}

export default function JourneyList({ channel, activeId, basePath, className }) {
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)
  const { data, isLoading, isError, error, refetch, isFetching } = useJourneys({ channel })
  const journeys = (data ?? []).filter((j) => j.channel === channel || j.channel === 'both')
  const unit = channel === 'ussd' ? 'ch.ussd.screens' : 'ch.wa.blocks'

  return (
    <nav aria-label={t(channel === 'ussd' ? 'ch.ussd.listLabel' : 'ch.wa.listLabel')} className={className}>
      <p className="text-d-cap text-muted mb-1.5">{t(channel === 'ussd' ? 'ch.ussd.listLabel' : 'ch.wa.listLabel')}</p>
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : isError ? (
        <ErrorState compact title={t('ch.journeys.loadFailed')} message={error?.message} onRetry={refetch} retrying={isFetching} />
      ) : journeys.length === 0 ? (
        <EmptyState compact title={t(channel === 'ussd' ? 'ch.ussd.emptyTitle' : 'ch.wa.emptyTitle')} message={t('ch.journeys.emptyBody')} />
      ) : (
        <ul className="space-y-1.5 lg:space-y-1">
          {journeys.map((j) => {
            const active = j.id === activeId
            return (
              <li key={j.id}>
                <Link
                  to={`${basePath}/${j.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-card lg:rounded-control border lg:border-0 border-border px-3.5 py-3 lg:py-2 hover:bg-surface2',
                    active && 'lg:bg-primary-soft',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm font-bold truncate', active ? 'text-primary' : 'text-text')}>{j.name}</span>
                    <span className="block text-d-cap text-muted truncate">{t(unit, { count: j.node_count })} · {journeyStatusWords(j, t)}</span>
                  </span>
                  <ChevronRight size={16} aria-hidden className="text-muted lg:hidden" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Button variant="link" size="sm" icon={<Plus size={14} />} className="mt-2" onClick={() => setCreating(true)}>
        {t(channel === 'ussd' ? 'ch.ussd.new' : 'ch.wa.new')}
      </Button>
      <NewJourneyModal channel={channel} open={creating} onClose={() => setCreating(false)} basePath={basePath} />
    </nav>
  )
}
