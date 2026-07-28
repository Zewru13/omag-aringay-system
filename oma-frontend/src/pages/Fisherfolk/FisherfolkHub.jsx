import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import FisherfolkPage from './FisherfolkPage.jsx'
import FisherfolkOrganizationsPage from './FisherfolkOrganizationsPage.jsx'

// Batch A: in-page Registry/Organizations tab switcher removed — see
// FarmersHub.jsx's comment for the rationale (identical here).
function FisherfolkHub() {
  const [searchParams] = useSearchParams()
  // 'associations' is the pre-rename tab value — old bookmarks/links still
  // using it land on the Organizations tab instead of silently falling
  // through to the registry default.
  const rawTab = searchParams.get('tab') || 'registry'
  const activeTab = rawTab === 'associations' ? 'organizations' : rawTab

  return (
    <PageLayout title="Fisherfolk" subtitle="Manage fisherfolk registry and organizations">
      {activeTab === 'registry'      && <FisherfolkPage             asTab />}
      {activeTab === 'organizations' && <FisherfolkOrganizationsPage asTab />}
    </PageLayout>
  )
}

export default FisherfolkHub
