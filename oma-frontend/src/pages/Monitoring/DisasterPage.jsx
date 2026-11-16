import { useAuth } from '../../context/AuthContext.jsx'
import AdminDisasterPage from './AdminDisasterPage.jsx'
import MyDisastersPage from '../Account/MyDisastersPage.jsx'
import MyFisheriesDisastersPage from '../Account/MyFisheriesDisastersPage.jsx'

// /disaster: one Disaster module with role-appropriate views - a fisherfolk and a farmer account each get their own Disasters page
// (the reports first, Report a disaster as a window; pages/Account); Admin/Evaluator see the Crop Disaster and Fisheries Disaster
// views (picked from the sidebar).
export default function DisasterPage() {
  const { isFisherfolk, isFarmer } = useAuth()
  if (isFisherfolk) return <MyFisheriesDisastersPage />
  if (isFarmer) return <MyDisastersPage />
  return <AdminDisasterPage />
}
