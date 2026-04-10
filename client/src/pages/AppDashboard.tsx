import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { fetchProdeStatus, fetchMyResults } from "../lib/api";
import { getCurrentPhase, formatDaysLeft } from "../lib/prode-phases";

/** Inicio del primer partido */
const WORLD_CUP_START = new Date("2026-06-11T19:00:00Z");

const TIPS = [
  "¿Sabías que un buen prompt debe incluir un rol? Prueba empezando con: «Actúa como un experto en estadísticas...»",
  "Da ejemplos a la IA: si quieres un formato específico, incluye un caso previo en tu prompt. Por ejemplo: «Básate en el resultado de la final 2022 (Arg 3 - Fra 3) para entender cómo ponderar el tiempo extra». La IA aprende mejor con referencias.",
  "Controla la creatividad: ¿quieres un análisis lógico o una sorpresa mundialista? Si usas una temperatura baja (0.2), la IA será conservadora y estadística. Con una temperatura alta (0.8), buscará resultados más disruptivos.",
  "Pídele que razone: antes del resultado final, escribe: «Explica tu razonamiento paso a paso antes de dar el marcador». Esto obliga a la IA a analizar variables lógicas antes de «arriesgar» un número.",
  "Evita alucinaciones: sé específico con lo que no quieres. Por ejemplo: «No consideres partidos amistosos de hace más de 5 años». Poner límites claros ayuda a que la IA no se pierda en datos irrelevantes.",
];

function WaveIcon() {
  return (
    <span className="dashboard-emoji" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12c2-3 4-5 6-5s4 2 6 5" />
        <path d="M8 12c2-3 4-5 6-5s4 2 6 5" />
        <path d="M14 12c2-3 4-5 6-5s4 2 6 5" />
      </svg>
    </span>
  );
}

function FootballIcon() {
  return (
    <span className="card-icon-svg" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        <path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    </span>
  );
}

function ChartIcon() {
  return (
    <span className="card-icon-svg" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    </span>
  );
}

function TrophyIcon() {
  return (
    <span className="card-icon-svg" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 15V17c0 .5-.4 1-1 1s-1 .5-1 1v2" />
        <path d="M14 15V17c0 .5.4 1 1 1s1 .5 1 1v2" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </svg>
    </span>
  );
}

function UsersLeagueIcon() {
  return (
    <span className="card-icon-svg" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </span>
  );
}

export default function AppDashboard() {
  const { user } = useAuth();
  const [prodeStatus, setProdeStatus] = useState<{ hasGuidelines: boolean; hasPredictions: boolean; guidelinesVersion: number } | null>(null);
  const [totalHits, setTotalHits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    async function load() {
      try {
        const [statusRes, resultsRes] = await Promise.all([
          fetchProdeStatus(),
          fetchMyResults(),
        ]);
        setProdeStatus(statusRes);
        setTotalHits(resultsRes.totalHits);
      } catch {
        setProdeStatus({ hasGuidelines: false, hasPredictions: false, guidelinesVersion: 1 });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const displayName = user?.fullName || user?.email || "Usuario";
  const worldCupStarted = new Date() >= WORLD_CUP_START;

  function getModelStatusText(): string {
    if (!prodeStatus) return "";
    if (!prodeStatus.hasGuidelines) return "Tu IA aún no tiene instrucciones. ¡Empieza ahora!";
    if (!prodeStatus.hasPredictions) return `Modelo 'DataExpert_v${prodeStatus.guidelinesVersion}' generado.`;
    return "Predicciones ya generadas.";
  }

  return (
    <div className="dashboard">
      <h1 className="dashboard-welcome">
        Hola, {displayName} <WaveIcon />
      </h1>
      {!loading && (
        <p className="dashboard-model-status">
          Estado del Modelo: {getModelStatusText()}
        </p>
      )}

      <section className="dashboard-hero">
        <h2 className="dashboard-hero-title">Laboratorio de Prompts</h2>
        <p className="dashboard-hero-desc">
          Diseña la lógica de tu IA para generar tus predicciones del Mundial.
        </p>
        <Link to="/app/ia" className="btn-primary btn-large">
          Entrar a Prompting
        </Link>
      </section>

      <div className="dashboard-tip">
        <span className="dashboard-tip-label">Tip del día</span>
        <p className="dashboard-tip-text">{TIPS[tipIndex]}</p>
      </div>

      <div className="dashboard-cards">
        <div className="dashboard-card dashboard-card-score">
          <TrophyIcon />
          <span className="dashboard-score-value">
            {worldCupStarted && totalHits !== null
              ? totalHits
              : getCurrentPhase()
                ? `Faltan ${formatDaysLeft(getCurrentPhase()!.deadline)} días`
                : "Cerrado"}
          </span>
          <span className="dashboard-score-label">
            {worldCupStarted ? "Puntaje" : "Para el cierre de carga"}
          </span>
        </div>
        <Link to="/app/prode" className="dashboard-card">
          <FootballIcon />
          <h3>Mis predicciones</h3>
          <p>Ver los resultados que generó tu IA para los próximos partidos</p>
        </Link>
        <Link to="/app/resultados" className="dashboard-card">
          <ChartIcon />
          <h3>Mis resultados</h3>
          <p>Tu puntaje actual y posición en el ranking de la empresa</p>
        </Link>
        <Link to="/app/ligas" className="dashboard-card">
          <UsersLeagueIcon />
          <h3>Ligas &amp; Comunidad</h3>
          <p>Crear o unirte por código, invitar y ver el ranking por grupo</p>
        </Link>
      </div>
    </div>
  );
}
