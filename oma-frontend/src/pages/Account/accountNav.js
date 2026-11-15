// The menu of a farmer, fisherfolk or organization account: five entries, the same names in the same order on the phone tab bar and on
// the computer sidebar (both read this file, so they cannot disagree). The fifth entry, More, holds the rest. No screen and no network
// here, so the menu can be tested on its own. `icon` is a name; AccountIcon.jsx draws it.

// Which account this is, from the flags of AuthContext. Staff (Admin, Focal Person) have no account menu: null.
export function accountKind({ isFarmer, isFisherfolk, isOrg, orgType } = {}) {
  if (isFarmer) return 'farmer'
  if (isFisherfolk) return 'fisherfolk'
  if (isOrg) return orgType === 'FISHERFOLK_ORG' ? 'orgFish' : 'orgFarm'
  return null
}

// Crop green for a farmer and a farmers' organization, fisheries blue for a fisherfolk and a fisherfolk organization.
export const accountTheme = (kind) => (kind === 'fisherfolk' || kind === 'orgFish' ? 'fish' : 'crop')

const HOME = { key: 'home', to: '/my-account', label: 'Home', icon: 'home' }
const MORE = { key: 'more', to: '/more', label: 'More', icon: 'more' }
const PROFILE = { key: 'profile', to: '/my-profile', label: 'My profile', icon: 'profile' }
const MANUAL = { key: 'manual', to: '/manual', label: 'User Manual', icon: 'manual' }
const BORROW = { key: 'borrow', to: '/my-equipment', label: 'Borrow equipment', icon: 'borrow' }

// A farmer or fisherfolk who belongs to an organization can also borrow its equipment (`isMember`).
function personNav({ records, assistance, forecast }, isMember) {
  return {
    main: [HOME, records, { key: 'assistance', to: assistance, label: 'Assistance', icon: 'assistance' }, { key: 'disasters', to: '/disaster', label: 'Disasters', icon: 'disaster' }, MORE],
    more: [{ key: 'forecast', to: forecast, label: 'Forecast', icon: 'forecast' }, ...(isMember ? [BORROW] : []), PROFILE, MANUAL],
  }
}

function orgNav(assistance) {
  return {
    main: [
      HOME,
      { key: 'members', to: '/my-organization', label: 'Members', icon: 'members' },
      { key: 'assistance', to: assistance, label: 'Assistance', icon: 'assistance' },
      { key: 'equipment', to: '/my-organization?tab=equipment', label: 'Equipment', icon: 'equipment' },
      MORE,
    ],
    more: [{ key: 'officers', to: '/my-organization?tab=officers', label: 'Officers', icon: 'officers' }, { ...PROFILE, label: 'Organization profile' }, MANUAL],
  }
}

export function accountNav(kind, { isMember = false } = {}) {
  if (kind === 'farmer') {
    return personNav({ records: { key: 'crops', to: '/crop-monitoring', label: 'Crops', icon: 'crop' }, assistance: '/crop-assistance', forecast: '/forecasting' }, isMember)
  }
  if (kind === 'fisherfolk') {
    return personNav({ records: { key: 'cycles', to: '/fisheries-monitoring', label: 'Cycles', icon: 'cycle' }, assistance: '/fisheries-assistance', forecast: '/fisheries-forecasting' }, isMember)
  }
  if (kind === 'orgFish') return orgNav('/fisheries-assistance')
  if (kind === 'orgFarm') return orgNav('/crop-assistance')
  return { main: [], more: [] }
}

// The organization's page still holds several views behind ?tab=: which menu entry each one belongs to.
const ORG_TAB_KEY = { equipment: 'equipment', borrowed: 'equipment', 'borrowed-history': 'equipment', officers: 'more' }

const pathOf = (to) => to.split('?')[0]
const under = (pathname, path) => pathname === path || pathname.startsWith(`${path}/`)

// The main entry a location belongs to (a page listed under More lights More); null when it is outside the menu.
export function activeNavKey(nav, pathname, search = '') {
  if (pathname === '/my-organization' && nav.main.some((e) => e.key === 'members')) {
    return ORG_TAB_KEY[new URLSearchParams(search).get('tab')] || 'members'
  }
  const main = nav.main.find((e) => under(pathname, pathOf(e.to)))
  if (main) return main.key
  return nav.more.some((e) => under(pathname, pathOf(e.to))) ? 'more' : null
}
