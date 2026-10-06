import { AlertTriangle, Building2, HandHeart, Home, Sprout, TrendingUp, Waves } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { FarmerHeader, FarmerTabBar } from './FarmerChrome.jsx'

// The phone layout of a citizen account that uses the Admin pages for its own records: the citizen chrome
// (header with avatar menu, five-tab bottom bar) around the existing pages, in the account's colour (fisheries
// blue for a fisherfolk, crop green for a farmer). PageLayout renders this instead of the admin sidebar layout
// on a phone for those two accounts; tablets, desktops and every other role keep the admin layout.
//
// English on purpose: the pages inside each tab are English, so the chrome matches them.

const MENU = { viewProfile: 'My Profile', help: 'Help', logout: 'Log out' }

const TABS_BY_ROLE = {
  fisherfolk: [
    { key: 'home', path: '/my-account', icon: Home, label: 'Home' },
    { key: 'monitoring', path: '/fisheries-monitoring', icon: Waves, label: 'Monitoring' },
    { key: 'disaster', path: '/disaster', icon: AlertTriangle, label: 'Disaster' },
    { key: 'forecasting', path: '/fisheries-forecasting', icon: TrendingUp, label: 'Forecasting' },
    { key: 'assistance', path: '/fisheries-assistance', icon: HandHeart, label: 'Assistance' },
  ],
  farmer: [
    { key: 'home', path: '/my-account', icon: Home, label: 'Home' },
    { key: 'monitoring', path: '/crop-monitoring', icon: Sprout, label: 'Monitoring' },
    { key: 'disaster', path: '/disaster', icon: AlertTriangle, label: 'Disaster' },
    { key: 'forecasting', path: '/forecasting', icon: TrendingUp, label: 'Forecasting' },
    { key: 'assistance', path: '/crop-assistance', icon: HandHeart, label: 'Assistance' },
  ],
}
// An organization account: Home, its organization and the assistance page of its own domain.
TABS_BY_ROLE.orgFarm = [
  { key: 'home', path: '/my-account', icon: Home, label: 'Home' },
  { key: 'organization', path: '/my-organization', icon: Building2, label: 'Organization' },
  { key: 'assistance', path: '/crop-assistance', icon: HandHeart, label: 'Assistance' },
]
TABS_BY_ROLE.orgFish = [
  { key: 'home', path: '/my-account', icon: Home, label: 'Home' },
  { key: 'organization', path: '/my-organization', icon: Building2, label: 'Organization' },
  { key: 'assistance', path: '/fisheries-assistance', icon: HandHeart, label: 'Assistance' },
]

const THEME_BY_ROLE = { fisherfolk: 'fish', farmer: 'crop', orgFarm: 'crop', orgFish: 'fish' }

// The tab a path belongs to; the profile and help pages (reached from the avatar menu) light none.
function activeTabKey(tabs, pathname) {
  const hit = tabs.find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`))
  return hit ? hit.key : null
}

export default function CitizenPhoneShell({ title, subtitle, action, children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, logout, isFarmer, isOrg, orgType } = useAuth()
  const role = isFarmer ? 'farmer' : isOrg ? (orgType === 'FISHERFOLK_ORG' ? 'orgFish' : 'orgFarm') : 'fisherfolk'
  const TABS = TABS_BY_ROLE[role]

  const initials = (user?.full_name || user?.linked_record?.label || '')
    .split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'F'

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-cz-page">
      <FarmerHeader
        theme={THEME_BY_ROLE[role]}
        menuLabels={MENU}
        initials={initials}
        onProfile={() => navigate('/my-profile')}
        onHelp={() => navigate('/my-help')}
        onLogout={handleLogout}
      />

      {/* pb clears the fixed tab bar (60px) plus the device's home-indicator inset. */}
      <main className="px-4 pb-[calc(60px+env(safe-area-inset-bottom)+20px)] pt-4">
        {(title || action) && (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              {title && <h1 className="font-display text-[20px] font-semibold leading-tight tracking-tight text-cz-text">{title}</h1>}
              {subtitle && <p className="mt-0.5 text-[13px] text-cz-text-2">{subtitle}</p>}
            </div>
            {action && <div className="ml-auto flex-shrink-0">{action}</div>}
          </div>
        )}
        {children}
      </main>

      <FarmerTabBar
        theme={THEME_BY_ROLE[role]}
        ariaLabel="Main navigation"
        active={activeTabKey(TABS, pathname)}
        items={TABS.map((t) => ({ key: t.key, icon: t.icon, label: t.label, onClick: () => navigate(t.path) }))}
      />
    </div>
  )
}
