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
import AcceptLeagueInvitePage from "./pages/AcceptLeagueInvitePage";
import MisLigasPage from "./pages/MisLigasPage";
import TermsOfServicePage from "./pages/TermsOfServicePage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import F1Layout from "./pages/f1/F1Layout";
import F1HubPage from "./pages/f1/F1HubPage";
import F1PrediccionesPage from "./pages/f1/F1PrediccionesPage";
import F1LaboratorioPage from "./pages/f1/F1LaboratorioPage";
import F1ResultadosPage from "./pages/f1/F1ResultadosPage";

export default function App() {
  return (
    <Routes>
      <Route path="/f1" element={<Navigate to="/app/f1" replace />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/invite/accept" element={<AcceptInvitePage />} />
      <Route path="/invite/liga/accept" element={<AcceptLeagueInvitePage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<AppDashboard />} />
        <Route path="prode" element={<ProdePage />} />
        <Route path="ia" element={<IAPage />} />
        <Route path="resultados" element={<ResultadosPage />} />
        <Route path="ligas" element={<MisLigasPage />} />
        <Route path="ligas/:id" element={<MisLigasPage />} />
        <Route path="perfil" element={<PerfilPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="platform" element={<PlatformAdminPage />} />
        <Route path="f1" element={<F1Layout />}>
          <Route index element={<F1HubPage />} />
          <Route path="predicciones" element={<F1PrediccionesPage />} />
          <Route path="laboratorio" element={<F1LaboratorioPage />} />
          <Route path="resultados" element={<F1ResultadosPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
