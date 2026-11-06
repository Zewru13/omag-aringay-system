import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import Toast from "./components/UI/Toast.jsx";
import InactivityMonitor from "./components/InactivityMonitor.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import AutoLabels from "./components/UI/AutoLabels.jsx";
import LoginPage from "./pages/Login/LoginPage.jsx";
import LoadingSpinner from "./components/UI/LoadingSpinner.jsx";

// Every page except the login page loads when it is opened, so the first visit downloads the shell and the page it lands on, not all of them.
// A navigation keeps the page you are on until the next one has arrived; only the first load shows the placeholder.
const AuditLogPage = lazy(() => import("./pages/Admin/AuditLogPage.jsx"));
const OrganizationDetailPage = lazy(() => import("./pages/Organizations/OrganizationDetailPage.jsx"));
const MyEquipmentPage = lazy(() => import("./pages/Equipment/MyEquipmentPage.jsx"));
const DashboardPage = lazy(() => import("./pages/Dashboard/DashboardPage.jsx"));
const FarmerDetailPage = lazy(() => import("./pages/Farmers/FarmerDetailPage.jsx"));
const AssistanceAgenciesPage = lazy(() => import("./pages/AssistanceManagement/AssistanceAgenciesPage.jsx"));
const ClassificationSettingsPage = lazy(() => import("./pages/Farmers/ClassificationSettingsPage.jsx"));
const HarvestUnitSettingsPage = lazy(() => import("./pages/Production/HarvestUnitSettingsPage.jsx"));
const BackupPage = lazy(() => import("./pages/Backup/BackupPage.jsx"));
const SignatoriesPage = lazy(() => import("./pages/Signatories/SignatoriesPage.jsx"));
const FarmersHub = lazy(() => import("./pages/Farmers/FarmersHub.jsx"));
const FisherfolkDetailPage = lazy(() => import("./pages/Fisheries/FisherfolkDetailPage.jsx"));
const FisherfolkHub = lazy(() => import("./pages/Fisherfolk/FisherfolkHub.jsx"));
const FisheriesSettingsHub = lazy(() => import("./pages/FisheriesSettings/FisheriesSettingsHub.jsx"));
const ForceChangePasswordPage = lazy(() => import("./pages/Auth/ForceChangePasswordPage.jsx"));
const VerifyEmailPage = lazy(() => import("./pages/Auth/VerifyEmailPage.jsx"));
const CropMonitoringPage = lazy(() => import("./pages/Monitoring/CropMonitoringPage.jsx"));
const FisheriesMonitoringPage = lazy(() => import("./pages/Monitoring/FisheriesMonitoringPage.jsx"));
const AquacultureRecordsPage = lazy(() => import("./pages/FisheriesRecords/AquacultureRecordsPage.jsx"));
const FisheriesForecastingTab = lazy(() => import("./pages/Monitoring/FisheriesForecastingTab.jsx"));
const ProductionPage = lazy(() => import("./pages/Production/ProductionPage.jsx"));
const ProfilePage = lazy(() => import("./pages/Profile/ProfilePage.jsx"));
const ReportsPage = lazy(() => import("./pages/Reports/ReportsPage.jsx"));
const ForecastingPage = lazy(() => import("./pages/Forecasting/ForecastingPage.jsx"));
const CropInformationPage = lazy(() => import("./pages/CropInformation/CropInformationPage.jsx"));
const AddCropMonitoringPage = lazy(() => import("./pages/Monitoring/AddCropMonitoringPage.jsx"));
const AddFarmParcelsPage = lazy(() => import("./pages/CropInformation/AddFarmParcelsPage.jsx"));
const CropSettingsHub = lazy(() => import("./pages/CropSettings/CropSettingsHub.jsx"));
const ActivitySettingsHub = lazy(() => import("./pages/ActivitySettings/ActivitySettingsHub.jsx"));
const UserManagementPage = lazy(() => import("./pages/Users/UserManagementPage.jsx"));
const HelpPage = lazy(() => import("./pages/Help/HelpPage.jsx"));
const CropAssistancePage = lazy(() => import("./pages/AssistanceManagement/CropAssistancePage.jsx"));
const FisheriesAssistancePage = lazy(() => import("./pages/AssistanceManagement/FisheriesAssistancePage.jsx"));
const CitizenHomePage = lazy(() => import("./pages/Citizen/CitizenHomePage.jsx"));
const OwnHelpPage = lazy(() => import("./pages/Citizen/OwnAccountPages.jsx").then((m) => ({ default: m.OwnHelpPage })));
const OwnProfilePage = lazy(() => import("./pages/Citizen/OwnAccountPages.jsx").then((m) => ({ default: m.OwnProfilePage })));
const DisasterPage = lazy(() => import("./pages/Monitoring/DisasterPage.jsx"));

function PageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <LoadingSpinner message="Loading…" />
    </div>
  );
}

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

// The User Manual lives inside each account's own User Manual (Help) page; /manual (the link of an earlier version) goes there.
function ManualRedirect() {
  const { isLoading, isFarmer, isFisherfolk, isOrg } = useAuth();
  if (isLoading) return null;
  return <Navigate to={isFarmer || isFisherfolk || isOrg ? "/my-help" : "/help"} replace />;
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
      <AutoLabels />
      <InactivityMonitor>
        <Suspense fallback={<PageLoading />}>
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
          <Route path="/manual" element={<ManualRedirect />} />
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
          {/* Add farm parcels (and their crops) to this farmer, from Register Farmer or the farmer's profile: the Registration > Farmers menu
              stays selected and Back / Save return to the farmer's profile */}
          <Route
            path="/farmers/:id/add-parcels"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AddFarmParcelsPage />
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
            path="/aquaculture-records"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AquacultureRecordsPage />
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

          {/* Harvest unit settings: how many kg one harvest unit weighs (admin only) */}
          <Route
            path="/harvest-unit-settings"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <HarvestUnitSettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Backup: one downloadable file with the whole database and the uploaded files (admin only) */}
          <Route
            path="/backup"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <BackupPage />
              </ProtectedRoute>
            }
          />

          {/* Signatories: the officials the Reports pages offer as Prepared / Checked / Noted / Approved by (admin only) */}
          <Route
            path="/signatories"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <SignatoriesPage />
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
        </Suspense>
      </InactivityMonitor>
      <Toast />
    </BrowserRouter>
  );
}

export default App;

