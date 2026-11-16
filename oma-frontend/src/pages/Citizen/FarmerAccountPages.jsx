// A farmer account uses the Admin crop pages (inside the same PageLayout / sidebar). Their own profile and help
// reuse the existing citizen-portal components in their embeddable `bare` mode - no second profile/help
// implementation. Same shape as FisherfolkAccountPages.jsx.
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CitizenHelpScreen from './CitizenHelpScreen.jsx'
import { HELP } from '../Account/helpAnswers.js'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'
import { CROP_THEME } from './citizenUI.jsx'

export function FarmerProfilePage() {
  const { user } = useAuth()
  return (
    <PageLayout title="My Profile" subtitle="Your farmer record and account details.">
      <CitizenProfileScreen record={user?.linked_record} recordType="FARMER" bare />
    </PageLayout>
  )
}

export function FarmerHelpPage() {
  return (
    <PageLayout title="Help" subtitle="Questions and answers about your farmer account.">
      <CitizenHelpScreen theme={CROP_THEME} L={HELP.farmer} bare />
    </PageLayout>
  )
}
