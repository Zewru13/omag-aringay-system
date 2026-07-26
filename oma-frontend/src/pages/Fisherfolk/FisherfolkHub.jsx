import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import FisherfolkPage from './FisherfolkPage.jsx'
import FisherfolkOrganizationsPage from './FisherfolkOrganizationsPage.jsx'

const TABS = [
  { value: 'registry',      label: 'Registry' },
  { value: 'organizations', label: 'Organizations' },
]

function FisherfolkHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  // 'associations' is the pre-rename tab value — old bookmarks/links still
  // using it land on the Organizations tab instead of silently falling
  // through to the registry default.
  const rawTab = searchParams.get('tab') || 'registry'
  const activeTab = rawTab === 'associations' ? 'organizations' : rawTab

  const setTab = (tab) => setSearchParams({ tab }, { replace: true })

  return (
    <PageLayout title="Fisherfolk" subtitle="Manage fisherfolk registry and organizations">
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

      {activeTab === 'registry'      && <FisherfolkPage             asTab />}
      {activeTab === 'organizations' && <FisherfolkOrganizationsPage asTab />}
    </PageLayout>
  )
}

export default FisherfolkHub
