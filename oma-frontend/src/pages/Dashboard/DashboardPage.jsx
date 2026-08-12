import PageLayout from '../../components/Layout/PageLayout.jsx'
import StaffDashboard from './StaffDashboard.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

// Rebuilt to the approved staff reference ("New Dashboard base.docx").
//
// The dashboard's own heading is "What needs attention today", drawn inside
// StaffDashboard exactly as the reference does, so PageLayout is used without a
// title here rather than stacking a second "Dashboard" heading above it.
//
// The production analytics that used to sit on this page moved to the
// Production page's Analytics tab — the reference has no analytics block, and
// those endpoints have no other consumer, so they were relocated, not dropped.

export default function DashboardPage() {
  const { user } = useAuth()
  return (
    <PageLayout>
      <StaffDashboard user={user} />
    </PageLayout>
  )
}
