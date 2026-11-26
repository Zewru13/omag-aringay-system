// A farmer account uses the Admin crop pages (inside the same PageLayout / sidebar). Their own profile reuses the existing
// citizen-portal component in its embeddable `bare` mode. Same shape as FisherfolkAccountPages.jsx.
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'

export function FarmerProfilePage() {
  const { user } = useAuth()
  return (
    <PageLayout title="My Profile" subtitle="Your farmer record and account details.">
      <CitizenProfileScreen record={user?.linked_record} recordType="FARMER" bare />
    </PageLayout>
  )
}
