// A farmer account uses the Admin crop pages (inside the same PageLayout / sidebar). Their own profile and help
// reuse the existing citizen-portal components in their embeddable `bare` mode - no second profile/help
// implementation. Same shape as FisherfolkAccountPages.jsx.
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CitizenHelpScreen from './CitizenHelpScreen.jsx'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'
import { CROP_THEME } from './citizenUI.jsx'

// English help for farmer accounts, describing the pages they now use. Same shape as labels.farmerHelp (which
// CitizenHelpScreen reads); kept here as the farmer-specific wording.
// Contact details are still placeholders, exactly as in the original help screen.
const FARMER_HELP_EN = {
  title: 'Help',
  subtitle: 'Answers to common questions about your account and how to use the system.',
  faqHeading: 'FREQUENTLY ASKED QUESTIONS',
  faq: [
    {
      key: 'log-activity',
      q: 'How do I log a crop activity?',
      a: 'Open Crop Monitoring and click the crop you want. In its details, open the activity log and add an entry: choose the activity (for example watering, fertilizing or spraying), the date and any notes, then save. Suggested activities for the crop are shown there too. You can edit an entry you logged.',
    },
    {
      key: 'record-harvest',
      q: 'How do I record a harvest, and why is it sometimes unavailable?',
      a: 'In the crop\'s details, choose Record Harvest. It becomes available once at least half of the crop\'s expected growing time has passed, so a harvest cannot be recorded long before it could reasonably happen.',
    },
    {
      key: 'report-disaster',
      q: 'How do I report a disaster on a crop?',
      a: 'Open Disaster and click Log Disaster, choose the affected crop, then enter the type of disaster and the damage. Afterwards you can view, print or download what you logged, and mark it recovered once the crop is back to normal. You can only log a disaster on a crop you have on record.',
    },
    {
      key: 'yield',
      q: 'What does Forecasting show?',
      a: 'Your estimated harvest compared with what you actually harvested, for each of your harvested crops. Missed activities are shown as possible contributing factors only: they are suggestions, not proven causes.',
    },
    {
      key: 'assistance',
      q: 'How do I confirm assistance I received?',
      a: 'Open Assistance. Items waiting for your confirmation have two actions: Confirm Received, or Report Not Received if you did not get it. The office is told either way.',
    },
    {
      key: 'request-change',
      q: 'How do I request a change to my name or barangay?',
      a: 'Open My Profile, enter the new value and submit the request. Office staff review it before your registration is updated, and it shows as pending until then.',
    },
    {
      key: 'instant-vs-request',
      q: 'What is the difference between instant-edit and request-a-change fields?',
      a: 'Instant-edit fields (photo, contact number) apply as soon as you save. Request-a-change fields (name, barangay) need staff approval before they change in the registry.',
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
  behaviorReadonlyDesc: 'RSBSA number, reference info - cannot be changed',
  logoutCta: 'Log out',
  backToProfile: 'Back to Profile',
}

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
    <PageLayout title="Help" subtitle="How to use your farmer account.">
      <CitizenHelpScreen theme={CROP_THEME} L={FARMER_HELP_EN} bare />
    </PageLayout>
  )
}
