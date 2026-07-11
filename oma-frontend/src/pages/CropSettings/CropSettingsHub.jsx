import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import CropOptionPage from '../CropOption/CropOptionPage.jsx'
import CropCategoryPage from '../CropCategory/CropCategoryPage.jsx'
import SeedSourcePage from '../SeedSource/SeedSourcePage.jsx'
import CropVarietyPage from '../CropVariety/CropVarietyPage.jsx'

const TABS = [
  { value: 'options',     label: 'Crop Options' },
  { value: 'categories',  label: 'Categories' },
  { value: 'seedsources', label: 'Seed Sources' },
  { value: 'varieties',   label: 'Varieties' },
]

function CropSettingsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'options'

  const setTab = (tab) => setSearchParams({ tab }, { replace: true })

  return (
    <PageLayout
      title="Crop Settings"
      subtitle="Configure crop options, categories, and activity suggestions"
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

      {activeTab === 'options'     && <CropOptionPage    asTab />}
      {activeTab === 'categories'  && <CropCategoryPage  asTab />}
      {activeTab === 'seedsources' && <SeedSourcePage    asTab />}
      {activeTab === 'varieties'   && <CropVarietyPage   asTab />}
    </PageLayout>
  )
}

export default CropSettingsHub
