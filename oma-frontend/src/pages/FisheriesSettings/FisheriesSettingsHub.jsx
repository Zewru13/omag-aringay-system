import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import SpeciesOptionPage from './SpeciesOptionPage.jsx'
import SpeciesCategoryPage from './SpeciesCategoryPage.jsx'
import FeedTypePage from './FeedTypePage.jsx'
import DiseaseSettingsPage from './DiseaseSettingsPage.jsx'

const TABS = [
  { value: 'species',    label: 'Species' },
  { value: 'categories', label: 'Categories' },
  { value: 'feed-types', label: 'Feed Types' },
  { value: 'diseases',   label: 'Diseases' },
]

function FisheriesSettingsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'species'

  const setTab = (tab) => setSearchParams({ tab }, { replace: true })

  return (
    <PageLayout
      title="Fisheries Settings"
      subtitle="Configure species options, categories, and activity suggestions"
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
    </PageLayout>
  )
}

export default FisheriesSettingsHub
