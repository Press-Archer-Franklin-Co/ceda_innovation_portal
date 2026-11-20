import React from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import FeaturesTab from './FeaturesTab'
import IntegrationTab from './IntegrationTab'
import { useT } from '../../../i18n/context'

const TABS = [
  { key: 'features', label: 'Features' },
  { key: 'sso', label: 'Single sign-on' },
  { key: 'sms', label: 'SMS' },
]

export default function PlatformSettings() {
  const t = useT()
  // C3: the Claude connection for the AI helper (integration kind ai).
  const tabs = [...TABS, { key: 'ai', label: t('staff.nav.assistant') }]
  const [params, setParams] = useSearchParams()
  const active = tabs.some((tab) => tab.key === params.get('tab')) ? params.get('tab') : 'features'

  return (
    <div>
      <PageHeader
        title="Platform settings"
        subtitle="Switch features on or off and set up sign-in and SMS providers. Changes apply to the whole portal."
      />
      <Tabs tabs={tabs} active={active} onChange={(key) => setParams({ tab: key }, { replace: true })} className="mb-5" />
      {active === 'features' && <FeaturesTab />}
      {active === 'sso' && <IntegrationTab key="sso" kind="sso" />}
      {active === 'sms' && <IntegrationTab key="sms" kind="sms" />}
      {active === 'ai' && <IntegrationTab key="ai" kind="ai" />}
    </div>
  )
}
