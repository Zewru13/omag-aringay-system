import { lazy } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'

// Addresses the office and a farmer share. A farmer gets their own screen (built on the account kit), the office its own page, so a
// link or a notification opens the right one for whoever follows it. Each page is loaded only when it is the one shown.

const CropMonitoringPage = lazy(() => import('../Monitoring/CropMonitoringPage.jsx'))
const MyCropsPage = lazy(() => import('./MyCropsPage.jsx'))
const CropAssistancePage = lazy(() => import('../AssistanceManagement/CropAssistancePage.jsx'))
const MyAssistancePage = lazy(() => import('./MyAssistancePage.jsx'))
const ForecastingPage = lazy(() => import('../Forecasting/ForecastingPage.jsx'))
const MyForecastPage = lazy(() => import('./MyForecastPage.jsx'))

// /crop-monitoring
export function CropsRoute() {
  const { isFarmer } = useAuth()
  return isFarmer ? <MyCropsPage /> : <CropMonitoringPage />
}

// /crop-assistance (the office and a farmers' organization keep the Crop Assistance page)
export function CropAssistanceRoute() {
  const { isFarmer } = useAuth()
  return isFarmer ? <MyAssistancePage /> : <CropAssistancePage />
}

// /forecasting
export function ForecastRoute() {
  const { isFarmer } = useAuth()
  return isFarmer ? <MyForecastPage /> : <ForecastingPage />
}
