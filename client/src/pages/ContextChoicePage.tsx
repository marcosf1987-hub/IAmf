import { useNavigate } from "react-router-dom";
import { markContextPickerShownToday, useAppDiscipline } from "../contexts/AppDisciplineContext";

/**
 * Intersticial: primera visita del día a /app (tras login) — elegir disciplina.
 */
export default function ContextChoicePage() {
  const navigate = useNavigate();
  const { setDiscipline } = useAppDiscipline();

  function chooseFootball() {
    markContextPickerShownToday();
    setDiscipline("football", { navigateToHub: true });
  }

  function chooseF1() {
    markContextPickerShownToday();
    setDiscipline("f1", { navigateToHub: true });
  }

  function skip() {
    markContextPickerShownToday();
    navigate("/app", { replace: true });
  }

  return (
    <div className="context-choice-page">
      <header className="context-choice-header">
        <h1 className="context-choice-title">¿A qué disciplina le aplicamos IA hoy?</h1>
        <p className="context-choice-lead">
          Elegí un contexto para personalizar colores, accesos rápidos y el laboratorio de prompts. Podés cambiar
          cuando quieras desde el selector junto al logo.
        </p>
      </header>

      <div className="context-choice-cards">
        <button type="button" className="context-choice-card context-choice-card--football" onClick={chooseFootball}>
          <div className="context-choice-card-visual context-choice-card-visual--stadium" aria-hidden />
          <div className="context-choice-card-body">
            <span className="context-choice-card-kicker">Mundial 2026</span>
            <h2 className="context-choice-card-title">Entrená a la IA goleadora</h2>
            <p className="context-choice-card-desc">
              Prode, laboratorio de prompts por fase, ligas privadas y ranking por empresa.
            </p>
            <span className="context-choice-card-cta">Entrar al Mundial</span>
          </div>
        </button>

        <button type="button" className="context-choice-card context-choice-card--f1" onClick={chooseF1}>
          <div className="context-choice-card-visual context-choice-card-visual--track" aria-hidden />
          <div className="context-choice-card-body">
            <span className="context-choice-card-kicker">Fórmula 1</span>
            <h2 className="context-choice-card-title">Predecí el podio con tu mejor prompt</h2>
            <p className="context-choice-card-desc">
              Pautas por gran premio, top 10 con IA y puntos cuando cierre la carrera.
            </p>
            <span className="context-choice-card-cta">Entrar a F1</span>
          </div>
        </button>
      </div>

      <p className="context-choice-footer">
        <button type="button" className="context-choice-skip btn-secondary btn-sm" onClick={skip}>
          Ir al inicio sin elegir (se mantiene tu última preferencia)
        </button>
      </p>
    </div>
  );
}
