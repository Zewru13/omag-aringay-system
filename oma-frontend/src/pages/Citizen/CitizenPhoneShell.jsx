import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { accountIcon } from '../Account/accountIcons.js'
import { accountKind, accountNav, accountTheme, activeNavKey } from '../Account/accountNav.js'
import { FarmerHeader, FarmerTabBar } from './FarmerChrome.jsx'

// The phone layout of a farmer, fisherfolk or organization account: a header (the office name and the notification bell) and the
// five-tab bottom bar around the page, in the account's colour (fisheries blue for a fisherfolk and a fisherfolk organization, crop
// green for a farmer and a farmers' organization). PageLayout renders this instead of the sidebar layout on a phone for those
// accounts; tablets, desktops and every other role keep the sidebar layout.
//
// The tabs are the account's menu (pages/Account/accountNav.js), the same five entries the sidebar shows. The profile, Help, the
// User Manual and Log out are on the More tab, so the header has no menu of its own.

export default function CitizenPhoneShell({ title, action, children }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const auth = useAuth()
  const { user } = auth
  const kind = accountKind(auth)
  const isMember = (user?.linked_record?.organization_names?.length || 0) > 0
  const nav = accountNav(kind, { isMember })
  const theme = accountTheme(kind)

  return (
    <div className="min-h-screen bg-cz-page">
      <FarmerHeader theme={theme} showMenu={false} />

      {/* pb clears the fixed tab bar (60px) plus the device's home-indicator inset. */}
      <main className="px-4 pb-[calc(60px+env(safe-area-inset-bottom)+20px)] pt-4">
        {/* Same as PageLayout: no visible title block here (the page draws its own heading); the title stays for screen readers. */}
        {title && <h1 className="sr-only">{title}</h1>}
        {action && <div className="mb-4 flex justify-end">{action}</div>}
        {children}
      </main>

      <FarmerTabBar
        theme={theme}
        ariaLabel="Main navigation"
        active={activeNavKey(nav, pathname, search)}
        items={nav.main.map((entry) => ({ key: entry.key, icon: accountIcon(entry.icon), label: entry.label, onClick: () => navigate(entry.to) }))}
      />
    </div>
  )
}
