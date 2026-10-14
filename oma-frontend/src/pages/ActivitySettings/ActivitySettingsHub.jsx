import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import CropActivityTypePage from './CropActivityTypePage.jsx'
import FisheriesActivityTypePage from './FisheriesActivityTypePage.jsx'

const TABS = [
  { value: 'crop',      label: 'Crop Activities' },
  { value: 'fisheries', label: 'Fisheries Activities' },
]

function ActivitySettingsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'crop'

  const setTab = (tab) => setSearchParams({ tab }, { replace: true })

  return (
    <PageLayout
      title="Activity Settings"
      subtitle="Manage the activity types offered when logging crop and fisheries monitoring activities"
    >
      <div className="mb-4">
        <PillTabs
          ariaLabel="Settings sections"
          tabs={TABS.map(({ value, label }) => ({ id: value, label }))}
          value={activeTab}
          onChange={setTab}
        />
      </div>

      {activeTab === 'crop'      && <CropActivityTypePage      asTab />}
      {activeTab === 'fisheries' && <FisheriesActivityTypePage asTab />}
    </PageLayout>
  )
}

export default ActivitySettingsHub
