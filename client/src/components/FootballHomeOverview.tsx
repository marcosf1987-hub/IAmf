import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import UpcomingMatchesCarousel from "./UpcomingMatchesCarousel";
import type { CompetitionQuota, MineCompetitionsResponse, ProdeStatus, ResultsDashboard } from "../lib/api";
import { ligaDetailPath } from "../lib/discipline-paths";
import { formatDaysLeft, formatTimeLeftLong, getCurrentPhase } from "../lib/prode-phases";

const WORLD_CUP_START = new Date("2026-06-11T19:00:00Z");

export type FootballLeagueRankRow = {
  id: string;
  name: string;
  emoji: string | null;
  myRank: number | null;
  totalParticipants: number;
};

export type FootballHomeOverviewProps = {
  prodeStatus: ProdeStatus | null;
  mine: MineCompetitionsResponse | null;
  resultsDash: ResultsDashboard;
  totalHits: number | null;
  worldCupStarted: boolean;
  tipIndex: number;
  tips: readonly string[];
  modelReady: boolean;
  hasAnyLeague: boolean;
  leagueRankRows: FootballLeagueRankRow[];
  rankingLabel: string;
};

function canCreateMoreLeagues(q: CompetitionQuota): boolean {
  if (q.scope === "user") {
    return q.maxCreatedByMe != null && q.createdByMe < q.maxCreatedByMe;
  }
  if (q.maxCompany == null) return true;
  return (q.companyTotal ?? 0) < q.maxCompany;
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
              <Link to={ligaDetailPath("football", c.id)} className="dashboard-my-leagues-link">
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

function useHeroCountdown(worldCupStarted: boolean) {
  const phase = getCurrentPhase();
  const deadline = useMemo(() => {
    if (worldCupStarted) return null;
    return phase?.deadline ?? WORLD_CUP_START;
  }, [worldCupStarted, phase?.deadline]);

  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!deadline) {
      setCountdown("");
      return;
    }
    const tick = () => setCountdown(formatTimeLeftLong(deadline));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [deadline]);

  return { phase, deadline, countdown };
}

