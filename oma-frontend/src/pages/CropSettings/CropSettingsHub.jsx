import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import CropOptionPage from '../CropOption/CropOptionPage.jsx'
import CropCategoryPage from '../CropCategory/CropCategoryPage.jsx'
import SeedSourcePage from '../SeedSource/SeedSourcePage.jsx'
import CropVarietyPage from '../CropVariety/CropVarietyPage.jsx'
import CropInputTypePage from './CropInputTypePage.jsx'
import AssistanceOptionsTab from '../AssistanceManagement/AssistanceOptionsTab.jsx'

const TABS = [
  { value: 'options',     label: 'Crop Options' },
  { value: 'categories',  label: 'Categories' },
  { value: 'seedsources', label: 'Seed Sources' },
  { value: 'varieties',   label: 'Varieties' },
  { value: 'input-types', label: 'Input Types' },
  { value: 'equipment-types', label: 'Equipment Types' },
  { value: 'units', label: 'Units' },
]

function CropSettingsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'options'

  const setTab = (tab) => setSearchParams({ tab }, { replace: true })

  return (
    <PageLayout
      title="Crop Settings"
      subtitle="Configure crop options, categories, activity suggestions, and the equipment types and units the assistance forms offer"
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
      {activeTab === 'equipment-types' && <AssistanceOptionsTab domain="crop" kind="equipment" title="Equipment Types" singular="Equipment Type" example="Hand Tractor" />}
      {activeTab === 'units' && <AssistanceOptionsTab domain="crop" kind="unit" title="Units" singular="Unit" example="sack" />}
    </PageLayout>
  )
}

export default CropSettingsHub
