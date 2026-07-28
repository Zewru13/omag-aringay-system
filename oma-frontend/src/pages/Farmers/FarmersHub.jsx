import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import FarmersPage from './FarmersPage.jsx'
import OrganizationsPage from '../Organizations/OrganizationsPage.jsx'

// Batch A: the in-page Registry/Organizations tab switcher that used to live
// here was removed — it was a second way to reach the exact same
// ?tab=organizations destination the Sidebar's "Organization Management"
// group already links to directly. Navigation between the two now happens
// exclusively through the sidebar; this component still reads ?tab= so
// those sidebar links (and any existing bookmarks) keep resolving correctly.
function FarmersHub() {
  const [searchParams] = useSearchParams()
  // 'associations' is the pre-rename tab value — old bookmarks/links still
  // using it land on the Organizations tab instead of silently falling
  // through to the registry default.
  const rawTab = searchParams.get('tab') || 'registry'
  const activeTab = rawTab === 'associations' ? 'organizations' : rawTab

  return (
    <PageLayout title="Farmers" subtitle="Manage farmer registry and organizations">
      {activeTab === 'registry'      && <FarmersPage       asTab />}
      {activeTab === 'organizations' && <OrganizationsPage asTab />}
    </PageLayout>
  )
}

export default FarmersHub