export default function FootballHomeOverview({
  prodeStatus,
  mine,
  resultsDash,
  totalHits,
  worldCupStarted,
  tipIndex,
  tips,
  modelReady,
  hasAnyLeague,
  leagueRankRows,
  rankingLabel,
}: FootballHomeOverviewProps) {
  const { phase, deadline, countdown } = useHeroCountdown(worldCupStarted);
  const showLeaguesPanel = hasAnyLeague && !modelReady && mine != null;

  const heroEyebrow = worldCupStarted
    ? "Mundial 2026 · En juego"
    : phase
      ? `Próximo cierre · ${phase.label}`
      : "Mundial 2026";

  const heroTitle = worldCupStarted
    ? "El torneo ya comenzó"
    : countdown
      ? `Faltan ${countdown} para el cierre`
      : "Calendario del torneo";

  const heroSub = worldCupStarted
    ? "Seguí tus predicciones, resultados y posición en las ligas."
    : deadline
      ? deadline.toLocaleString("es-AR", { dateStyle: "full", timeStyle: "short" })
      : "Cuando se publique el calendario, verás las fechas clave aquí.";

  const rankText =
    modelReady && resultsDash.myRank != null && resultsDash.totalParticipants > 0
      ? `#${resultsDash.myRank} de ${resultsDash.totalParticipants}`
      : "Completá tu modelo para ver el ranking";

  const pointsLabel =
    worldCupStarted && totalHits != null
      ? `${totalHits} pts`
      : modelReady
        ? `${resultsDash.totalHits} pts`
        : "Sin datos aún";

  return (
    <>
      <section className="dashboard-hero" aria-labelledby="dashboard-football-hero-title">
        <p className="dashboard-hero-eyebrow">{heroEyebrow}</p>
        <h2 id="dashboard-football-hero-title" className="dashboard-hero-title">
          {heroTitle}
        </h2>
        <p className="dashboard-hero-sub">{heroSub}</p>
        <div className="dashboard-hero-actions">
          {!hasAnyLeague ? (
            <>
              <Link to="/app/ligas#ligas-crear" className="btn-primary">
                Crear una liga
              </Link>
              <Link to="/app/ligas#ligas-unirse" className="btn-secondary">
                Unirme a una liga
              </Link>
            </>
          ) : !prodeStatus?.hasGuidelines ? (
            <Link to="/app/ia" className="btn-primary">
              Ir al Laboratorio de prompts
            </Link>
          ) : !prodeStatus.hasPredictions ? (
            <Link to="/app/prode" className="btn-primary">
              Ir a Mis predicciones
            </Link>
          ) : (
            <Link to="/app/prode" className="btn-secondary">
              Ver Mis predicciones
            </Link>
          )}
        </div>
      </section>

      <section className="dashboard-overview" aria-label="Resumen Mundial principal">
        <article className="dashboard-panel dashboard-panel--model">
          <div className="dashboard-panel-head">
            <h3>Tu modelo y predicciones</h3>
            {prodeStatus?.hasGuidelines ? (
              <Link to="/app/ia" className="dashboard-inline-link">
                Editar
              </Link>
            ) : null}
          </div>
          <p className="dashboard-panel-sub">Estado de tu IA para el Mundial</p>
          <ul className="dashboard-model-status-list">
            <li className={prodeStatus?.hasGuidelines ? "" : "is-muted"}>
              <span className="dashboard-model-status-marker" aria-hidden>
                {prodeStatus?.hasGuidelines ? "✓" : "·"}
              </span>
              Instrucciones en el Laboratorio
            </li>
            <li className={prodeStatus?.hasPredictions ? "" : "is-muted"}>
              <span className="dashboard-model-status-marker" aria-hidden>
                {prodeStatus?.hasPredictions ? "✓" : "·"}
              </span>
              {prodeStatus?.hasGuidelines
                ? `Modelo DataExpert_v${prodeStatus.guidelinesVersion}`
                : "Modelo DataExpert pendiente"}
            </li>
            <li className={prodeStatus?.hasPredictions ? "" : "is-muted"}>
              <span className="dashboard-model-status-marker" aria-hidden>
                {prodeStatus?.hasPredictions ? "✓" : "·"}
              </span>
              Predicciones de partidos generadas
            </li>
          </ul>
          {prodeStatus?.hasPredictions ? (
            <p className="dashboard-panel-footnote">Tus marcadores están listos para la fase en curso.</p>
          ) : (
            <p className="dashboard-panel-footnote">
              {hasAnyLeague
                ? "Definí pautas y generá predicciones para competir en tus ligas."
                : "Primero unite o creá una liga para empezar."}
            </p>
          )}
        </article>

        <article className="dashboard-panel dashboard-panel--rank">
          <h3>Mi posición</h3>
          <p className="dashboard-rank-value">{rankText}</p>
          <div className="dashboard-rank-links">
            <Link to="/app/resultados" className="dashboard-rank-chip">
              <span>Puntos totales</span>
              <strong>{pointsLabel}</strong>
            </Link>
            <Link to="/app/ligas" className="dashboard-rank-chip">
              <span>Mis ligas</span>
              <strong>{hasAnyLeague ? "Ver mis ligas" : "Sin ligas aún"}</strong>
            </Link>
          </div>
        </article>
      </section>

      {modelReady ? (
        <>
          <div className="resultados-metrics dashboard-home-metrics" aria-label="Resumen de resultados">
            <div className="resultados-metric">
              <span className="resultados-metric-value">{resultsDash.totalHits}</span>
              <span className="resultados-metric-label">Puntos Totales</span>
            </div>
            <div className="resultados-metric">
              <span className="resultados-metric-value">{resultsDash.precision}%</span>
              <span className="resultados-metric-label">Precisión del Prompt</span>
            </div>
            <div className="resultados-metric resultados-metric-rank">
              <span className="resultados-metric-value">
                #{resultsDash.myRank ?? "—"} de {resultsDash.totalParticipants}
                {resultsDash.myRank != null ? <RankArrow change={resultsDash.rankChange} /> : null}
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
                          <Link to={ligaDetailPath("football", row.id)} className="dashboard-league-ranks-name">
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
      ) : null}

      <section className="dashboard-tip" aria-labelledby="dashboard-tip-label">
        <span id="dashboard-tip-label" className="dashboard-tip-label">
          Tip del día
        </span>
        <p className="dashboard-tip-text">{tips[tipIndex] ?? tips[0]}</p>
      </section>

      {showLeaguesPanel ? <DashboardMyLeaguesPanel mine={mine} /> : null}

      <section className="dashboard-upcoming-wrap" aria-labelledby="dashboard-football-upcoming-title">
        <h2 id="dashboard-football-upcoming-title" className="dashboard-section-heading">
          Próximos partidos
        </h2>
        <UpcomingMatchesCarousel variant="dashboard" className="dashboard-upcoming-carousel" />
      </section>

      <section className="dashboard-cards-wrap" aria-labelledby="dashboard-cards-heading">
        <h2 id="dashboard-cards-heading" className="dashboard-section-heading">
          Accesos rápidos
        </h2>
        <div className="dashboard-cards">
          <div className="dashboard-card dashboard-card-score">
            <TrophyIcon />
            <span className="dashboard-score-value">
              {worldCupStarted && totalHits != null
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
            <h3>Mis Ligas</h3>
            <p>Crea ligas con amigos, familia o compañeros y compite por mejores resultados</p>
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
  );
}
