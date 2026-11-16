import { useAuth } from '../../context/AuthContext.jsx'
import AccountProfilePage from '../Account/AccountProfilePage.jsx'
import { FarmerHelpPage } from './FarmerAccountPages.jsx'
import { FisherfolkHelpPage } from './FisherfolkAccountPages.jsx'
import { OrgHelpPage } from './OrgAccountPages.jsx'

// /my-profile and /my-help are shared by the citizen accounts that use the Admin pages for their own records:
// the organization, farmer or fisherfolk version is chosen from who is signed in (the route guard already admitted only those).
// One profile for every kind of account (pages/Account/AccountProfilePage.jsx).
export function OwnProfilePage() {
  return <AccountProfilePage />
}

export function OwnHelpPage() {
  const { isFarmer, isOrg } = useAuth()
  if (isOrg) return <OrgHelpPage />
  return isFarmer ? <FarmerHelpPage /> : <FisherfolkHelpPage />
}
