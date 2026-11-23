import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Copy, ExternalLink, Plus } from 'lucide-react'
import PageHeader from '../ui/PageHeader'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import DropdownMenu from '../ui/DropdownMenu'
import Tabs from '../ui/Tabs'
import { useConfirm } from '../ui/confirm'
import { useToast } from '../ui/toast'
import { useTrigger } from '../ui/useTrigger'
import { NewJourneyModal } from './JourneyList'
import { JourneyStatusTag } from './tags'
import { formatDateTime } from './format'
import { fromJourney, toPayload } from './journeyModel'
import { channelsApi as api } from '../../lib/api/channels'
import { useCreateJourney, useJourneys, useUpdateJourney } from '../../lib/queries/channels'
import { useI18n } from '../../i18n/context'
import { EMPTY_CELL } from '../../lib/format'

// The list of flows (WhatsApp) or menus (USSD): one row each with status, last change and the connections that
// run it. Opening one goes to its editor page. On a phone the table becomes cards.

export default function JourneysPage({ channel }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const newTrigger = useTrigger()
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState('active')
  const archived = view === 'archived'
  const basePath = channel === 'ussd' ? '/channels/ussd' : '/channels/whatsapp'
  const query = useJourneys({ channel, ...(archived ? { archived: '1' } : {}) })
  const create = useCreateJourney()
  const update = useUpdateJourney()
  const rows = (query.data ?? []).filter((j) => j.channel === channel || j.channel === 'both')
  const ussd = channel === 'ussd'

  const duplicate = async (row) => {
    try {
      const full = await api.journey(row.id)
      const copy = await create.mutateAsync({
        name: t('ch.list.copyName', { name: full.name }).slice(0, 120), channel: full.channel, default_language: full.default_language,
        start_key: full.start_key, nodes: toPayload(fromJourney(full)),
      })
      toast.show({ title: t('ch.list.duplicated'), tone: 'success' })
      navigate(`${basePath}/${copy.id}`)
    } catch (error) {
      toast.show({ title: t('ch.list.duplicateFailed'), body: error.message, tone: 'error' })
    }
  }

  const setArchived = async (row, value) => {
    if (value) {
      const ok = await confirm({ title: t('ch.list.archiveTitle', { name: row.name }), body: t('ch.list.archiveBody'), confirmLabel: t('ch.list.archive') })
      if (!ok) return
    }
    try {
      await update.mutateAsync({ id: row.id, body: { name: row.name, is_archived: value } })
      toast.show({ title: t(value ? 'ch.list.archived' : 'ch.list.restored'), tone: 'success' })
    } catch (error) {
      toast.show({ title: t('ch.list.archiveFailed'), body: error.message, tone: 'error' })
    }
  }

  const columns = [
    { key: 'name', label: t('ch.list.name'), link: (row) => `${basePath}/${row.id}`, render: (value) => <span className="font-bold text-text">{value}</span> },
    { key: 'status', label: t('ch.list.status'), render: (_, row) => <JourneyStatusTag journey={row} /> },
    { key: 'updated_at', label: t('ch.list.changed'), render: (value) => formatDateTime(value) },
    { key: 'connection_names', label: t('ch.list.usedBy'), render: (value) => (value?.length ? value.join(', ') : EMPTY_CELL) },
    {
      key: 'actions', label: <span className="sr-only">{t('ch.list.actions')}</span>, align: 'right',
      render: (_, row) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
          <DropdownMenu
            label={t('ch.list.actionsFor', { name: row.name })}
            items={[
              { key: 'open', label: t('ch.list.open'), icon: <ExternalLink size={14} aria-hidden />, onSelect: () => navigate(`${basePath}/${row.id}`) },
              { key: 'duplicate', label: t('ch.list.duplicate'), icon: <Copy size={14} aria-hidden />, onSelect: () => duplicate(row) },
              archived
                ? { key: 'restore', label: t('ch.list.restore'), icon: <ArchiveRestore size={14} aria-hidden />, onSelect: () => setArchived(row, false) }
                : { key: 'archive', label: t('ch.list.archive'), icon: <Archive size={14} aria-hidden />, danger: true, onSelect: () => setArchived(row, true) },
            ]}
          />
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t(ussd ? 'ch.ussd.crumb' : 'ch.wa.crumb')}</span>}
        title={t(ussd ? 'ch.ussd.title' : 'ch.wa.title')}
        subtitle={t(ussd ? 'ch.ussd.subtitle' : 'ch.wa.subtitle')}
        actions={<Button ref={newTrigger.ref} icon={<Plus size={14} />} onClick={() => setCreating(true)}>{t(ussd ? 'ch.ussd.new' : 'ch.wa.new')}</Button>}
      />
      <Tabs
        className="mb-3"
        active={view}
        onChange={setView}
        label={t(ussd ? 'ch.ussd.listLabel' : 'ch.wa.listLabel')}
        tabs={[{ key: 'active', label: t(ussd ? 'ch.list.activeMenus' : 'ch.list.activeFlows') }, { key: 'archived', label: t('ch.list.archivedTab') }]}
      />
      <DataTable
        caption={t(ussd ? 'ch.ussd.listLabel' : 'ch.wa.listLabel')}
        columns={columns}
        data={rows}
        loading={query.isLoading}
        error={query.isError ? query.error?.message || t('ch.journeys.loadFailed') : null}
        onRetry={query.refetch}
        retrying={query.isFetching}
        emptyTitle={archived ? t('ch.list.noArchived') : t(ussd ? 'ch.ussd.emptyTitle' : 'ch.wa.emptyTitle')}
        emptyMessage={archived ? '' : t('ch.journeys.emptyBody')}
        onRowClick={(row) => navigate(`${basePath}/${row.id}`)}
      />
      <NewJourneyModal channel={channel} open={creating} onClose={() => setCreating(false)} basePath={basePath} triggerRef={newTrigger.ref} />
    </div>
  )
}
