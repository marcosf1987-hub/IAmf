import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  fetchF1MySummary,
  fetchResultsDashboard,
  formatApiError,
  type F1SummaryByRace,
  type ResultsDashboard,
} from "../../lib/api";
import { ligaDetailPath } from "../../lib/discipline-paths";

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
  showGlobalRanking: true,
};

export default function F1ResultadosPage() {
  const { t } = useTranslation("f1");
  const [summary, setSummary] = useState<{ totalPoints: number; byRace: F1SummaryByRace[] } | null>(null);
  const [dash, setDash] = useState<ResultsDashboard>(EMPTY_DASH);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, d] = await Promise.all([
          fetchF1MySummary(),
          fetchResultsDashboard("f1").catch(() => EMPTY_DASH),
        ]);
        if (!cancelled) {
          setSummary(s);
          setDash(d);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setSummary({ totalPoints: 0, byRace: [] });
          setDash(EMPTY_DASH);
          setError(formatApiError(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="f1-page-inner">
        <div className="app-loading">
          <div className="spinner" />
          <p>Cargando resultados F1…</p>
        </div>
      </div>
    );
  }

  const { competitionLeaderboards, myRank, totalParticipants, showGlobalRanking } = dash;

  return (
    <div className="f1-page-inner resultados-page">
      <h2 className="f1-page-title">{t("resultsPageTitle")}</h2>
      <p className="resultados-f1-rules">
        Puntuación: <strong>1</strong> punto por cada piloto incluido en el top 10 (aunque esté en otra posición),{" "}
        <strong>+10</strong> extra por ganador correcto (P1 exacto), y <strong>+5</strong> extra por P2/P3 exactos. Datos
        oficiales vía OpenF1.
      </p>
      {error ? <div className="auth-error">{error}</div> : null}
      {summary != null ? (
        <>
          <div className="resultados-f1-metric">
            <span className="resultados-f1-metric-value">{summary.totalPoints}</span>
            <span className="resultados-f1-metric-label">Puntos totales F1</span>
          </div>
          {showGlobalRanking && myRank != null && totalParticipants > 0 ? (
            <p className="resultados-f1-global-rank">
              Ranking global F1: <strong>#{myRank}</strong> de {totalParticipants}
            </p>
          ) : null}
          {summary.byRace.length > 0 ? (
            <div className="resultados-f1-table-wrap">
              <table className="resultados-table">
                <thead>
                  <tr>
                    <th>Carrera</th>
                    <th>Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byRace.map((row) => (
                    <tr key={row.raceId}>
                      <td>{row.label}</td>
                      <td>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="placeholder-text">
              Aún no sumás puntos F1 con carreras ya cerradas y resultado oficial.
            </p>
          )}
        </>
      ) : null}

      {competitionLeaderboards.length > 0 ? (
        <section className="resultados-table-section resultados-competitions">
          <h2 className="resultados-competitions-title">Rankings por liga</h2>
          <p className="resultados-competitions-lead">Solo ligas de Fórmula 1 en las que participás.</p>
          {competitionLeaderboards.map((block) => (
            <div key={block.id} className="resultados-competition-block">
              <h3 className="resultados-competition-name">
                <Link to={ligaDetailPath("f1", block.id)}>{block.name}</Link>
              </h3>
              <p className="resultados-competition-meta">
                Tu posición: <strong>#{block.myRank ?? "—"}</strong> de {block.totalParticipants}
              </p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
