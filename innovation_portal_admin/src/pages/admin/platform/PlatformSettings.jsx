import React from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import FeaturesTab from './FeaturesTab'
import IntegrationTab from './IntegrationTab'

const TABS = [
  { key: 'features', label: 'Features' },
  { key: 'sso', label: 'Single sign-on' },
  { key: 'sms', label: 'SMS' },
]

export default function PlatformSettings() {
  const [params, setParams] = useSearchParams()
  const active = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'features'

  return (
    <div>
      <PageHeader
        title="Platform settings"
        subtitle="Switch features on or off and set up sign-in and SMS providers. Changes apply to the whole portal."
      />
      <Tabs tabs={TABS} active={active} onChange={(key) => setParams({ tab: key }, { replace: true })} className="mb-5" />
      {active === 'features' && <FeaturesTab />}
      {active === 'sso' && <IntegrationTab key="sso" kind="sso" />}
      {active === 'sms' && <IntegrationTab key="sms" kind="sms" />}
    </div>
  )
}
