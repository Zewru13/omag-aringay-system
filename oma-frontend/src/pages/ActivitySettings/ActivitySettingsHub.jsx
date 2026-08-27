import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
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
      <div className="flex gap-2 mb-5">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setTab(tab.value)}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.value
                ? 'bg-[#1B4D2E] text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'crop'      && <CropActivityTypePage      asTab />}
      {activeTab === 'fisheries' && <FisheriesActivityTypePage asTab />}
    </PageLayout>
  )
}

export default ActivitySettingsHub
