import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { formatDateTime } from "../lib/intl-format";
import UpcomingMatchesCarousel from "./UpcomingMatchesCarousel";
import type { CompetitionQuota, MineCompetitionsResponse, ProdeStatus, ResultsDashboard } from "../lib/api";
import { ligaDetailPath } from "../lib/discipline-paths";
import { formatDaysLeft, formatTimeLeftLong, getCurrentPhase } from "../lib/prode-phases";

const WORLD_CUP_START = new Date("2026-06-11T19:00:00Z");

/** Mismo slug que `UNIVERSAL_COMPETITION_SLUG` en server/src/universal-league.ts */
const UNIVERSAL_COMPETITION_SLUG = "liga-universal-promptplay";

function isProtectedUniversalLeague(input: { slug?: string | null; name?: string | null }): boolean {
  const slug = (input.slug ?? "").toLowerCase();
  const name = (input.name ?? "").toLowerCase();
  return (
    slug === UNIVERSAL_COMPETITION_SLUG ||
    slug.includes("universal") ||
    slug.includes("general") ||
    name.includes("liga universal") ||
    name.includes("campeonato general") ||
    name.includes("liga general")
  );
}

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
  if (typeof q.canCreate === "boolean") return q.canCreate;
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
  const { t } = useTranslation("app");
  if (change > 0) {
    return (
      <span className="rank-arrow rank-up" aria-label={t("dashboard.rankUp")}>
        ↑
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="rank-arrow rank-down" aria-label={t("dashboard.rankDown")}>
        ↓
      </span>
    );
  }
  return <span className="rank-arrow rank-same">—</span>;
}

