import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import UpcomingRacesCarousel from "./UpcomingRacesCarousel";
import {
  fetchF1MyPredictions,
  fetchF1MySummary,
  fetchMyCompetitions,
  fetchPublicF1Drivers,
  fetchPublicF1Races,
  type F1RaceSummary,
  type MyCompetitionSummary,
} from "../lib/api";

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

function f1RaceHeadline(r: F1RaceSummary): string {
  const circuit = r.circuitShortName?.trim();
  const country = r.countryName?.trim();
  if (circuit && country) return `${circuit} · ${country}`;
  return circuit || country || `Ronda ${r.roundOrder}`;
}

function formatF1Countdown(iso: string): string {
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return "Sin datos aún";
  const delta = end - Date.now();
  if (delta <= 0) return "En curso o finalizada";
  const s = Math.floor(delta / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} días`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const F1_DASH_TIPS = [
  "En el Laboratorio F1 podés fijar posición en parrilla, clima y estrategia de neumáticos por gran premio.",
  "Sumá historial del circuito: victorias previas del líder, incidentes en la primera curva o safety car frecuente.",
  "Pedí a la IA que considere degradación de gomas y ventana de paradas bajo SC; son variables que mueven el top 10.",
];

type Props = {
  leagueSummaries?: MyCompetitionSummary[];
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

export default function F1HomeOverview({ leagueSummaries }: Props) {
  const [summary, setSummary] = useState<{ totalPoints: number } | null>(null);
  const [predRaces, setPredRaces] = useState(0);
  const [predDriverCtx, setPredDriverCtx] = useState<PredDriverCtx | null>(null);
  const [driverLabels, setDriverLabels] = useState<[string, string, string]>(["Sin definir", "Sin definir", "Sin definir"]);
  const [nextRace, setNextRace] = useState<F1RaceSummary | null>(null);
  const [countdown, setCountdown] = useState("Sin datos aún");
  const [f1Err, setF1Err] = useState("");
  const [tipIx] = useState(() => Math.floor(Math.random() * F1_DASH_TIPS.length));
  const [leagueRows, setLeagueRows] = useState<MyCompetitionSummary[] | null>(leagueSummaries ?? null);

  useEffect(() => {
    if (leagueSummaries) setLeagueRows(leagueSummaries);
  }, [leagueSummaries]);

  useEffect(() => {
    if (leagueSummaries) return;
    let cancelled = false;
    (async () => {
      try {
        const mine = await fetchMyCompetitions();
        if (!cancelled) setLeagueRows(mine.competitions);
      } catch {
        if (!cancelled) setLeagueRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueSummaries]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setF1Err("");
      try {
        const year = new Date().getUTCFullYear();
        const [s, preds, races] = await Promise.all([fetchF1MySummary(), fetchF1MyPredictions(), fetchPublicF1Races(year, 12)]);
        if (cancelled) return;
        setSummary({ totalPoints: s.totalPoints });
        const n = preds.predictions.filter((p) => p.placements.some((x) => x != null)).length;
        setPredRaces(n);
        const firstFilled = preds.predictions.find((p) => p.placements.some((x) => x != null));
        // #region agent log
        fetch("http://127.0.0.1:7598/ingest/5f37e537-1084-43d7-866d-2cc8ab88169d", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9d423" }, body: JSON.stringify({ sessionId: "a9d423", runId: "pre-fix", hypothesisId: "H1", location: "F1HomeOverview.tsx:loadPredictions", message: "Predictions fetched for top3 context", data: { predCount: preds.predictions.length, racesWithPrediction: n, hasFirstFilled: Boolean(firstFilled), firstSessionKey: firstFilled?.race.sessionKey ?? null, firstTop3: firstFilled ? padTop3(firstFilled.placements) : null }, timestamp: Date.now() }) }).catch(() => {});
        // #endregion
        setPredDriverCtx(
          firstFilled
            ? {
                sessionKey: firstFilled.race.sessionKey,
                dorsales: padTop3(firstFilled.placements),
              }
            : null
        );
        setNextRace(races.races[0] ?? null);
      } catch {
        if (!cancelled) {
          setSummary({ totalPoints: 0 });
          setPredRaces(0);
          setPredDriverCtx(null);
          setNextRace(null);
          setF1Err("No se pudo cargar el resumen F1.");
          // #region agent log
          fetch("http://127.0.0.1:7598/ingest/5f37e537-1084-43d7-866d-2cc8ab88169d", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9d423" }, body: JSON.stringify({ sessionId: "a9d423", runId: "pre-fix", hypothesisId: "H4", location: "F1HomeOverview.tsx:loadPredictions:catch", message: "Failed loading F1 summary/predictions/races", data: { fallbackApplied: true }, timestamp: Date.now() }) }).catch(() => {});
          // #endregion
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!predDriverCtx || !Number.isFinite(predDriverCtx.sessionKey)) {
      setDriverLabels(["Sin definir", "Sin definir", "Sin definir"]);
      // #region agent log
      fetch("http://127.0.0.1:7598/ingest/5f37e537-1084-43d7-866d-2cc8ab88169d", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9d423" }, body: JSON.stringify({ sessionId: "a9d423", runId: "pre-fix", hypothesisId: "H1", location: "F1HomeOverview.tsx:driverEffect:noContext", message: "Driver labels fallback due missing session context", data: { hasCtx: Boolean(predDriverCtx), sessionKey: predDriverCtx?.sessionKey ?? null }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      return;
    }
    let cancelled = false;
    // #region agent log
    fetch("http://127.0.0.1:7598/ingest/5f37e537-1084-43d7-866d-2cc8ab88169d", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9d423" }, body: JSON.stringify({ sessionId: "a9d423", runId: "pre-fix", hypothesisId: "H2", location: "F1HomeOverview.tsx:driverEffect:beforeFetch", message: "Fetching public F1 drivers for session", data: { sessionKey: predDriverCtx.sessionKey, dorsales: predDriverCtx.dorsales }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    fetchPublicF1Drivers(predDriverCtx.sessionKey).then((driverMap) => {
      if (cancelled) return;
      const next = predDriverCtx.dorsales.map((n) =>
        n == null ? "Sin definir" : driverMap.get(n) ?? `Piloto #${n}`
      ) as [string, string, string];
      setDriverLabels(next);
      // #region agent log
      fetch("http://127.0.0.1:7598/ingest/5f37e537-1084-43d7-866d-2cc8ab88169d", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9d423" }, body: JSON.stringify({ sessionId: "a9d423", runId: "pre-fix", hypothesisId: "H2", location: "F1HomeOverview.tsx:driverEffect:afterFetch", message: "Driver map resolved labels", data: { sessionKey: predDriverCtx.sessionKey, mapSize: driverMap.size, labels: next }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion
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
        return slug.includes("general") || name.includes("general") || name.includes("campeonato");
      }),
    [leagueRows]
  );

  const hasAnyLeague = (leagueRows?.length ?? 0) > 0;
  const rankText =
    generalLeague?.card.myRank != null && generalLeague.card.totalParticipants > 0
      ? `#${generalLeague.card.myRank} de ${generalLeague.card.totalParticipants}`
      : "Sin datos aún";

  return (
    <>
      {f1Err ? <div className="auth-error dashboard-load-error">{f1Err}</div> : null}
      <section className="dashboard-f1-hero" aria-labelledby="dashboard-f1-hero-title">
        <p className="dashboard-f1-hero-eyebrow">
          {nextRace ? `Próximo evento · ${f1RaceHeadline(nextRace)}` : "Próximo evento"}
        </p>
        <h2 id="dashboard-f1-hero-title" className="dashboard-f1-hero-title">
          {countdown === "En curso o finalizada" ? "El GP ya está en marcha" : `Faltan ${countdown} para el GP`}
        </h2>
        <p className="dashboard-f1-hero-sub">
          {nextRace
            ? new Date(nextRace.raceStartAt).toLocaleString("es-AR", { dateStyle: "full", timeStyle: "short" })
            : "Cuando haya calendario disponible, verás la próxima carrera aquí."}
        </p>
        <div className="dashboard-f1-hero-actions">
          <Link to="/app/ligas#ligas-crear" className="btn-primary">
            Crear una liga
          </Link>
          <Link to="/app/ligas#ligas-unirse" className="btn-secondary">
            Unirme a una liga
          </Link>
        </div>
      </section>

      <section className="dashboard-f1-overview" aria-label="Resumen F1 principal">
        <article className="dashboard-f1-panel dashboard-f1-panel--predictions">
          <div className="dashboard-f1-panel-head">
            <h3>Mis predicciones de parrilla</h3>
            <Link to="/app/f1/laboratorio" className="dashboard-f1-inline-link">
              Editar
            </Link>
          </div>
          <p className="dashboard-f1-panel-sub">Tu configuración actual para el top 3 de clasificación</p>
          <ol className="dashboard-f1-top3">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <span className="dashboard-f1-top3-pos">0{i + 1}</span>
                <span className="dashboard-f1-top3-label">{driverLabels[i]}</span>
              </li>
            ))}
          </ol>
          <p className="dashboard-f1-pred-count">
            {predRaces} {predRaces === 1 ? "carrera con predicción cargada" : "carreras con predicción cargada"}
          </p>
        </article>

        <article className="dashboard-f1-panel dashboard-f1-panel--rank">
          <h3>Mi puesto en el campeonato</h3>
          <p className="dashboard-f1-rank-value">{rankText}</p>
          <div className="dashboard-f1-rank-links">
            <Link to="/app/f1/resultados" className="dashboard-f1-rank-chip">
              <span>Total de puntos</span>
              <strong>{summary != null ? `${summary.totalPoints} pts` : "Sin datos aún"}</strong>
            </Link>
            <Link to="/app/ligas" className="dashboard-f1-rank-chip">
              <span>Liga de amigos</span>
              <strong>{hasAnyLeague ? "Ver mis ligas" : "Sin ligas aún"}</strong>
            </Link>
          </div>
        </article>
      </section>

      <section className="dashboard-tip" aria-labelledby="dashboard-f1-tip-label">
        <span id="dashboard-f1-tip-label" className="dashboard-tip-label">
          Tip F1
        </span>
        <p className="dashboard-tip-text">{F1_DASH_TIPS[tipIx]}</p>
      </section>

      <section className="dashboard-f1-upcoming-wrap" aria-labelledby="dashboard-f1-upcoming-title">
        <h2 id="dashboard-f1-upcoming-title" className="dashboard-section-heading">
          Próximas carreras
        </h2>
        <UpcomingRacesCarousel
          variant="dashboard"
          hideTitle
          className="dashboard-upcoming-carousel dashboard-upcoming-carousel--f1-home"
        />
      </section>

      <section className="dashboard-cards-wrap" aria-labelledby="dashboard-f1-cards-heading">
        <h2 id="dashboard-f1-cards-heading" className="dashboard-section-heading">
          Accesos rápidos
        </h2>
        <div className="dashboard-cards dashboard-cards--f1-quick">
          <Link to="/app/f1/predicciones" className="dashboard-card">
            <FootballIcon />
            <h3>Mis predicciones</h3>
            <p>Top 10 por gran premio según tus pautas</p>
          </Link>
          <Link to="/app/f1/resultados" className="dashboard-card">
            <ChartIcon />
            <h3>Mis resultados</h3>
            <p>Puntaje acumulado y desempeño por carrera</p>
          </Link>
          <Link to="/app/ligas" className="dashboard-card">
            <UsersLeagueIcon />
            <h3>Mis ligas</h3>
            <p>Ligas privadas, invitaciones y clasificación</p>
          </Link>
          <Link to="/app/perfil" className="dashboard-card">
            <UserCircleIcon />
            <h3>Mi usuario</h3>
            <p>Cuenta, alias en rankings y cierre de sesión</p>
          </Link>
        </div>
      </section>

      <Link to="/app/f1/laboratorio" className="resultados-fab">
        Ajustar pautas F1 para la próxima carrera
      </Link>
    </>
  );
}
