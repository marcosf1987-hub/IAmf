import { useCallback, useEffect, useState } from "react";
import DashboardWelcomeBand from "../components/DashboardWelcomeBand";
import F1HomeOverview from "../components/F1HomeOverview";
import FootballHomeOverview from "../components/FootballHomeOverview";
import { useAppDiscipline } from "../contexts/AppDisciplineContext";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchMyCompetitions,
  fetchMyResults,
  fetchProdeStatus,
  fetchResultsDashboard,
  type MineCompetitionsResponse,
  type ProdeStatus,
  type ResultsDashboard,
} from "../lib/api";

/** Inicio del primer partido */
const WORLD_CUP_START = new Date("2026-06-11T19:00:00Z");

export const DASHBOARD_TIPS = [
  "¿Sabías que un buen prompt debe incluir un rol? Prueba empezando con: «Actúa como un experto en estadísticas...»",
  "Da ejemplos a la IA: si quieres un formato específico, incluye un caso previo en tu prompt. Por ejemplo: «Básate en el resultado de la final 2022 (Arg 3 - Fra 3) para entender cómo ponderar el tiempo extra». La IA aprende mejor con referencias.",
  "Controla la creatividad: ¿quieres un análisis lógico o una sorpresa mundialista? Si usas una temperatura baja (0.2), la IA será conservadora y estadística. Con una temperatura alta (0.8), buscará resultados más disruptivos.",
  "Pídele que razone: antes del resultado final, escribe: «Explica tu razonamiento paso a paso antes de dar el marcador». Esto obliga a la IA a analizar variables lógicas antes de «arriesgar» un número.",
  "Evita alucinaciones: sé específico con lo que no quieres. Por ejemplo: «No consideres partidos amistosos de hace más de 5 años». Poner límites claros ayuda a que la IA no se pierda en datos irrelevantes.",
] as const;

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
  const { discipline } = useAppDiscipline();
  const [dashTab, setDashTab] = useState<"football" | "f1">(() => (discipline === "f1" ? "f1" : "football"));

  useEffect(() => {
    setDashTab(discipline === "f1" ? "f1" : "football");
  }, [discipline]);

  const [prodeStatus, setProdeStatus] = useState<ProdeStatus | null>(null);
  const [mine, setMine] = useState<MineCompetitionsResponse | null>(null);
  const [resultsDash, setResultsDash] = useState<ResultsDashboard | null>(null);
  const [totalHits, setTotalHits] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tipIndex] = useState(() => Math.floor(Math.random() * DASHBOARD_TIPS.length));
  const [f1DashStatusLine, setF1DashStatusLine] = useState("");
  const onF1DashboardStatus = useCallback((line: string) => {
    setF1DashStatusLine(line);
  }, []);

  useEffect(() => {
    if (dashTab !== "f1") setF1DashStatusLine("");
  }, [dashTab]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      const disc = dashTab === "f1" ? "f1" : "football";
      try {
        const mineRes = await fetchMyCompetitions(disc);
        if (cancelled) return;
        setMine(mineRes);

        if (dashTab === "football") {
          const [statusRes, resultsRes, dash] = await Promise.all([
            fetchProdeStatus(),
            fetchMyResults(),
            fetchResultsDashboard("football").catch(() => EMPTY_DASH),
          ]);
          if (cancelled) return;
          setProdeStatus(statusRes);
          setTotalHits(resultsRes.totalHits);
          setResultsDash(dash);
        } else {
          setProdeStatus(null);
          setTotalHits(null);
          setResultsDash(EMPTY_DASH);
        }
      } catch {
        if (cancelled) return;
        setProdeStatus(
          dashTab === "football"
            ? { hasGuidelines: false, hasPredictions: false, guidelinesVersion: 1 }
            : null
        );
        setMine({
          competitions: [],
          quota: { scope: "user", createdByMe: 0, maxCreatedByMe: null, companyTotal: null, maxCompany: null },
        });
        setResultsDash(EMPTY_DASH);
        setLoadError("No se pudo cargar el resumen. Reintentá en unos segundos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [dashTab]);

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

  return (
    <div className="dashboard">
      <DashboardWelcomeBand
        displayName={displayName}
        dashTab={dashTab}
        footballStatusLine={getModelStatusText()}
        f1StatusLineFromDashboard={f1DashStatusLine}
      />

      {loadError ? <div className="auth-error dashboard-load-error">{loadError}</div> : null}

      {dashTab === "football" ? (
        <FootballHomeOverview
          prodeStatus={prodeStatus}
          mine={mine}
          resultsDash={dash}
          totalHits={totalHits}
          worldCupStarted={worldCupStarted}
          tipIndex={tipIndex}
          tips={DASHBOARD_TIPS}
          modelReady={modelReady}
          hasAnyLeague={hasAnyLeague}
          leagueRankRows={leagueRankRows}
          rankingLabel={rankingLabel}
        />
      ) : (
        <F1HomeOverview leagueSummaries={mine?.competitions} onStatusLine={onF1DashboardStatus} />
      )}
    </div>
  );
}
