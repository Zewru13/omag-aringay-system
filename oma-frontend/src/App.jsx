import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Toast from "./components/UI/Toast.jsx";
import InactivityMonitor from "./components/InactivityMonitor.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import AuditLogPage from "./pages/Admin/AuditLogPage.jsx";
import AssociationDetailPage from "./pages/Associations/AssociationDetailPage.jsx";
import DashboardPage from "./pages/Dashboard/DashboardPage.jsx";
import FarmerDetailPage from "./pages/Farmers/FarmerDetailPage.jsx";
import FarmersHub from "./pages/Farmers/FarmersHub.jsx";
import FisherfolkDetailPage from "./pages/Fisheries/FisherfolkDetailPage.jsx";
import FisherfolkHub from "./pages/Fisherfolk/FisherfolkHub.jsx";
import FisheriesRecordsPage from "./pages/FisheriesRecords/FisheriesRecordsPage.jsx";
import FisheriesSettingsHub from "./pages/FisheriesSettings/FisheriesSettingsHub.jsx";
import InterventionsPage from "./pages/Interventions/InterventionsPage.jsx";
import ProgramDetailPage from "./pages/Interventions/ProgramDetailPage.jsx";
import LoginPage from "./pages/Login/LoginPage.jsx";
import ForceChangePasswordPage from "./pages/Auth/ForceChangePasswordPage.jsx";
import VerifyEmailPage from "./pages/Auth/VerifyEmailPage.jsx";
import CropMonitoringPage from "./pages/Monitoring/CropMonitoringPage.jsx";
import FisheriesMonitoringPage from "./pages/Monitoring/FisheriesMonitoringPage.jsx";
import ProductionPage from "./pages/Production/ProductionPage.jsx";
import ProfilePage from "./pages/Profile/ProfilePage.jsx";
import ReportsPage from "./pages/Reports/ReportsPage.jsx";
import ForecastingPage from "./pages/Forecasting/ForecastingPage.jsx";
import CropInformationPage from "./pages/CropInformation/CropInformationPage.jsx";
import CropSettingsHub from "./pages/CropSettings/CropSettingsHub.jsx";
import UserManagementPage from "./pages/Users/UserManagementPage.jsx";
import HelpPage from "./pages/Help/HelpPage.jsx";

function HomeRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
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
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
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
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Farmers hub — tabs: Registry + Associations */}
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
          {/* Old association routes redirect to Farmers hub */}
          <Route path="/associations" element={<Navigate to="/farmers?tab=associations" replace />} />
          <Route path="/associations/farmers" element={<Navigate to="/farmers?tab=associations" replace />} />

          <Route
            path="/associations/:type/:id"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AssociationDetailPage />
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
          <Route
            path="/fisheries-records"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <FisheriesRecordsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fisheries-settings"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <FisheriesSettingsHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/interventions"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <InterventionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/interventions/:id"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <ProgramDetailPage />
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
          <Route
            path="/forecasting"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <ForecastingPage />
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
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
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
