import { useNavigate } from "react-router-dom";
import { markContextPickerShownToday, useAppDiscipline } from "../contexts/AppDisciplineContext";

/**
 * Intersticial: primera visita del día a /app — elegir disciplina (estilo “Arena”).
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
      <header className="context-choice-hero">
        <p className="context-choice-eyebrow">Selección de arena</p>
        <h1 className="context-choice-title">
          Seleccioná tu <em className="context-choice-title-accent">Arena</em>
        </h1>
        <p className="context-choice-lead">
          Elegí el ecosistema donde querés jugar, creá tus ligas y competí. Después podés cambiar de disciplina con el
          selector junto al logo.
        </p>
      </header>

      <div className="context-choice-cards">
        <button type="button" className="context-choice-card context-choice-card--football" onClick={chooseFootball}>
          <div className="context-choice-card-media" aria-hidden>
            <span className="context-choice-card-badge context-choice-card-badge--live">
              <span className="context-choice-badge-dot" />
              Evento en vivo
            </span>
            <span className="context-choice-card-badge context-choice-card-badge--tag">
              <span className="context-choice-badge-icon" aria-hidden>
                🏆
              </span>
              FIFA WORLD CUP 2026
            </span>
            <div className="context-choice-card-media-shine" />
            <div className="context-choice-card-overlay">
              <span className="context-choice-overlay-line">
                <span className="context-choice-overlay-strong">Mundial 2026</span>
                <span className="context-choice-overlay-sep"> — </span>
                <span className="context-choice-overlay-sub">Entrená la IA goleadora</span>
              </span>
            </div>
          </div>
          <div className="context-choice-card-foot">
            <p className="context-choice-card-desc">
              Configurá tu IA goleadora y dominá el campo con prompts estratégicos.
            </p>
            <div className="context-choice-meter" role="presentation">
              <div className="context-choice-meter-fill context-choice-meter-fill--football" />
              <span className="context-choice-meter-label">85% lleno · listo para competir</span>
            </div>
          </div>
        </button>

        <button type="button" className="context-choice-card context-choice-card--f1" onClick={chooseF1}>
          <div className="context-choice-card-media" aria-hidden>
            <span className="context-choice-card-badge context-choice-card-badge--velocity">
              <span className="context-choice-badge-bolt" aria-hidden>
                ⚡
              </span>
              Alta velocidad
            </span>
            <span className="context-choice-card-badge context-choice-card-badge--tag">
              <span className="context-choice-badge-icon" aria-hidden>
                F1
              </span>
              F1 WORLD CHAMPIONSHIP
            </span>
            <div className="context-choice-card-media-shine context-choice-card-media-shine--f1" />
            <div className="context-choice-card-overlay">
              <span className="context-choice-overlay-line">
                <span className="context-choice-overlay-strong">Fórmula 1</span>
                <span className="context-choice-overlay-sep"> — </span>
                <span className="context-choice-overlay-sub">Predecí el podio con tu mejor prompt</span>
              </span>
            </div>
          </div>
          <div className="context-choice-card-foot">
            <p className="context-choice-card-desc">
              Dominá la telemetría con tu prompt y llevá el top 10 a la parrilla real.
            </p>
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
