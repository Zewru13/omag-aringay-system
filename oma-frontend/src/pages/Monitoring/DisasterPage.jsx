import { useAuth } from '../../context/AuthContext.jsx'
import AdminDisasterPage from './AdminDisasterPage.jsx'
import FisherfolkDisasterPage from './FisherfolkDisasterPage.jsx'

// /disaster: one Disaster module with role-appropriate views - a fisherfolk account sees My Logged Disasters
// (already the Fisheries/Aquaculture context); Admin/Evaluator see Farmer Disaster and Fisheries Disaster.
export default function DisasterPage() {
  const { isFisherfolk } = useAuth()
  return isFisherfolk ? <FisherfolkDisasterPage /> : <AdminDisasterPage />
}
