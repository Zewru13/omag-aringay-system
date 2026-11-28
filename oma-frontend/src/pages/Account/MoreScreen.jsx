import { useState } from 'react'
import { ChevronRight, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import AccountIcon from './AccountIcon.jsx'
import AccountPage from './AccountPage.jsx'
import { accountKind, accountNav } from './accountNav.js'

// The More page of a farmer, fisherfolk or organization account: everything that is not one of the four main menu entries
// (forecast, borrowing or officers, the profile, Help), and Log out, which asks first.
const ROW = 'flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2'

export default function MoreScreen() {
  const navigate = useNavigate()
  const auth = useAuth()
  const { user, logout } = auth
  const [askLogout, setAskLogout] = useState(false)
  const isMember = (user?.linked_record?.organization_names?.length || 0) > 0
  const entries = accountNav(accountKind(auth), { isMember }).more

  const logOut = async () => {
    setAskLogout(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <AccountPage title="More" helper="Other pages of your account.">
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        {entries.map((entry) => (
          <li key={entry.key}>
            <Link to={entry.to} className={ROW}>
              <AccountIcon name={entry.icon} size={20} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-[15px] font-medium text-text-primary">{entry.label}</span>
              <ChevronRight size={18} className="shrink-0 text-text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => setAskLogout(true)} className={ROW}>
            <LogOut size={20} className="shrink-0 text-[#A32D2D]" aria-hidden="true" />
            <span className="text-[15px] font-medium text-[#A32D2D]">Log out</span>
          </button>
        </li>
      </ul>

      {askLogout && (
        <ConfirmDialog
          title="Log out"
          message="Are you sure you want to log out?"
          confirmLabel="Log out"
          onConfirm={logOut}
          onCancel={() => setAskLogout(false)}
        />
      )}
    </AccountPage>
  )
}
