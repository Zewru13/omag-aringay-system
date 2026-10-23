import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import Toast from "./components/UI/Toast.jsx";
import InactivityMonitor from "./components/InactivityMonitor.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import AuditLogPage from "./pages/Admin/AuditLogPage.jsx";
import OrganizationDetailPage from "./pages/Organizations/OrganizationDetailPage.jsx";
import MyEquipmentPage from "./pages/Equipment/MyEquipmentPage.jsx";
import DashboardPage from "./pages/Dashboard/DashboardPage.jsx";
import FarmerDetailPage from "./pages/Farmers/FarmerDetailPage.jsx";
import AssistanceAgenciesPage from "./pages/AssistanceManagement/AssistanceAgenciesPage.jsx";
import ClassificationSettingsPage from "./pages/Farmers/ClassificationSettingsPage.jsx";
import FarmersHub from "./pages/Farmers/FarmersHub.jsx";
import FisherfolkDetailPage from "./pages/Fisheries/FisherfolkDetailPage.jsx";
import FisherfolkHub from "./pages/Fisherfolk/FisherfolkHub.jsx";
import FisheriesSettingsHub from "./pages/FisheriesSettings/FisheriesSettingsHub.jsx";
import LoginPage from "./pages/Login/LoginPage.jsx";
import ForceChangePasswordPage from "./pages/Auth/ForceChangePasswordPage.jsx";
import VerifyEmailPage from "./pages/Auth/VerifyEmailPage.jsx";
import CropMonitoringPage from "./pages/Monitoring/CropMonitoringPage.jsx";
import FisheriesMonitoringPage from "./pages/Monitoring/FisheriesMonitoringPage.jsx";
import FisheriesForecastingTab from "./pages/Monitoring/FisheriesForecastingTab.jsx";
import ProductionPage from "./pages/Production/ProductionPage.jsx";
import ProfilePage from "./pages/Profile/ProfilePage.jsx";
import ReportsPage from "./pages/Reports/ReportsPage.jsx";
import ForecastingPage from "./pages/Forecasting/ForecastingPage.jsx";
import CropInformationPage from "./pages/CropInformation/CropInformationPage.jsx";
import AddCropMonitoringPage from "./pages/Monitoring/AddCropMonitoringPage.jsx";
import AddFarmParcelsPage from "./pages/CropInformation/AddFarmParcelsPage.jsx";
import CropSettingsHub from "./pages/CropSettings/CropSettingsHub.jsx";
import ActivitySettingsHub from "./pages/ActivitySettings/ActivitySettingsHub.jsx";
import UserManagementPage from "./pages/Users/UserManagementPage.jsx";
import HelpPage from "./pages/Help/HelpPage.jsx";
import CropAssistancePage from "./pages/AssistanceManagement/CropAssistancePage.jsx";
import FisheriesAssistancePage from "./pages/AssistanceManagement/FisheriesAssistancePage.jsx";
import CitizenHomePage from "./pages/Citizen/CitizenHomePage.jsx";
import { OwnHelpPage, OwnProfilePage } from "./pages/Citizen/OwnAccountPages.jsx";
import DisasterPage from "./pages/Monitoring/DisasterPage.jsx";

function HomeRedirect() {
  const { isAuthenticated, isCitizen, isFisherfolk, isLoading } = useAuth();
  // Wait for the stored session to be restored: deciding earlier sent a signed-in user (e.g. someone opening
  // the site's home-screen shortcut) to the login page.
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Fisherfolk accounts land on their Home: a phone shows the phone Home, a larger screen is sent on to
  // Fisheries Monitoring (reused Admin page, scoped to their own records) by CitizenHomePage.
  if (isFisherfolk) return <Navigate to="/my-account" replace />;
  return <Navigate to={isCitizen ? "/my-account" : "/dashboard"} replace />;
}

