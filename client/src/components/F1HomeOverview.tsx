import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { formatDateTime } from "../lib/intl-format";
import i18n from "../i18n";
import UpcomingRacesCarousel from "./UpcomingRacesCarousel";
import {
  fetchF1Guidelines,
  fetchF1MyPredictions,
  fetchF1MySummary,
  fetchMyCompetitions,
  fetchPublicF1Drivers,
  fetchPublicF1Races,
  type CompetitionQuota,
  type F1RaceSummary,
  type MyCompetitionSummary,
} from "../lib/api";
import { buildF1DashboardStatusLine, f1RaceHeadline } from "../lib/f1-dashboard-status";

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

function formatF1Countdown(iso: string): string {
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return i18n.t("f1:countdown.noData");
  const delta = end - Date.now();
  if (delta <= 0) return i18n.t("f1:countdown.inProgress");
  const s = Math.floor(delta / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return i18n.t("f1:countdown.days", { count: d });
  if (h > 0) return i18n.t("f1:countdown.hours", { hours: h, minutes: m });
  return i18n.t("f1:countdown.minutes", { minutes: m });
}

type Props = {
  leagueSummaries?: MyCompetitionSummary[];
  quota?: CompetitionQuota;
  /** Línea de estado bajo la bienvenida del dashboard (pestaña F1). */
  onStatusLine?: (line: string) => void;
};

/** Dorsales del top 3 + session para resolver nombres vía fetchPublicF1Drivers (una sola fuente de verdad). */
type PredDriverCtx = {
  sessionKey: number;
  dorsales: [number | null, number | null, number | null];
};

function padTop3(placements: (number | null)[]): [number | null, number | null, number | null] {
  const a = placements.slice(0, 3);
  while (a.length < 3) a.push(null);
  return [a[0] ?? null, a[1] ?? null, a[2] ?? null];
}

function canCreateLeagues(q: CompetitionQuota | undefined): boolean {
  if (!q) return false;
  if (typeof q.canCreate === "boolean") return q.canCreate;
  if (q.scope === "user") {
    return q.maxCreatedByMe != null && q.createdByMe < q.maxCreatedByMe;
  }
  if (q.maxCompany == null) return true;
  return (q.companyTotal ?? 0) < q.maxCompany;
}

export default function F1HomeOverview({ leagueSummaries, quota: quotaProp, onStatusLine }: Props) {
  const [summary, setSummary] = useState<{ totalPoints: number } | null>(null);
  const [predRaces, setPredRaces] = useState(0);
  const [predDriverCtx, setPredDriverCtx] = useState<PredDriverCtx | null>(null);
  const { t } = useTranslation(["f1", "app"]);
  const f1Tips = t("tips", { ns: "f1", returnObjects: true }) as string[];
  const undefinedLabel = t("panels.undefined", { ns: "f1" });
  const [driverLabels, setDriverLabels] = useState<[string, string, string]>([
    undefinedLabel,
    undefinedLabel,
    undefinedLabel,
  ]);
  const [nextRace, setNextRace] = useState<F1RaceSummary | null>(null);
  const [countdown, setCountdown] = useState(i18n.t("f1:countdown.noData"));
  const [f1Err, setF1Err] = useState("");
  const [tipIx] = useState(() => Math.floor(Math.random() * Math.max(f1Tips.length, 1)));
  const [leagueRows, setLeagueRows] = useState<MyCompetitionSummary[] | null>(leagueSummaries ?? null);
  const [quota, setQuota] = useState<CompetitionQuota | undefined>(quotaProp);

  useEffect(() => {
    if (leagueSummaries) setLeagueRows(leagueSummaries);
  }, [leagueSummaries]);

  useEffect(() => {
    if (quotaProp) setQuota(quotaProp);
  }, [quotaProp]);

  useEffect(() => {
    if (leagueSummaries && quotaProp) return;
    let cancelled = false;
    (async () => {
      try {
        const mine = await fetchMyCompetitions("f1");
        if (!cancelled) {
          setLeagueRows(mine.competitions);
          setQuota(mine.quota);
        }
      } catch {
        if (!cancelled) setLeagueRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueSummaries, quotaProp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setF1Err("");
      try {
        const year = new Date().getUTCFullYear();
        const [s, preds, races, gl] = await Promise.all([
          fetchF1MySummary(),
          fetchF1MyPredictions(),
          fetchPublicF1Races(year, 12),
          fetchF1Guidelines(),
        ]);
        if (cancelled) return;
        setSummary({ totalPoints: s.totalPoints });
        const list = preds.predictions;
        const n = list.filter((p) => p.placements.some((x) => x != null)).length;
        setPredRaces(n);
        const firstFilled = list.find((p) => p.placements.some((x) => x != null));
        const hasG = Object.values(gl.bySessionKey ?? {}).some((t) => typeof t === "string" && t.trim().length > 0);
        const next = races.races[0] ?? null;
        onStatusLine?.(buildF1DashboardStatusLine(hasG, list, n, next));
        setPredDriverCtx(
          firstFilled
            ? {
                sessionKey: firstFilled.race.sessionKey,
                dorsales: padTop3(firstFilled.placements),
              }
            : null
        );
        setNextRace(next);
      } catch {
        if (!cancelled) {
          setSummary({ totalPoints: 0 });
          setPredRaces(0);
          setPredDriverCtx(null);
          setNextRace(null);
          setF1Err("No se pudo cargar el resumen F1.");
          onStatusLine?.("No se pudo cargar el estado F1.");
        }
      }
    })();
    return () => {
      cancelled = true;
      onStatusLine?.("");
    };
  }, [onStatusLine]);

  useEffect(() => {
    if (!predDriverCtx || !Number.isFinite(predDriverCtx.sessionKey)) {
      setDriverLabels([undefinedLabel, undefinedLabel, undefinedLabel]);
      return;
    }
    let cancelled = false;
    fetchPublicF1Drivers(predDriverCtx.sessionKey).then((driverMap) => {
      if (cancelled) return;
      const next = predDriverCtx.dorsales.map((n) =>
        n == null ? undefinedLabel : driverMap.get(n) ?? `Piloto #${n}`
      ) as [string, string, string];
      setDriverLabels(next);
    });
    return () => {
      cancelled = true;
    };
  }, [predDriverCtx]);

  useEffect(() => {
    if (!nextRace) {
      setCountdown("Sin datos aún");
      return;
    }
    const tick = () => setCountdown(formatF1Countdown(nextRace.raceStartAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [nextRace]);

  const generalLeague = useMemo(
    () =>
      (leagueRows ?? []).find((c) => {
        const slug = c.slug?.toLowerCase() ?? "";
        const name = c.name?.toLowerCase() ?? "";
        return (
          slug.includes("universal-f1") ||
          name.includes("liga universal f1") ||
          slug.includes("general") ||
          name.includes("general") ||
          name.includes("campeonato")
        );
      }),
    [leagueRows]
  );

  const hasAnyLeague = (leagueRows?.length ?? 0) > 0;
  const createAllowed = canCreateLeagues(quota);
  const rankText =
    generalLeague?.card.myRank != null && generalLeague.card.totalParticipants > 0
      ? t("dashboard.rankOf", { ns: "app", rank: generalLeague.card.myRank, total: generalLeague.card.totalParticipants })
      : t("dashboard.noDataYet", { ns: "app" });

  return (
    <>
      {f1Err ? <div className="auth-error dashboard-load-error">{f1Err}</div> : null}
      <section className="dashboard-hero" aria-labelledby="dashboard-hero-title">
        <p className="dashboard-hero-eyebrow">
          {nextRace
            ? t("hero.nextEventNamed", { name: f1RaceHeadline(nextRace) })
            : t("hero.nextEvent")}
        </p>
        <h2 id="dashboard-hero-title" className="dashboard-hero-title">
          {countdown === t("countdown.inProgress")
            ? t("hero.gpInProgress")
            : t("hero.countdownToGp", { time: countdown })}
        </h2>
        <p className="dashboard-hero-sub">
          {nextRace
            ? formatDateTime(nextRace.raceStartAt, { dateStyle: "full", timeStyle: "short" })
            : t("hero.noCalendar")}
        </p>
        <div className="dashboard-hero-actions">
          {createAllowed ? (
            <Link to="/app/f1/ligas#ligas-crear" className="btn-primary">
              {t("hero.createLeague", { ns: "f1" })}
            </Link>
          ) : null}
          <Link to="/app/f1/ligas#ligas-unirse" className={createAllowed ? "btn-secondary" : "btn-primary"}>
            {t("hero.joinLeague", { ns: "f1" })}
          </Link>
        </div>
      </section>

      <section className="dashboard-overview" aria-label={t("panels.overview")}>
        <article className="dashboard-panel dashboard-panel--predictions">
          <div className="dashboard-panel-head">
            <h3>{t("panels.gridPredictions")}</h3>
            <Link to="/app/f1/laboratorio" className="dashboard-inline-link">
              {t("panels.editLab", { ns: "f1" })}
            </Link>
          </div>
          <p className="dashboard-panel-sub">{t("panels.gridSubtitle")}</p>
          <ol className="dashboard-f1-top3">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <span className="dashboard-f1-top3-pos">0{i + 1}</span>
                <span className="dashboard-f1-top3-label">{driverLabels[i]}</span>
              </li>
            ))}
          </ol>
          <p className="dashboard-f1-pred-count">
            {predRaces}{" "}
            {t(predRaces === 1 ? "panels.racePredictions_one" : "panels.racePredictions_other")}
          </p>
        </article>

        <article className="dashboard-panel dashboard-panel--rank">
          <h3>{t("panels.championshipRank")}</h3>
          <p className="dashboard-rank-value">{rankText}</p>
          <div className="dashboard-rank-links">
            <Link to="/app/f1/resultados" className="dashboard-rank-chip">
              <span>{t("panels.totalPoints")}</span>
              <strong>
                {summary != null
                  ? t("dashboard.points", { ns: "app", count: summary.totalPoints })
                  : t("dashboard.noDataYet", { ns: "app" })}
              </strong>
            </Link>
            <Link to="/app/f1/ligas" className="dashboard-rank-chip">
              <span>{t("panels.friendsLeague")}</span>
              <strong>
                {hasAnyLeague
                  ? t("dashboard.footballHero.viewLeagues", { ns: "app" })
                  : t("dashboard.footballHero.noLeaguesYet", { ns: "app" })}
              </strong>
            </Link>
          </div>
        </article>
      </section>

      <section className="dashboard-tip" aria-labelledby="dashboard-f1-tip-label">
        <span id="dashboard-f1-tip-label" className="dashboard-tip-label">
          {t("tipLabel")}
        </span>
        <p className="dashboard-tip-text">{f1Tips[tipIx] ?? f1Tips[0]}</p>
      </section>

      <section className="dashboard-upcoming-wrap" aria-labelledby="dashboard-f1-upcoming-title">
        <h2 id="dashboard-f1-upcoming-title" className="dashboard-section-heading">
          {t("panels.upcomingRaces")}
        </h2>
        <UpcomingRacesCarousel
          variant="dashboard"
          hideTitle
          className="dashboard-upcoming-carousel dashboard-upcoming-carousel--f1-home"
        />
      </section>

      <section className="dashboard-cards-wrap" aria-labelledby="dashboard-f1-cards-heading">
        <h2 id="dashboard-f1-cards-heading" className="dashboard-section-heading">
          {t("panels.quickAccess")}
        </h2>
        <div className="dashboard-cards dashboard-cards--f1-quick">
          <Link to="/app/f1/predicciones" className="dashboard-card">
            <FootballIcon />
            <h3>{t("nav.f1Predictions", { ns: "app" })}</h3>
            <p>{t("panels.cardPredictionsDesc")}</p>
          </Link>
          <Link to="/app/f1/resultados" className="dashboard-card">
            <ChartIcon />
            <h3>{t("nav.results", { ns: "app" })}</h3>
            <p>{t("panels.cardResultsDesc")}</p>
          </Link>
          <Link to="/app/f1/ligas" className="dashboard-card">
            <UsersLeagueIcon />
            <h3>{t("nav.leagues", { ns: "app" })}</h3>
            <p>{t("panels.cardLeaguesDesc")}</p>
          </Link>
          <Link to="/app/perfil" className="dashboard-card">
            <UserCircleIcon />
            <h3>{t("nav.profile", { ns: "app" })}</h3>
            <p>{t("panels.cardProfileDesc")}</p>
          </Link>
        </div>
      </section>

      <Link to="/app/f1/laboratorio" className="resultados-fab">
        {t("panels.adjustGuidelines")}
      </Link>
    </>
  );
}
