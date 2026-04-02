import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import UploadPage from "./pages/UploadPage";
import MySharesPage from "./pages/MySharesPage";
import ShareViewPage from "./pages/ShareViewPage";
import Layout from "./components/Layout";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <UploadPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-shares"
          element={
            <ProtectedRoute>
              <MySharesPage />
            </ProtectedRoute>
          }
        />
        <Route path="/s/:slug" element={<ShareViewPage />} />
      </Routes>
    </Layout>
  );
}
