import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import F1HomeOverview from "../components/F1HomeOverview";
import UpcomingMatchesCarousel from "../components/UpcomingMatchesCarousel";
import { useAppDiscipline } from "../contexts/AppDisciplineContext";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchMyCompetitions,
  fetchMyResults,
  fetchProdeStatus,
  fetchResultsDashboard,
  type CompetitionQuota,
  type MineCompetitionsResponse,
  type ProdeStatus,
  type ResultsDashboard,
} from "../lib/api";
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

function canCreateMoreLeagues(q: CompetitionQuota): boolean {
  if (q.scope === "user") {
    return q.maxCreatedByMe != null && q.createdByMe < q.maxCreatedByMe;
  }
  if (q.maxCompany == null) return true;
  return (q.companyTotal ?? 0) < q.maxCompany;
}

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

function UserCircleIcon() {
  return (
    <span className="card-icon-svg" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    </span>
  );
}

function RankArrow({ change }: { change: number }) {
  if (change > 0) {
    return (
      <span className="rank-arrow rank-up" aria-label="Subió puestos">
        ↑
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="rank-arrow rank-down" aria-label="Bajó puestos">
        ↓
      </span>
    );
  }
  return <span className="rank-arrow rank-same">—</span>;
}

function DashboardNextStepNoLeague() {
  return (
    <section className="dashboard-next dashboard-next--accent" aria-labelledby="dashboard-next-title">
      <h2 id="dashboard-next-title" className="dashboard-next-title">
        Primer paso
      </h2>
      <p className="dashboard-next-desc">Crea o únete a una liga para poder empezar a jugar y competir.</p>
      <div className="dashboard-next-actions dashboard-next-actions--primary-pair dashboard-next-actions--cta-equal">
        <Link to="/app/ligas#ligas-crear" className="btn-primary btn-large dashboard-next-cta-main">
          CREAR LIGA
        </Link>
        <Link to="/app/ligas#ligas-unirse" className="btn-secondary btn-large dashboard-next-cta-main">
          UNIRME A UNA LIGA
        </Link>
      </div>
    </section>
  );
}

function DashboardNextStepWithLeague({
  prodeStatus,
}: {
  prodeStatus: { hasGuidelines: boolean; hasPredictions: boolean; guidelinesVersion: number } | null;
}) {
  if (!prodeStatus) return null;

  if (!prodeStatus.hasGuidelines) {
    return (
      <section className="dashboard-next dashboard-next--accent" aria-labelledby="dashboard-next-title">
        <h2 id="dashboard-next-title" className="dashboard-next-title">
          Primer paso
        </h2>
        <p className="dashboard-next-desc">
          Definí las instrucciones de tu IA en el Laboratorio; después podrás generar predicciones para los partidos.
        </p>
        <Link to="/app/ia" className="btn-primary">
          Ir al Laboratorio de prompts
        </Link>
      </section>
    );
  }

  if (!prodeStatus.hasPredictions) {
    return (
      <section className="dashboard-next" aria-labelledby="dashboard-next-title">
        <h2 id="dashboard-next-title" className="dashboard-next-title">
          Siguiente paso
        </h2>
        <p className="dashboard-next-desc">
          Ya tenés el modelo «DataExpert_v{prodeStatus.guidelinesVersion}». Generá o revisá tus predicciones en Mis predicciones.
        </p>
        <Link to="/app/prode" className="btn-primary">
          Ir a Mis predicciones
        </Link>
      </section>
    );
  }

  return null;
}

