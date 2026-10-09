import { useAuth } from '../../context/AuthContext.jsx'
import { FarmerHelpPage, FarmerProfilePage } from './FarmerAccountPages.jsx'
import { FisherfolkHelpPage, FisherfolkProfilePage } from './FisherfolkAccountPages.jsx'
import { OrgHelpPage, OrgProfilePage } from './OrgAccountPages.jsx'

// /my-profile and /my-help are shared by the citizen accounts that use the Admin pages for their own records:
// the organization, farmer or fisherfolk version is chosen from who is signed in (the route guard already admitted only those).
export function OwnProfilePage() {
  const { isFarmer, isOrg } = useAuth()
  if (isOrg) return <OrgProfilePage />
  return isFarmer ? <FarmerProfilePage /> : <FisherfolkProfilePage />
}

export function OwnHelpPage() {
  const { isFarmer, isOrg } = useAuth()
  if (isOrg) return <OrgHelpPage />
  return isFarmer ? <FarmerHelpPage /> : <FisherfolkHelpPage />
}
