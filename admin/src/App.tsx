import { Routes, Route, Navigate } from "react-router-dom";
import { useAdminAuth } from "./hooks/useAdminAuth";
import AdminLayout from "./components/AdminLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SharesPage from "./pages/SharesPage";
import ShareDetailPage from "./pages/ShareDetailPage";
import SecurityPage from "./pages/SecurityPage";
import SystemPage from "./pages/SystemPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAdminAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/shares" element={<SharesPage />} />
                <Route path="/shares/:slug" element={<ShareDetailPage />} />
                <Route path="/security" element={<SecurityPage />} />
                <Route path="/system" element={<SystemPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AdminLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
