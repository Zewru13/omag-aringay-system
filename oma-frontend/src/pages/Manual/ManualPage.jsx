import PageLayout from '../../components/Layout/PageLayout.jsx'
import ManualBody from './ManualBody.jsx'

// The User Manual of every kind of account (/manual), the one help page: the annotated screen guides for the account that is signed in,
// the common questions and About This System. /help and /my-help come here.
export default function ManualPage() {
  return (
    <PageLayout title="User Manual" subtitle="Screen guides, common questions and information about the system">
      <ManualBody />
    </PageLayout>
  )
}
