// A fisherfolk account uses the Admin Fisheries pages (inside the same PageLayout / sidebar). Their own
// profile and help reuse the existing citizen-portal components in their embeddable `bare` mode - no
// second profile/help implementation.
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CitizenHelpScreen from './CitizenHelpScreen.jsx'
import { HELP } from '../Account/helpAnswers.js'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'
import { FISH_THEME } from './citizenUI.jsx'

export function FisherfolkProfilePage() {
  const { user } = useAuth()
  return (
    <PageLayout title="My Profile" subtitle="Your fisherfolk record and account details.">
      <CitizenProfileScreen record={user?.linked_record} recordType="FISHERFOLK" bare />
    </PageLayout>
  )
}

export function FisherfolkHelpPage() {
  return (
    <PageLayout title="Help" subtitle="Questions and answers about your fisheries account.">
      <CitizenHelpScreen theme={FISH_THEME} L={HELP.fisherfolk} bare />
    </PageLayout>
  )
}
