import { useEffect, useState } from "react";
import { fetchF1MySummary, formatApiError, type F1SummaryByRace } from "../../lib/api";

export default function F1ResultadosPage() {
  const [summary, setSummary] = useState<{ totalPoints: number; byRace: F1SummaryByRace[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchF1MySummary();
        if (!cancelled) {
          setSummary(s);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setSummary({ totalPoints: 0, byRace: [] });
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

  return (
    <div className="f1-page-inner resultados-page">
      <h2 className="f1-page-title">Resultados F1</h2>
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
    </div>
  );
}
