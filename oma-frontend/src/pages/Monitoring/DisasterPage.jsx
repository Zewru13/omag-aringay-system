import { useAuth } from '../../context/AuthContext.jsx'
import AdminDisasterPage from './AdminDisasterPage.jsx'
import FarmerDisasterPage from './FarmerDisasterPage.jsx'
import FisherfolkDisasterPage from './FisherfolkDisasterPage.jsx'

// /disaster: one Disaster module with role-appropriate views - a fisherfolk account sees My Logged Disasters
// (already the Fisheries/Aquaculture context), a farmer account its own crop disasters; Admin/Evaluator see the
// Crop Disaster and Fisheries Disaster views (picked from the sidebar).
export default function DisasterPage() {
  const { isFisherfolk, isFarmer } = useAuth()
  if (isFisherfolk) return <FisherfolkDisasterPage />
  if (isFarmer) return <FarmerDisasterPage />
  return <AdminDisasterPage />
}