function DashboardMyLeaguesPanel({ mine }: { mine: MineCompetitionsResponse }) {
  const { competitions, quota } = mine;
  const createAllowed = quota ? canCreateMoreLeagues(quota) : false;

  return (
    <section className="dashboard-my-leagues" aria-labelledby="dashboard-my-leagues-title">
      <h2 id="dashboard-my-leagues-title" className="dashboard-section-heading">
        Tus ligas
      </h2>
      <div className="dashboard-my-leagues-card">
        <ul className="dashboard-my-leagues-list">
          {competitions.map((c) => (
            <li key={c.id}>
              <Link to={`/app/ligas/${c.id}`} className="dashboard-my-leagues-link">
                <span className="dashboard-my-leagues-name">{c.emoji ? `${c.emoji} ` : ""}{c.name}</span>
                <span className="dashboard-my-leagues-meta">
                  {c.card.myRank != null
                    ? `Tu puesto: #${c.card.myRank} de ${c.card.totalParticipants}`
                    : `${c.memberCount} miembros`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="dashboard-my-leagues-actions">
          <Link
            to="/app/ligas#ligas-crear"
            className={`btn-primary${createAllowed ? "" : " dashboard-my-leagues-create--soft"}`}
          >
            CREAR LIGA
          </Link>
        </div>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard dashboard-skeleton" aria-busy="true" aria-label="Cargando tu resumen">
      <div className="skeleton skeleton-line dashboard-sk-welcome" />
      <div className="skeleton skeleton-line dashboard-sk-status" />
      <div className="skeleton skeleton-block dashboard-sk-next" />
      <div className="skeleton skeleton-block dashboard-sk-hero" />
      <div className="skeleton skeleton-block dashboard-sk-tip" />
      <div className="dashboard-sk-cards">
        <div className="skeleton skeleton-block dashboard-sk-card" />
        <div className="skeleton skeleton-block dashboard-sk-card" />
        <div className="skeleton skeleton-block dashboard-sk-card" />
        <div className="skeleton skeleton-block dashboard-sk-card" />
      </div>
    </div>
  );
}

const EMPTY_DASH: ResultsDashboard = {
  totalHits: 0,
  totalWithResult: 0,
  precision: 0,
  leaderboard: [],
  myRank: null,
  totalParticipants: 0,
  rankChange: 0,
  pointsOverTime: [],
  competitionLeaderboards: [],
};

export default function AppDashboard() {
  const { user, company } = useAuth();
  const { discipline, setDiscipline } = useAppDiscipline();
  const [dashTab, setDashTab] = useState<"football" | "f1">(() => (discipline === "f1" ? "f1" : "football"));

  useEffect(() => {
    setDashTab(discipline === "f1" ? "f1" : "football");
  }, [discipline]);

  function selectDashboardTab(next: "football" | "f1") {
    setDashTab(next);
    setDiscipline(next === "f1" ? "f1" : "football");
  }

  const [prodeStatus, setProdeStatus] = useState<ProdeStatus | null>(null);
  const [mine, setMine] = useState<MineCompetitionsResponse | null>(null);
  const [resultsDash, setResultsDash] = useState<ResultsDashboard | null>(null);
  const [totalHits, setTotalHits] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    async function load() {
      setLoadError("");
      try {
        const [statusRes, resultsRes, mineRes] = await Promise.all([
          fetchProdeStatus(),
          fetchMyResults(),
          fetchMyCompetitions(),
        ]);
        setProdeStatus(statusRes);
        setTotalHits(resultsRes.totalHits);
        setMine(mineRes);
        try {
          const dash = await fetchResultsDashboard();
          setResultsDash(dash);
        } catch {
          setResultsDash(EMPTY_DASH);
        }
      } catch {
        setProdeStatus({ hasGuidelines: false, hasPredictions: false, guidelinesVersion: 1 });
        setMine({ competitions: [], quota: { scope: "user", createdByMe: 0, maxCreatedByMe: null, companyTotal: null, maxCompany: null } });
        setResultsDash(EMPTY_DASH);
        setLoadError("No se pudo cargar el resumen. Reintentá en unos segundos.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const displayName = user?.fullName || user?.email || "Usuario";
  const worldCupStarted = new Date() >= WORLD_CUP_START;

  const hasAnyLeague = (mine?.competitions?.length ?? 0) > 0;
  const modelReady = prodeStatus?.hasGuidelines === true && prodeStatus?.hasPredictions === true;

  const dash = resultsDash ?? EMPTY_DASH;
  const rankingLabel = company != null ? "Ranking de empresa" : "Ranking global";

  function getModelStatusText(): string {
    if (!prodeStatus) return "";
    if (!prodeStatus.hasGuidelines) return "Tu IA aún no tiene instrucciones. ¡Empieza ahora!";
    if (!prodeStatus.hasPredictions) return `Modelo 'DataExpert_v${prodeStatus.guidelinesVersion}' generado.`;
    return "Predicciones ya generadas.";
  }

  const leagueRankRows =
    modelReady && mine
      ? mine.competitions.map((c) => {
          const block = dash.competitionLeaderboards.find((b) => b.id === c.id);
          return {
            id: c.id,
            name: c.name,
            emoji: c.emoji,
            myRank: block?.myRank ?? c.card.myRank,
            totalParticipants: block?.totalParticipants ?? c.card.totalParticipants,
          };
        })
      : [];

  if (loading) {
    return <DashboardSkeleton />;
  }

  const showLeaguesPanel = hasAnyLeague && !modelReady && mine != null;
  const showResultsStrip = modelReady;

  return (
    <div className="dashboard">
      <header className="dashboard-header-block">
        <h1 className="dashboard-welcome">
          Hola, {displayName} <WaveIcon />
        </h1>
        <p className="dashboard-model-status">
          {dashTab === "f1" ? (
            <>
              <span className="dashboard-model-status-label">Modo F1:</span> pautas por carrera en el laboratorio y
              top 10 con IA antes de la salida.
            </>
          ) : (
            <>
              <span className="dashboard-model-status-label">Estado del modelo:</span> {getModelStatusText()}
            </>
          )}
        </p>
      </header>

      <div className="dashboard-mode-tabs" role="tablist" aria-label="Vista de inicio por disciplina">
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === "football"}
          className={`dashboard-mode-tab${dashTab === "football" ? " dashboard-mode-tab--active" : ""}`}
          onClick={() => selectDashboardTab("football")}
        >
          Mundial 2026
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === "f1"}
          className={`dashboard-mode-tab${dashTab === "f1" ? " dashboard-mode-tab--active" : ""}`}
          onClick={() => selectDashboardTab("f1")}
        >
          Fórmula 1
        </button>
      </div>

      {loadError && <div className="auth-error dashboard-load-error">{loadError}</div>}

      {dashTab === "football" ? (
        <>
          {!hasAnyLeague && <DashboardNextStepNoLeague />}
          {hasAnyLeague && !modelReady && <DashboardNextStepWithLeague prodeStatus={prodeStatus} />}

          {showResultsStrip && (
        <>
          <div className="resultados-metrics dashboard-home-metrics" aria-label="Resumen de resultados">
            <div className="resultados-metric">
              <span className="resultados-metric-value">{dash.totalHits}</span>
              <span className="resultados-metric-label">Puntos Totales</span>
            </div>
            <div className="resultados-metric">
              <span className="resultados-metric-value">{dash.precision}%</span>
              <span className="resultados-metric-label">Precisión del Prompt</span>
            </div>
            <div className="resultados-metric resultados-metric-rank">
              <span className="resultados-metric-value">
                #{dash.myRank ?? "—"} de {dash.totalParticipants}
                {dash.myRank != null && <RankArrow change={dash.rankChange} />}
              </span>
              <span className="resultados-metric-label">{rankingLabel}</span>
            </div>
          </div>

          <section className="dashboard-league-ranks" aria-labelledby="dashboard-league-ranks-title">
            <h2 id="dashboard-league-ranks-title" className="dashboard-section-heading">
              Tu posición por liga
            </h2>
            {leagueRankRows.length > 0 ? (
              <div className="resultados-table-wrapper">
                <table className="resultados-table dashboard-league-ranks-table">
                  <thead>
                    <tr>
                      <th>Liga</th>
                      <th>Posición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagueRankRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/app/ligas/${row.id}`} className="dashboard-league-ranks-name">
                            {row.emoji ? <span className="dashboard-league-ranks-emoji">{row.emoji}</span> : null}
                            {row.name}
                          </Link>
                        </td>
                        <td>
                          #{row.myRank ?? "—"} de {row.totalParticipants}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dashboard-league-ranks-empty">
                Unite a una liga en Ligas &amp; Comunidad para ver tu posición en cada grupo.
              </p>
            )}
          </section>
        </>
          )}

          <section className="dashboard-tip" aria-labelledby="dashboard-tip-label">
            <span id="dashboard-tip-label" className="dashboard-tip-label">
              Tip del día
            </span>
            <p className="dashboard-tip-text">{TIPS[tipIndex]}</p>
          </section>

          {showLeaguesPanel && mine != null ? <DashboardMyLeaguesPanel mine={mine} /> : null}

          <UpcomingMatchesCarousel variant="dashboard" className="dashboard-upcoming-carousel" />

          <section className="dashboard-cards-wrap" aria-labelledby="dashboard-cards-heading">
            <h2 id="dashboard-cards-heading" className="dashboard-section-heading">
              Accesos rápidos
            </h2>
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
                  {worldCupStarted ? "Puntaje global" : "Para el cierre de carga"}
                </span>
              </div>
              <Link to="/app/prode" className="dashboard-card">
                <FootballIcon />
                <h3>Mis predicciones</h3>
                <p>Partidos y marcadores que generó tu IA</p>
              </Link>
              <Link to="/app/resultados" className="dashboard-card">
                <ChartIcon />
                <h3>Mis resultados</h3>
                <p>Puntaje y posición en el ranking de la empresa</p>
              </Link>
              <Link to="/app/ligas" className="dashboard-card">
                <UsersLeagueIcon />
                <h3>Ligas &amp; Comunidad</h3>
                <p>Ligas privadas, códigos de invitación y ranking por grupo</p>
              </Link>
              <Link to="/app/perfil" className="dashboard-card">
                <UserCircleIcon />
                <h3>Mi usuario</h3>
                <p>Datos de cuenta, alias en rankings y cierre de sesión</p>
              </Link>
            </div>
          </section>

          {modelReady ? (
            <Link to="/app/ia" className="resultados-fab">
              Ajustar mi Prompt para la próxima fase
            </Link>
          ) : null}
        </>
      ) : (
        <F1HomeOverview leagueSummaries={mine?.competitions} />
      )}
    </div>
  );
}
