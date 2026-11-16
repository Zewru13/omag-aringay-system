import { lazy } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { accountKind } from './accountNav.js'
import { orgDomain, orgView } from './myOrganization.js'

// /my-organization for an organization account: the address the menu, Home and the notifications already use. ?tab= picks the page
// (see orgView): Members, Equipment (Items or Loans) or Officers; Confirmed for Members now lives on Assistance's Confirm for members tab.
const MyMembersPage = lazy(() => import('./MyMembersPage.jsx'))
const OrganizationDetailPage = lazy(() => import('../Organizations/OrganizationDetailPage.jsx'))

export default function MyOrganizationRoute() {
  const { search } = useLocation()
  const view = orgView(search)
  const domain = orgDomain(accountKind(useAuth()))
  if (view.page === 'assistance-confirm') return <Navigate to={`${domain.assistancePath}?tab=confirm`} replace />
  if (view.page === 'members') return <MyMembersPage />
  // Equipment and Officers keep the organization page until their own pages are built.
  return <OrganizationDetailPage own />
}
