import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import Toast from "./components/UI/Toast.jsx";
import InactivityMonitor from "./components/InactivityMonitor.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import AuditLogPage from "./pages/Admin/AuditLogPage.jsx";
import OrganizationDetailPage from "./pages/Organizations/OrganizationDetailPage.jsx";
import DashboardPage from "./pages/Dashboard/DashboardPage.jsx";
import FarmerDetailPage from "./pages/Farmers/FarmerDetailPage.jsx";
import FarmersHub from "./pages/Farmers/FarmersHub.jsx";
import FisherfolkDetailPage from "./pages/Fisheries/FisherfolkDetailPage.jsx";
import FisherfolkHub from "./pages/Fisherfolk/FisherfolkHub.jsx";
import FisheriesSettingsHub from "./pages/FisheriesSettings/FisheriesSettingsHub.jsx";
import LoginPage from "./pages/Login/LoginPage.jsx";
import ForceChangePasswordPage from "./pages/Auth/ForceChangePasswordPage.jsx";
import VerifyEmailPage from "./pages/Auth/VerifyEmailPage.jsx";
import CropMonitoringPage from "./pages/Monitoring/CropMonitoringPage.jsx";
import FisheriesMonitoringPage from "./pages/Monitoring/FisheriesMonitoringPage.jsx";
import AddStockingPage from "./pages/FisheriesRecords/AddStockingPage.jsx";
import FisheriesForecastingTab from "./pages/Monitoring/FisheriesForecastingTab.jsx";
import ProductionPage from "./pages/Production/ProductionPage.jsx";
import ProfilePage from "./pages/Profile/ProfilePage.jsx";
import ReportsPage from "./pages/Reports/ReportsPage.jsx";
import ForecastingPage from "./pages/Forecasting/ForecastingPage.jsx";
import CropInformationPage from "./pages/CropInformation/CropInformationPage.jsx";
import AddCropMonitoringPage from "./pages/Monitoring/AddCropMonitoringPage.jsx";
import CropSettingsHub from "./pages/CropSettings/CropSettingsHub.jsx";
import ActivitySettingsHub from "./pages/ActivitySettings/ActivitySettingsHub.jsx";
import UserManagementPage from "./pages/Users/UserManagementPage.jsx";
import HelpPage from "./pages/Help/HelpPage.jsx";
import HealthMonitoringPage from "./pages/HealthMonitoring/HealthMonitoringPage.jsx";
import CropAssistancePage from "./pages/AssistanceManagement/CropAssistancePage.jsx";
import FisheriesAssistancePage from "./pages/AssistanceManagement/FisheriesAssistancePage.jsx";
import CitizenHomePage from "./pages/Citizen/CitizenHomePage.jsx";

function HomeRedirect() {
  const { isAuthenticated, isCitizen } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
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
              // (UserCreateView) — ProtectedRoute redirects them here on
              // their first authenticated request. CITIZEN is still allowed
              // through this route for completeness, but ProtectedRoute
              // never forces a CITIZEN here — see its own comment.
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
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <CropMonitoringPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fisheries-monitoring"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <FisheriesMonitoringPage />
              </ProtectedRoute>
            }
          />
          {/* Full-screen bulk-entry page — was a floating modal inside
              FisheriesRecordsPage, moved to its own route so the table gets
              the full viewport instead of a max-w-6xl dialog box. */}
          <Route
            path="/fisheries-monitoring/add"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AddStockingPage />
              </ProtectedRoute>
            }
          />
          {/* Health & Feeding Monitoring (Batch 4) */}
          <Route
            path="/fisheries-health-monitoring"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <HealthMonitoringPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/forecasting"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <ForecastingPage />
              </ProtectedRoute>
            }
          />
          {/* Fisheries Forecasting — moved out of the /fisheries-monitoring tab bar
              (Batch C) into its own destination, same component, mounted standalone. */}
          <Route
            path="/fisheries-forecasting"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
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
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <CropAssistancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fisheries-assistance"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
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
