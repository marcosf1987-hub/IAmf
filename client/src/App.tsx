import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import AppLayout from "./pages/AppLayout";
import AppDashboard from "./pages/AppDashboard";
import ProdePage from "./pages/ProdePage";
import IAPage from "./pages/IAPage";
import ResultadosPage from "./pages/ResultadosPage";
import PerfilPage from "./pages/PerfilPage";
import AdminPage from "./pages/AdminPage";
import PlatformAdminPage from "./pages/PlatformAdminPage";
import PricingPage from "./pages/PricingPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/invite/accept" element={<AcceptInvitePage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<AppDashboard />} />
        <Route path="prode" element={<ProdePage />} />
        <Route path="ia" element={<IAPage />} />
        <Route path="resultados" element={<ResultadosPage />} />
        <Route path="perfil" element={<PerfilPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="platform" element={<PlatformAdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
