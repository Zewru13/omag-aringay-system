import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import CropOptionPage from '../CropOption/CropOptionPage.jsx'
import CropCategoryPage from '../CropCategory/CropCategoryPage.jsx'
import SeedSourcePage from '../SeedSource/SeedSourcePage.jsx'
import CropVarietyPage from '../CropVariety/CropVarietyPage.jsx'
import CropInputTypePage from './CropInputTypePage.jsx'

const TABS = [
  { value: 'options',     label: 'Crop Options' },
  { value: 'categories',  label: 'Categories' },
  { value: 'seedsources', label: 'Seed Sources' },
  { value: 'varieties',   label: 'Varieties' },
  { value: 'input-types', label: 'Input Types' },
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
      <div className="mb-4">
        <PillTabs
          ariaLabel="Settings sections"
          tabs={TABS.map(({ value, label }) => ({ id: value, label }))}
          value={activeTab}
          onChange={setTab}
        />
      </div>

      {activeTab === 'options'     && <CropOptionPage     asTab />}
      {activeTab === 'categories'  && <CropCategoryPage   asTab />}
      {activeTab === 'seedsources' && <SeedSourcePage     asTab />}
      {activeTab === 'varieties'   && <CropVarietyPage    asTab />}
      {activeTab === 'input-types' && <CropInputTypePage  asTab />}
    </PageLayout>
  )
}

export default CropSettingsHub
