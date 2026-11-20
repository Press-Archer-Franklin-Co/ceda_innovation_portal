import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Route as RouteIcon } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import DataTable from '../../components/ui/DataTable'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import { RadioGroup } from '../../components/ui/Choice'
import { useToast } from '../../components/ui/toast'
import { ChannelTag, JourneyStatusTag } from '../../components/channels/tags'
import ChannelStatusBanner from '../../components/channels/ChannelStatusBanner'
import { useCreateJourney, useJourneys } from '../../lib/queries/channels'
import { useT } from '../../i18n/context'
import { formatDate } from '../../components/channels/format'

function NewJourneyDialog({ open, onClose }) {
  const t = useT()
  const toast = useToast()
  const navigate = useNavigate()
  const create = useCreateJourney()
  const [name, setName] = useState('')
  const [channel, setChannel] = useState('both')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('ch.journeys.nameRequired'))
      return
    }
    try {
      const journey = await create.mutateAsync({ name: name.trim(), channel })
      toast.show({ title: t('ch.journeys.created'), tone: 'success' })
      onClose()
      navigate(`/channels/journeys/${journey.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ch.journeys.newTitle')}
      description={t('ch.journeys.newBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="new-journey" loading={create.isPending}>{t('ch.journeys.create')}</Button>
        </>
      }
    >
      <form id="new-journey" className="space-y-4" onSubmit={submit}>
        <Input label={t('ch.journeys.name')} value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setError('') }} error={error || undefined} required autoFocus />
        <RadioGroup
          name="channel"
          legend={t('ch.journeys.channel')}
          value={channel}
          onChange={setChannel}
          options={['both', 'ussd', 'whatsapp'].map((value) => ({ value, label: t(`ch.channel.${value}`), description: t(`ch.channelHint.${value}`) }))}
        />
      </form>
    </Modal>
  )
}

export default function Journeys() {
  const t = useT()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const { data, isLoading, isError, error, refetch, isFetching } = useJourneys()
  const journeys = data ?? []

  return (
    <div>
      <PageHeader
        title={t('ch.journeys.title')}
        subtitle={t('ch.journeys.subtitle')}
        actions={<Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>{t('ch.journeys.new')}</Button>}
      />
      <ChannelStatusBanner className="mb-3.5" />
      <SectionCard padding={false}>
        <DataTable
          loading={isLoading}
          error={isError ? error?.message || t('ch.journeys.loadFailed') : undefined}
          onRetry={refetch}
          retrying={isFetching}
          emptyIcon={RouteIcon}
          emptyTitle={t('ch.journeys.emptyTitle')}
          emptyMessage={t('ch.journeys.emptyBody')}
          emptyAction={<Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>{t('ch.journeys.new')}</Button>}
          onRowClick={(row) => navigate(`/channels/journeys/${row.id}`)}
          data={journeys}
          columns={[
            {
              key: 'name',
              label: t('ch.journeys.colName'),
              sortable: true,
              render: (value, row) => (
                <div className="min-w-0">
                  <Link to={`/channels/journeys/${row.id}`} className="text-sm font-bold text-text hover:text-primary" onClick={(e) => e.stopPropagation()}>{value}</Link>
                  {row.description && <p className="text-xs text-muted truncate">{row.description}</p>}
                </div>
              ),
            },
            { key: 'channel', label: t('ch.journeys.colChannel'), render: (value) => <ChannelTag channel={value} /> },
            { key: 'status', label: t('ch.journeys.colStatus'), render: (_, row) => <JourneyStatusTag journey={row} /> },
            { key: 'node_count', label: t('ch.journeys.colSteps'), sortable: true },
            { key: 'connection_count', label: t('ch.journeys.colConnections'), sortable: true },
            { key: 'updated_at', label: t('ch.journeys.colUpdated'), sortable: true, render: (value) => formatDate(value) },
          ]}
        />
      </SectionCard>
      <NewJourneyDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
