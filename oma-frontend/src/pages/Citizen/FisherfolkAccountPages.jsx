// A fisherfolk account uses the Admin Fisheries pages (inside the same PageLayout / sidebar). Their own
// profile and help reuse the existing citizen-portal components in their embeddable `bare` mode - no
// second profile/help implementation.
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CitizenHelpScreen from './CitizenHelpScreen.jsx'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'
import { FISH_THEME } from './citizenUI.jsx'

// English help for fisherfolk accounts, describing the Fisheries pages they now use. Same shape as
// labels.fisherfolkHelp (which CitizenHelpScreen reads); kept here because labels.js is the shared
// Tagalog file of the Farmer/Organization portals, which stay unchanged. Contact details are still
// placeholders, exactly as in the original help screen.
const FISHERFOLK_HELP_EN = {
  title: 'Help',
  subtitle: 'Answers to common questions about your account and how to use the system.',
  faqHeading: 'FREQUENTLY ASKED QUESTIONS',
  faq: [
    {
      key: 'start-cycle',
      q: 'How do I start a production cycle?',
      a: 'Open Fisheries Monitoring > Aquaculture and click "Start Production Cycle". Choose the species and culture system, then enter each pond or cage with its dimensions and number of fingerlings. The estimated harvest and expected harvest date are calculated for you.',
    },
    {
      key: 'logs',
      q: 'How do I record feeding and health logs?',
      a: 'In Fisheries Monitoring > Aquaculture, open the row\'s actions menu and choose "View Cycle". Use the Feeding Log and Health Log tabs. Each affected pond or cage gets its own observation; mortality or disease marks that unit for Force Harvest.',
    },
    {
      key: 'harvest',
      q: 'How do I record a harvest?',
      a: 'Click the fishing-net (Harvest) button on the row, or choose "Record Harvest" from its menu. Select the ponds or cages being harvested and enter the actual harvest (kg) for each one. Early or late harvests need a reason.',
    },
    {
      key: 'force-harvest',
      q: 'What is Force Harvest?',
      a: 'When a Health Log records fish mortality or a disease for a pond or cage, that unit can be harvested before the usual waiting period. The Harvest button turns red and the form lists the affected units, with the reason taken from the Health Log.',
    },
    {
      key: 'forecasting',
      q: 'What does Forecasting show?',
      a: 'Your estimated harvest, actual harvest recorded so far, harvest timing (Early, On-Time or Late) and the variance against the estimate. Click a badge to see the details behind it.',
    },
    {
      key: 'disaster-assistance',
      q: 'How do I report a disaster or check assistance?',
      a: 'Open Disaster to see My Logged Disasters. Click "Log Disaster", choose the affected stock (or "Not linked to a stock" for damage such as equipment only), then enter the details and any photos. Logging it sends it to the office automatically. Afterwards you can view, print or download what you logged. Assistance lists the assistance recorded for you; confirm items you received or report ones you did not.',
    },
    {
      key: 'request-change',
      q: 'How do I request a change to my name or barangay?',
      a: 'Open My Profile, enter the new value and submit the request. Office staff review it before your registration is updated.',
    },
  ],
  contactHeading: 'CONTACT OMAG ARINGAY',
  contactPlaceholderNote: 'The details below are placeholders - the official information is not final yet.',
  contactOfficeLabel: 'Office',
  contactOfficeValue: '[Office name - placeholder]',
  contactAddressLabel: 'Address',
  contactAddressValue: '[Full office address - placeholder]',
  contactPhoneLabel: 'Phone',
  contactPhoneValue: '[Phone number - placeholder]',
  contactHoursLabel: 'Office Hours',
  contactHoursValue: '[Office days and hours - placeholder]',
  behaviorsHeading: 'FIELD BEHAVIORS',
  behaviorInstantLabel: 'Instant edit',
  behaviorInstantDesc: 'Photo, contact number - applied immediately',
  behaviorRequestLabel: 'Request-a-change',
  behaviorRequestDesc: 'Name, barangay - needs staff approval',
  behaviorReadonlyLabel: 'Read-only',
  behaviorReadonlyDesc: 'Registration number, reference info - cannot be changed',
  logoutCta: 'Log out',
  backToProfile: 'Back to Profile',
}

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
    <PageLayout title="Help" subtitle="How to use your fisheries account.">
      <CitizenHelpScreen theme={FISH_THEME} L={FISHERFOLK_HELP_EN} bare />
    </PageLayout>
  )
}
