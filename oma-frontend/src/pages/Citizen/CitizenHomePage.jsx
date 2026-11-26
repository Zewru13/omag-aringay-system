import { LogOut } from 'lucide-react'
import logo from '../../assets/LOGO OMAg-small.png'
import { useAuth } from '../../context/AuthContext.jsx'
import AccountHome from '../Account/AccountHome.jsx'
import { accountKind } from '../Account/accountNav.js'
import { labels } from './labels.js'

// The landing page of a farmer, fisherfolk or organization account: Home (see pages/Account/AccountHome.jsx), one screen for all of
// them. What is left here is only the fallback for an account with no linked record.

const RECORD_TYPE_LABELS_LOWER = labels.home.recordTypeLabels

export default function CitizenHomePage() {
  const auth = useAuth()
  const { user, logout } = auth
  const record = user?.linked_record
  const recordType = user?.linked_record_type

  // The same Home for every kind of account: what needs the person today, what is active, a short summary.
  if (accountKind(auth) && record) return <AccountHome />

  // Fallback only: a CITIZEN whose account has no linked record at all, and
  // any role that somehow reaches this route. Kept deliberately plain —
  // there is no record to theme it against.

  return (
    <div className="min-h-screen bg-cz-page">
      <header className="flex items-center justify-between border-b-[0.5px] border-cz-border bg-cz-surface px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="OMAg Aringay seal" className="h-12 w-12 shrink-0 rounded-md object-contain ring-1 ring-cz-border" />
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg border-[0.5px] border-cz-border-strong px-3 py-1.5 text-cz-text-2 transition-colors hover:bg-cz-page"
        >
          <LogOut size={14} /> <span className="text-[13px] font-medium">{labels.header.logOut}</span>
        </button>
      </header>

      <main className="mx-auto w-full px-4 py-8 sm:max-w-[720px] sm:px-6 lg:max-w-[1100px]">
        <h1 className="text-[20px] font-semibold text-cz-text">
          {labels.home.greeting(record?.label || user?.full_name)}
        </h1>
        <p className="mt-1 text-[13px] text-cz-text-2">
          {labels.home.subtitle(RECORD_TYPE_LABELS_LOWER[recordType] || 'record')}
        </p>

        <div className="mt-6 rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-6">
          <p className="text-[13px] italic text-cz-text-muted">{labels.home.notLinked}</p>
        </div>
      </main>
    </div>
  )
}
