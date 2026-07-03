import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Toast from "./components/UI/Toast.jsx";
import InactivityMonitor from "./components/InactivityMonitor.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import AuditLogPage from "./pages/Admin/AuditLogPage.jsx";
import AssociationDetailPage from "./pages/Associations/AssociationDetailPage.jsx";
import AssociationsPage from "./pages/Associations/AssociationsPage.jsx";
import DashboardPage from "./pages/Dashboard/DashboardPage.jsx";
import FarmerDetailPage from "./pages/Farmers/FarmerDetailPage.jsx";
import FarmersPage from "./pages/Farmers/FarmersPage.jsx";
import FisheriesPage from "./pages/Fisheries/FisheriesPage.jsx";
import FisherfolkDetailPage from "./pages/Fisheries/FisherfolkDetailPage.jsx";
import InterventionsPage from "./pages/Interventions/InterventionsPage.jsx";
import ProgramDetailPage from "./pages/Interventions/ProgramDetailPage.jsx";
import LoginPage from "./pages/Login/LoginPage.jsx";
import CropMonitoringPage from "./pages/Monitoring/CropMonitoringPage.jsx";
import FisheriesMonitoringPage from "./pages/Monitoring/FisheriesMonitoringPage.jsx";
import ProductionPage from "./pages/Production/ProductionPage.jsx";
import ProfilePage from "./pages/Profile/ProfilePage.jsx";
import ReportsPage from "./pages/Reports/ReportsPage.jsx";
import ForecastingPage from "./pages/Forecasting/ForecastingPage.jsx";
import CropOptionPage from "./pages/CropOption/CropOptionPage.jsx";
import CropCategoryPage from "./pages/CropCategory/CropCategoryPage.jsx";
import CropInformationPage from "./pages/CropInformation/CropInformationPage.jsx";
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
          <Route
            path="/farmers"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <FarmersPage />
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
          <Route
            path="/associations"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AssociationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/associations/:type/:id"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AssociationDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fisheries"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <FisheriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fisheries/:id"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <FisherfolkDetailPage />
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
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crop-options"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <CropOptionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crop-categories"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <CropCategoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crop-information"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <CropInformationPage />
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
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AuditLogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/associations/farmers"
            element={
              <ProtectedRoute allowedRoles={["ADMIN", "EVALUATOR"]}>
                <AssociationsPage />
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
