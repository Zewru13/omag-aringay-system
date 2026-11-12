import PageLayout from '../../components/Layout/PageLayout.jsx'
import ManualBody from './ManualBody.jsx'

// The User Manual of every kind of account (/manual): the annotated screen guides for the account that is signed in, and nothing else.
// The quick guide and the frequently asked questions are a different page, Help (/help for staff, /my-help for the other accounts).
export default function ManualPage() {
  return (
    <PageLayout title="User Manual" subtitle="A picture of each screen with every button and field explained">
      <ManualBody />
    </PageLayout>
  )
}
