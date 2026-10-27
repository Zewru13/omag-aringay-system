import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import SpeciesOptionPage from './SpeciesOptionPage.jsx'
import SpeciesCategoryPage from './SpeciesCategoryPage.jsx'
import FeedTypePage from './FeedTypePage.jsx'
import DiseaseSettingsPage from './DiseaseSettingsPage.jsx'
import FingerlingSourcePage from './FingerlingSourcePage.jsx'
import AssistanceOptionsTab from '../AssistanceManagement/AssistanceOptionsTab.jsx'

const TABS = [
  { value: 'species',    label: 'Species' },
  { value: 'categories', label: 'Categories' },
  { value: 'feed-types', label: 'Feed Types' },
  { value: 'diseases',   label: 'Diseases' },
  { value: 'fingerling-sources', label: 'Fingerling Sources' },
  { value: 'equipment-types', label: 'Equipment Types' },
  { value: 'fishing-gear', label: 'Fishing Gear' },
  { value: 'units', label: 'Units' },
]

function FisheriesSettingsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'species'

  const setTab = (tab) => setSearchParams({ tab }, { replace: true })

  return (
    <PageLayout
      title="Fisheries Settings"
      subtitle="Configure species options, categories, feed types, diseases, fingerling sources, and the equipment types, fishing gear and units the assistance forms offer"
    >
      <div className="mb-4">
        <PillTabs
          ariaLabel="Settings sections"
          tabs={TABS.map(({ value, label }) => ({ id: value, label }))}
          value={activeTab}
          onChange={setTab}
        />
      </div>

      {activeTab === 'species'    && <SpeciesOptionPage   asTab />}
      {activeTab === 'categories' && <SpeciesCategoryPage asTab />}
      {activeTab === 'feed-types' && <FeedTypePage        asTab />}
      {activeTab === 'diseases'   && <DiseaseSettingsPage asTab />}
      {activeTab === 'fingerling-sources' && <FingerlingSourcePage asTab />}
      {activeTab === 'equipment-types' && <AssistanceOptionsTab domain="fisheries" kind="equipment" title="Equipment Types" singular="Equipment Type" example="Aerator" />}
      {activeTab === 'fishing-gear' && <AssistanceOptionsTab domain="fisheries" kind="gear" title="Fishing Gear" singular="Fishing Gear" example="Gill Net" />}
      {activeTab === 'units' && <AssistanceOptionsTab domain="fisheries" kind="unit" title="Units" singular="Unit" example="kg" />}
    </PageLayout>
  )
}

export default FisheriesSettingsHub