// Preserves :type/:id when redirecting the old /associations/:type/:id path
// (Batch 1's Association -> Organization rename) to its new location.
function LegacyOrganizationDetailRedirect() {
  const { type, id } = useParams();
  return <Navigate to={`/organizations/${type}/${id}`} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <InactivityMonitor>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route
            path="/change-password"
            element={
              // ADMIN/EVALUATOR accounts start must_change_password=True
              // (UserCreateView), and CITIZEN accounts (Farmer/Fisherfolk/
              // Organization) do too as of their first "Set Up Account"
              // activation (SetCitizenPasswordView) — ProtectedRoute
              // redirects any of them here on their first authenticated
              // request. See ProtectedRoute's own comment for why this
              // never re-fires after that first login.
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR", "CITIZEN"]}>
                <ForceChangePasswordPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          {/* Batch 10: minimal self-service landing page for CITIZEN accounts. */}
          <Route
            path="/my-account"
            element={
              <ProtectedRoute allowedRoles={["CITIZEN"]}>
                <CitizenHomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          {/* Fisherfolk and farmer accounts: own profile and help inside the Admin-style layout. */}
          <Route
            path="/my-profile"
            element={
              <ProtectedRoute allowedRoles={[]} allowFisherfolk allowFarmer allowOrg={["FARMERS_ORG", "FISHERFOLK_ORG"]}>
                <OwnProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-help"
            element={
              <ProtectedRoute allowedRoles={[]} allowFisherfolk allowFarmer allowOrg={["FARMERS_ORG", "FISHERFOLK_ORG"]}>
                <OwnHelpPage />
              </ProtectedRoute>
            }
          />
          {/* Disaster: one module, role-appropriate views - fisherfolk accounts get My Logged Disasters
              (Log Disaster = submitted to Admin), Admin/Evaluator get Farmer Disaster + Fisheries Disaster.
              The old fisherfolk /disaster/reports page was folded into it. */}
          <Route
            path="/disaster"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]} allowFisherfolk allowFarmer>
                <DisasterPage />
              </ProtectedRoute>
            }
          />
          <Route path="/disaster/reports" element={<Navigate to="/disaster" replace />} />

          {/* Farmers hub — tabs: Registry + Organizations */}
          <Route
            path="/farmers"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <FarmersHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmers/:id"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <FarmerDetailPage />
              </ProtectedRoute>
            }
          />
          {/* Old association routes redirect to Farmers hub (pre-existing legacy) */}
          <Route path="/associations" element={<Navigate to="/farmers?tab=organizations" replace />} />
          <Route path="/associations/farmers" element={<Navigate to="/farmers?tab=organizations" replace />} />
          {/* Batch 1: Association -> Organization rename. /associations/:type/:id
              preserves params instead of dropping them. */}
          <Route path="/associations/:type/:id" element={<LegacyOrganizationDetailRedirect />} />

          {/* Farmer and fisherfolk accounts: borrow equipment of the organizations they belong to. */}
          <Route
            path="/my-equipment"
            element={
              <ProtectedRoute allowedRoles={[]} allowFisherfolk allowFarmer>
                <MyEquipmentPage />
              </ProtectedRoute>
            }
          />

          {/* Organization accounts: their own organization (members, equipment, officers). */}
          <Route
            path="/my-organization"
            element={
              <ProtectedRoute allowedRoles={[]} allowOrg={["FARMERS_ORG", "FISHERFOLK_ORG"]}>
                <OrganizationDetailPage own />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations/:type/:id"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <OrganizationDetailPage />
              </ProtectedRoute>
            }
          />
          {/* Legacy /fisheries redirects to /fisherfolk hub */}
          <Route path="/fisheries" element={<Navigate to="/fisherfolk" replace />} />
          <Route
            path="/fisheries/:id"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <FisherfolkDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fisherfolk"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <FisherfolkHub />
              </ProtectedRoute>
            }
          />
          {/* Fisheries Records was consolidated into the unified Fisheries Monitoring page */}
          <Route path="/fisheries-records" element={<Navigate to="/fisheries-monitoring?tab=stocking" replace />} />
          {/* The manual Add Stocking page is gone: stocking is created by Start Production Cycle. */}
          <Route path="/fisheries-monitoring/add" element={<Navigate to="/fisheries-monitoring?tab=stocking" replace />} />
          <Route
            path="/fisheries-settings"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <FisheriesSettingsHub />
              </ProtectedRoute>
            }
          />
          {/* /monitoring redirects to /crop-monitoring for backwards compat */}
          <Route path="/monitoring" element={<Navigate to="/crop-monitoring" replace />} />
          <Route
            path="/crop-monitoring"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]} allowFarmer>
                <CropMonitoringPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fisheries-monitoring"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]} allowFisherfolk>
                <FisheriesMonitoringPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/forecasting"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]} allowFarmer>
                <ForecastingPage />
              </ProtectedRoute>
            }
          />
          {/* Fisheries Forecasting — moved out of the /fisheries-monitoring tab bar
              (Batch C) into its own destination, same component, mounted standalone. */}
          <Route
            path="/fisheries-forecasting"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]} allowFisherfolk>
                <FisheriesForecastingTab />
              </ProtectedRoute>
            }
          />
          {/* Assistance Management — Crop Assistance (new) and Fisheries Assistance
              (relocated out of the /fisheries-monitoring "Assistance" tab), same
              two-domain-sibling-routes pattern as Forecasting (Batch 5). */}
          <Route
            path="/crop-assistance"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]} allowFarmer allowOrg={["FARMERS_ORG"]}>
                <CropAssistancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fisheries-assistance"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]} allowFisherfolk allowOrg={["FISHERFOLK_ORG"]}>
                <FisheriesAssistancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/production"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <ProductionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />

          {/* Crop records (renamed from /crop-information) */}
          <Route
            path="/crop-records"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <CropInformationPage />
              </ProtectedRoute>
            }
          />
          {/* Full-screen bulk-entry page — was a floating modal, moved to its
              own route so the table gets the full viewport instead of a
              max-w-6xl dialog box. */}
          <Route
            path="/crop-records/add"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AddCropMonitoringPage />
              </ProtectedRoute>
            }
          />
          {/* Add several farm parcels (a table, one row per parcel) to a farmer chosen on the page or by ?farmer=<id> */}
          <Route
            path="/crop-records/add-parcels"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AddFarmParcelsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/crop-information" element={<Navigate to="/crop-records" replace />} />

          {/* Crop settings hub — tabs: Options + Categories (admin only) */}
          <Route
            path="/crop-settings"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <CropSettingsHub />
              </ProtectedRoute>
            }
          />
          <Route path="/crop-options" element={<Navigate to="/crop-settings?tab=options" replace />} />
          <Route path="/crop-categories" element={<Navigate to="/crop-settings?tab=categories" replace />} />

          {/* Assistance settings: the source agencies offered in the assistance forms (admin only) */}
          <Route
            path="/assistance-settings"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <AssistanceAgenciesPage />
              </ProtectedRoute>
            }
          />

          {/* Classification settings: the parcel classifications offered in the farm parcel forms (admin only) */}
          <Route
            path="/classification-settings"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <ClassificationSettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Activity settings hub — tabs: Crop Activities + Fisheries Activities (admin only) */}
          <Route
            path="/activity-settings"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <ActivitySettingsHub />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <UserManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <UserManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit-log"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <AuditLogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit-log"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <AuditLogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/help"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <HelpPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </InactivityMonitor>
      <Toast />
    </BrowserRouter>
  );
}

export default App;

