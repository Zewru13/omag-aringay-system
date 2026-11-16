import { lazy } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { accountKind } from './accountNav.js'
import { orgDomain, orgView } from './myOrganization.js'

// /my-organization for an organization account: the address the menu, Home and the notifications already use. ?tab= picks the page
// (see orgView): Members, Equipment (Items or Loans) or Officers; Confirmed for Members now lives on Assistance's Confirm for members tab.
const MyMembersPage = lazy(() => import('./MyMembersPage.jsx'))
const MyOrgEquipmentPage = lazy(() => import('./MyOrgEquipmentPage.jsx'))
const MyOfficersPage = lazy(() => import('./MyOfficersPage.jsx'))

export default function MyOrganizationRoute() {
  const { search } = useLocation()
  const view = orgView(search)
  const domain = orgDomain(accountKind(useAuth()))
  if (view.page === 'assistance-confirm') return <Navigate to={`${domain.assistancePath}?tab=confirm`} replace />
  if (view.page === 'members') return <MyMembersPage />
  // The address decides the tab, so a link (the bell's ?tab=borrowed) and the tab row always agree.
  if (view.page === 'equipment') return <MyOrgEquipmentPage tab={view.tab} />
  return <MyOfficersPage />
}
