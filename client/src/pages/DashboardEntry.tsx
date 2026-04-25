import { Navigate } from "react-router-dom";
import { hasShownContextPickerToday } from "../contexts/AppDisciplineContext";
import AppDashboard from "./AppDashboard";

/** Primera visita del día a home: pantalla de contexto; si no, dashboard unificado. */
export default function DashboardEntry() {
  if (!hasShownContextPickerToday()) {
    return <Navigate to="/app/contexto" replace />;
  }
  return <AppDashboard />;
}
