import { useState } from 'react'
import PillTabs from '../../components/UI/PillTabs.jsx'
import ManualBody from './ManualBody.jsx'

const TABS = [
  { id: 'guides', label: 'Screen guides' },
  { id: 'faq', label: 'Quick guide and FAQ' },
]

// The content of every account's User Manual page (the page that used to be called Help): the annotated screen guides, and next to them the account's
// own quick guide and frequently asked questions, which the page passes in as `children`.
export default function UserManualTabs({ children }) {
  const [tab, setTab] = useState('guides')
  return (
    <div className="space-y-4">
      <PillTabs ariaLabel="User Manual sections" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'guides' ? <ManualBody /> : children}
    </div>
  )
}
