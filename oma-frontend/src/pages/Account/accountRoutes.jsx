import { lazy } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'

// Addresses the office shares with a farmer or a fisherfolk. The farmer or fisherfolk gets their own screen (built on the account kit), the office its own page, so a
// link or a notification opens the right one for whoever follows it. Each page is loaded only when it is the one shown.

const CropMonitoringPage = lazy(() => import('../Monitoring/CropMonitoringPage.jsx'))
const MyCropsPage = lazy(() => import('./MyCropsPage.jsx'))
const CropAssistancePage = lazy(() => import('../AssistanceManagement/CropAssistancePage.jsx'))
const MyAssistancePage = lazy(() => import('./MyAssistancePage.jsx'))
const MyOrgAssistancePage = lazy(() => import('./MyOrgAssistancePage.jsx'))
const FisheriesAssistancePage = lazy(() => import('../AssistanceManagement/FisheriesAssistancePage.jsx'))
const ForecastingPage = lazy(() => import('../Forecasting/ForecastingPage.jsx'))
const MyForecastPage = lazy(() => import('./MyForecastPage.jsx'))
const FisheriesMonitoringPage = lazy(() => import('../Monitoring/FisheriesMonitoringPage.jsx'))
const MyCyclesPage = lazy(() => import('./MyCyclesPage.jsx'))
const FisheriesForecastingTab = lazy(() => import('../Monitoring/FisheriesForecastingTab.jsx'))
const MyFisheriesForecastPage = lazy(() => import('./MyFisheriesForecastPage.jsx'))

// /crop-monitoring
export function CropsRoute() {
  const { isFarmer } = useAuth()
  return isFarmer ? <MyCropsPage /> : <CropMonitoringPage />
}

// /crop-assistance: a farmer and a farmers' organization each get their own page; the office keeps Crop Assistance
export function CropAssistanceRoute() {
  const { isFarmer, isOrg } = useAuth()
  if (isOrg) return <MyOrgAssistancePage kind="orgFarm" />
  return isFarmer ? <MyAssistancePage domain="crop" /> : <CropAssistancePage />
}

// /forecasting
export function ForecastRoute() {
  const { isFarmer } = useAuth()
  return isFarmer ? <MyForecastPage /> : <ForecastingPage />
}

// /fisheries-monitoring
export function CyclesRoute() {
  const { isFisherfolk } = useAuth()
  return isFisherfolk ? <MyCyclesPage /> : <FisheriesMonitoringPage />
}

// /fisheries-assistance: a fisherfolk and a fisherfolk organization each get their own page; the office keeps Fisheries Assistance
export function FisheriesAssistanceRoute() {
  const { isFisherfolk, isOrg } = useAuth()
  if (isOrg) return <MyOrgAssistancePage kind="orgFish" />
  return isFisherfolk ? <MyAssistancePage domain="fisheries" /> : <FisheriesAssistancePage />
}

// /fisheries-forecasting
export function FisheriesForecastRoute() {
  const { isFisherfolk } = useAuth()
  return isFisherfolk ? <MyFisheriesForecastPage /> : <FisheriesForecastingTab />
}
