import { Navigate, useLocation } from "react-router-dom";
import { useAppDiscipline } from "../contexts/AppDisciplineContext";
import MisLigasPage from "./MisLigasPage";

/**
 * Misma pantalla de ligas; si la disciplina activa es F1, redirige a `/app/f1/ligas…`
 * para no disparar el sync de `AppDisciplineContext` que fuerza football en `/app/ligas`.
 */
export default function LigasFootballEntry() {
  const { discipline } = useAppDiscipline();
  const location = useLocation();

  if (discipline === "f1") {
    const tail = location.pathname === "/app/ligas" ? "" : location.pathname.slice("/app/ligas".length);
    return <Navigate to={`/app/f1/ligas${tail}${location.search}${location.hash}`} replace />;
  }

  return <MisLigasPage />;
}
