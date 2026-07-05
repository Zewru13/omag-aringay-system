import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import FarmersPage from './FarmersPage.jsx'
import AssociationsPage from '../Associations/AssociationsPage.jsx'

const TABS = [
  { value: 'registry',      label: 'Registry' },
  { value: 'associations',  label: 'Associations' },
]

function FarmersHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'registry'

  const setTab = (tab) => setSearchParams({ tab }, { replace: true })

  return (
    <PageLayout title="Farmers" subtitle="Manage farmer registry and associations">
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

      {activeTab === 'registry'     && <FarmersPage      asTab />}
      {activeTab === 'associations' && <AssociationsPage  asTab />}
    </PageLayout>
  )
}

export default FarmersHub