function DashboardMyLeaguesPanel({ mine }: { mine: MineCompetitionsResponse }) {
  const { t } = useTranslation("app");
  const { competitions, quota } = mine;
  const createAllowed = quota ? canCreateMoreLeagues(quota) : false;

  return (
    <section className="dashboard-my-leagues" aria-labelledby="dashboard-my-leagues-title">
      <h2 id="dashboard-my-leagues-title" className="dashboard-section-heading">
        {t("dashboard.myLeagues")}
      </h2>
      <div className="dashboard-my-leagues-card">
        <ul className="dashboard-my-leagues-list">
          {competitions.map((c) => (
            <li key={c.id}>
              <Link to={ligaDetailPath("football", c.id)} className="dashboard-my-leagues-link">
                <span className="dashboard-my-leagues-name">{c.emoji ? `${c.emoji} ` : ""}{c.name}</span>
                <span className="dashboard-my-leagues-meta">
                  {c.card.myRank != null
                    ? t("dashboard.yourRank", { rank: c.card.myRank, total: c.card.totalParticipants })
                    : t("dashboard.members", { count: c.memberCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {createAllowed ? (
          <div className="dashboard-my-leagues-actions">
            <Link to="/app/ligas#ligas-crear" className="btn-primary">
              {t("dashboard.createLeague")}
            </Link>
          </div>
        ) : null}
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
  const { t } = useTranslation("app");
  const { phase, deadline, countdown } = useHeroCountdown(worldCupStarted);
  const showLeaguesPanel = hasAnyLeague && !modelReady && mine != null;
  const createAllowed = mine?.quota ? canCreateMoreLeagues(mine.quota) : false;

  const universalLeague = useMemo(
    () => mine?.competitions.find((c) => isProtectedUniversalLeague({ slug: c.slug, name: c.name })),
    [mine?.competitions]
  );

  const heroEyebrow = worldCupStarted
    ? t("dashboard.footballHero.inPlay")
    : phase
      ? t("dashboard.footballHero.nextClose", { phase: phase.label })
      : t("dashboard.footballHero.defaultEyebrow");

  const heroTitle = worldCupStarted
    ? t("dashboard.footballHero.tournamentStarted")
    : countdown
      ? t("dashboard.footballHero.countdown", { time: countdown })
      : t("dashboard.footballHero.calendar");

  const heroSub = worldCupStarted
    ? t("dashboard.footballHero.startedSub")
    : deadline
      ? formatDateTime(deadline, { dateStyle: "full", timeStyle: "short" })
      : t("dashboard.footballHero.noCalendar");

  const universalDashBlock = resultsDash.competitionLeaderboards.find((b) =>
    isProtectedUniversalLeague({ slug: b.slug, name: b.name })
  );

  const hasResultsRanking = resultsDash.showGlobalRanking
    ? resultsDash.myRank != null && resultsDash.totalParticipants > 0
    : universalDashBlock != null &&
      universalDashBlock.myRank != null &&
      universalDashBlock.totalParticipants > 0;

  const rankText = resultsDash.showGlobalRanking
    ? hasResultsRanking
      ? t("dashboard.rankOf", { rank: resultsDash.myRank, total: resultsDash.totalParticipants })
      : universalLeague != null && universalLeague.card.totalParticipants > 0
        ? t("dashboard.rankOf", { rank: "N/A", total: universalLeague.card.totalParticipants })
        : t("dashboard.rankNA")
    : universalDashBlock != null && universalDashBlock.myRank != null
      ? t("dashboard.rankOf", {
          rank: universalDashBlock.myRank,
          total: universalDashBlock.totalParticipants,
        })
      : t("dashboard.rankNA");

  const pointsLabel =
    worldCupStarted && totalHits != null
      ? t("dashboard.points", { count: totalHits })
      : modelReady
        ? t("dashboard.points", { count: resultsDash.totalHits })
        : t("dashboard.noDataYet");

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
              {createAllowed ? (
                <Link to="/app/ligas#ligas-crear" className="btn-primary">
                  {t("dashboard.createLeagueBtn")}
                </Link>
              ) : null}
              <Link to="/app/ligas#ligas-unirse" className={createAllowed ? "btn-secondary" : "btn-primary"}>
                {t("dashboard.joinLeague")}
              </Link>
            </>
          ) : !prodeStatus?.hasGuidelines ? (
            <Link to="/app/ia" className="btn-primary">
              {t("dashboard.goPromptLab")}
            </Link>
          ) : !prodeStatus.hasPredictions ? (
            <Link to="/app/prode" className="btn-primary">
              {t("dashboard.goPredictions")}
            </Link>
          ) : hasAnyLeague ? (
            <>
              <Link to="/app/prode" className="btn-primary">
                {t("dashboard.viewPredictions")}
              </Link>
              {createAllowed ? (
                <Link to="/app/ligas#ligas-crear" className="btn-secondary">
                  {t("dashboard.createLeagueBtn")}
                </Link>
              ) : null}
            </>
          ) : (
            <>
              {createAllowed ? (
                <Link to="/app/ligas#ligas-crear" className="btn-primary">
                  {t("dashboard.createLeagueBtn")}
                </Link>
              ) : null}
              <Link to="/app/prode" className={createAllowed ? "btn-secondary" : "btn-primary"}>
                {t("dashboard.viewPredictions")}
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="dashboard-overview" aria-label={t("dashboard.overviewFootball")}>
        <article className="dashboard-panel dashboard-panel--model">
          <div className="dashboard-panel-head">
            <h3>{t("dashboard.yourPredictions")}</h3>
            {prodeStatus?.hasGuidelines ? (
              <Link to="/app/ia" className="dashboard-inline-link">
                {t("dashboard.edit")}
              </Link>
            ) : null}
          </div>
          <p className="dashboard-panel-sub">{t("dashboard.aiStatusFootball")}</p>
          <ul className="dashboard-model-status-list">
            <li className={prodeStatus?.hasGuidelines ? "" : "is-muted"}>
              <span className="dashboard-model-status-marker" aria-hidden>
                {prodeStatus?.hasGuidelines ? "✓" : "·"}
              </span>
              {t("dashboard.instructionsLab")}
            </li>
            <li className={prodeStatus?.hasPredictions ? "" : "is-muted"}>
              <span className="dashboard-model-status-marker" aria-hidden>
                {prodeStatus?.hasPredictions ? "✓" : "·"}
              </span>
              {t("dashboard.footballHero.matchPredictionsGenerated")}
            </li>
          </ul>
          {prodeStatus?.hasPredictions ? (
            <p className="dashboard-panel-footnote">{t("dashboard.footballHero.predictionsReady")}</p>
          ) : (
            <p className="dashboard-panel-footnote">
              {hasAnyLeague
                ? t("dashboard.footballHero.footnoteWithLeague")
                : t("dashboard.footballHero.footnoteNoLeague")}
            </p>
          )}
        </article>

        <article className="dashboard-panel dashboard-panel--rank">
          <h3>{t("dashboard.footballHero.myPosition")}</h3>
          <p className="dashboard-rank-value">{rankText}</p>
          <div className="dashboard-rank-links">
            <Link to="/app/resultados" className="dashboard-rank-chip">
              <span>{t("dashboard.footballHero.totalPointsChip")}</span>
              <strong>{pointsLabel}</strong>
            </Link>
            <Link to="/app/ligas" className="dashboard-rank-chip">
              <span>{t("dashboard.footballHero.myLeaguesChip")}</span>
              <strong>{hasAnyLeague ? t("dashboard.footballHero.viewLeagues") : t("dashboard.footballHero.noLeaguesYet")}</strong>
            </Link>
          </div>
        </article>
      </section>

      {modelReady ? (
        <>
          <div className="resultados-metrics dashboard-home-metrics" aria-label={t("dashboard.footballHero.resultsSummary")}>
            <div className="resultados-metric">
              <span className="resultados-metric-value">{resultsDash.totalHits}</span>
              <span className="resultados-metric-label">{t("dashboard.footballHero.metricTotalPoints")}</span>
            </div>
            <div className="resultados-metric">
              <span className="resultados-metric-value">{resultsDash.precision}%</span>
              <span className="resultados-metric-label">{t("dashboard.footballHero.metricPrecision")}</span>
            </div>
            {resultsDash.showGlobalRanking ? (
              <div className="resultados-metric resultados-metric-rank">
                <span className="resultados-metric-value">
                  #{resultsDash.myRank ?? "—"} de {resultsDash.totalParticipants}
                  {resultsDash.myRank != null ? <RankArrow change={resultsDash.rankChange} /> : null}
                </span>
                <span className="resultados-metric-label">{rankingLabel}</span>
              </div>
            ) : universalDashBlock != null ? (
              <div className="resultados-metric resultados-metric-rank">
                <span className="resultados-metric-value">
                  #{universalDashBlock.myRank ?? "—"} de {universalDashBlock.totalParticipants}
                </span>
                <span className="resultados-metric-label">Liga universal</span>
              </div>
            ) : null}
          </div>

          <section className="dashboard-league-ranks" aria-labelledby="dashboard-league-ranks-title">
            <h2 id="dashboard-league-ranks-title" className="dashboard-section-heading">
              {t("dashboard.footballHero.positionByLeague")}
            </h2>
            {leagueRankRows.length > 0 ? (
              <div className="resultados-table-wrapper">
                <table className="resultados-table dashboard-league-ranks-table">
                  <thead>
                    <tr>
                      <th>{t("dashboard.footballHero.leagueCol")}</th>
                      <th>{t("dashboard.footballHero.positionCol")}</th>
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
                {t("dashboard.footballHero.leagueRanksEmpty")}
              </p>
            )}
          </section>
        </>
      ) : null}

      <section className="dashboard-tip" aria-labelledby="dashboard-tip-label">
        <span id="dashboard-tip-label" className="dashboard-tip-label">
          {t("dashboard.tipLabel")}
        </span>
        <p className="dashboard-tip-text">{tips[tipIndex] ?? tips[0]}</p>
      </section>

      {showLeaguesPanel ? <DashboardMyLeaguesPanel mine={mine} /> : null}

      <section className="dashboard-upcoming-wrap" aria-labelledby="dashboard-football-upcoming-title">
        <h2 id="dashboard-football-upcoming-title" className="dashboard-section-heading">
          {t("dashboard.footballHero.upcomingMatches")}
        </h2>
        <UpcomingMatchesCarousel variant="dashboard" className="dashboard-upcoming-carousel" />
      </section>

      <section className="dashboard-cards-wrap" aria-labelledby="dashboard-cards-heading">
        <h2 id="dashboard-cards-heading" className="dashboard-section-heading">
          {t("dashboard.footballHero.quickAccess")}
        </h2>
        <div className="dashboard-cards">
          <div className="dashboard-card dashboard-card-score">
            <TrophyIcon />
            <span className="dashboard-score-value">
              {worldCupStarted && totalHits != null
                ? totalHits
                : getCurrentPhase()
                  ? t("dashboard.footballHero.daysToClose", { days: formatDaysLeft(getCurrentPhase()!.deadline) })
                  : t("dashboard.footballHero.closed")}
            </span>
            <span className="dashboard-score-label">
              {worldCupStarted ? t("dashboard.footballHero.globalScore") : t("dashboard.footballHero.untilDeadline")}
            </span>
          </div>
          <Link to="/app/prode" className="dashboard-card">
            <FootballIcon />
            <h3>{t("dashboard.footballHero.cardPredictionsTitle")}</h3>
            <p>{t("dashboard.footballHero.cardPredictionsDesc")}</p>
          </Link>
          <Link to="/app/resultados" className="dashboard-card">
            <ChartIcon />
            <h3>{t("dashboard.footballHero.cardResultsTitle")}</h3>
            <p>{t("dashboard.footballHero.cardResultsDesc")}</p>
          </Link>
          <Link to="/app/ligas" className="dashboard-card">
            <UsersLeagueIcon />
            <h3>{t("dashboard.footballHero.cardLeaguesTitle")}</h3>
            <p>{t("dashboard.footballHero.cardLeaguesDesc")}</p>
          </Link>
          <Link to="/app/perfil" className="dashboard-card">
            <UserCircleIcon />
            <h3>{t("dashboard.footballHero.cardProfileTitle")}</h3>
            <p>{t("dashboard.footballHero.cardProfileDesc")}</p>
          </Link>
        </div>
      </section>

      {modelReady ? (
        <Link to="/app/ia" className="resultados-fab">
          {t("dashboard.footballHero.adjustPrompt")}
        </Link>
      ) : null}
    </>
  );
}
