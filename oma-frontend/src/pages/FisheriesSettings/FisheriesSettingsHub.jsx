import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
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

      {activeTab === 'species'    && <SpeciesOptionPage   asTab />}
      {activeTab === 'categories' && <SpeciesCategoryPage asTab />}
      {activeTab === 'feed-types' && <FeedTypePage        asTab />}
      {activeTab === 'diseases'   && <DiseaseSettingsPage asTab />}
    </PageLayout>
  )
}

export default FisheriesSettingsHub
