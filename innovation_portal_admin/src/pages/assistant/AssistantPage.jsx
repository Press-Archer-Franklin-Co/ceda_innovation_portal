import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import { useTabParam } from '../../lib/useTabParam'
import { useI18n } from '../../i18n/context'
import OverviewTab from '../../components/assistant/OverviewTab'
import KnowledgeTab from '../../components/assistant/KnowledgeTab'
import ManualTab from '../../components/assistant/ManualTab'
import TryItTab from '../../components/assistant/TryItTab'

/** Admin > AI helper (C3, assistant.manage). The route and the menu entry ask for the same capability. */
export default function AssistantPage() {
  const { t } = useI18n()
  const tabs = [
    { key: 'overview', label: t('ai.admin.tabOverview') },
    { key: 'guidance', label: t('ai.admin.tabKnowledge') },
    { key: 'manual', label: t('ai.admin.tabManual') },
    { key: 'try', label: t('ai.admin.tabTry') },
  ]
  const [tab, setTab] = useTabParam(tabs)
  return (
    <div>
      <PageHeader title={t('ai.admin.title')} subtitle={t('ai.admin.subtitle')} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-5" />
      {tab === 'overview' && <OverviewTab />}
      {tab === 'guidance' && <KnowledgeTab />}
      {tab === 'manual' && <ManualTab />}
      {tab === 'try' && <TryItTab />}
    </div>
  )
}
