// A fisherfolk account uses the Admin Fisheries pages (inside the same PageLayout / sidebar). Their own profile reuses the
// existing citizen-portal component in its embeddable `bare` mode.
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'

export function FisherfolkProfilePage() {
  const { user } = useAuth()
  return (
    <PageLayout title="My Profile" subtitle="Your fisherfolk record and account details.">
      <CitizenProfileScreen record={user?.linked_record} recordType="FISHERFOLK" bare />
    </PageLayout>
  )
}
