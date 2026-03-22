import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AppLayout from "./pages/AppLayout";
import AppDashboard from "./pages/AppDashboard";
import ProdePage from "./pages/ProdePage";
import IAPage from "./pages/IAPage";
import ResultadosPage from "./pages/ResultadosPage";
import PerfilPage from "./pages/PerfilPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<AppDashboard />} />
        <Route path="prode" element={<ProdePage />} />
        <Route path="ia" element={<IAPage />} />
        <Route path="resultados" element={<ResultadosPage />} />
        <Route path="perfil" element={<PerfilPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
