import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { F1SummaryByRace, LeaderboardEntry, ResultsDashboard } from "../lib/api";
import { fetchF1MySummary, fetchResultsDashboard, formatApiError } from "../lib/api";
import { EmptyState } from "../components/EmptyState";

function RankArrow({ change }: { change: number }) {
  if (change > 0) {
    return <span className="rank-arrow rank-up" aria-label="Subió puestos">↑</span>;
  }
  if (change < 0) {
    return <span className="rank-arrow rank-down" aria-label="Bajó puestos">↓</span>;
  }
  return <span className="rank-arrow rank-same">—</span>;
}

const EMPTY_DATA: ResultsDashboard = {
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

export default function ResultadosPage() {
  const [data, setData] = useState<ResultsDashboard | null>(null);
  const [f1Summary, setF1Summary] = useState<{ totalPoints: number; byRace: F1SummaryByRace[] } | null>(null);
  const [f1Error, setF1Error] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchResultsDashboard();
        setData(res);
        try {
          const f1 = await fetchF1MySummary();
          setF1Summary(f1);
          setF1Error("");
        } catch (e) {
          setF1Summary({ totalPoints: 0, byRace: [] });
          setF1Error(formatApiError(e));
        }
      } catch (err) {
        setError(formatApiError(err));
        setData(EMPTY_DATA);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="page-content">
        <div className="app-loading">
          <div className="spinner" />
          <p>Cargando resultados…</p>
        </div>
      </div>
    );
  }

  const {
    totalHits,
    precision,
    leaderboard,
    myRank,
    totalParticipants,
    rankChange,
    pointsOverTime,
  } = data ?? EMPTY_DATA;
  const competitionLeaderboards = data?.competitionLeaderboards ?? [];

  // Tabla: top 5, mi posición, últimos 5 (orden: 1,2,3,4,5, yo, n-4,n-3,n-2,n-1,n)
  const n = totalParticipants;
  const rankToEntry = new Map(leaderboard.map((e) => [e.rank, e]));

  const ranksOrder = [1, 2, 3, 4, 5, ...(myRank != null && myRank > 5 && myRank < n - 4 ? [myRank] : []), ...(n >= 5 ? [n - 4, n - 3, n - 2, n - 1, n] : [])];
  const seen = new Set<number>();
  const tableRows: (LeaderboardEntry & { isMe?: boolean })[] = [];
  for (const rank of ranksOrder) {
    if (seen.has(rank)) continue;
    seen.add(rank);
    const e = rankToEntry.get(rank);
    if (e) tableRows.push({ ...e, isMe: e.rank === myRank });
  }

  return (
    <div className="page-content resultados-page">
      <h1>Mis resultados</h1>

      {error && <div className="auth-error">{error}</div>}

      <section className="resultados-f1-section" aria-labelledby="resultados-f1-heading">
        <h2 id="resultados-f1-heading">Fórmula 1</h2>
        <p className="resultados-f1-rules">
          Puntuación F1 (top 10): <strong>10 puntos</strong> por acertar el ganador (P1), <strong>5 puntos</strong> por
          cada acierto en P2 y P3, y <strong>1 punto</strong> por cada piloto correcto en las posiciones P4 a P10. Fuera
          del top 10 no suma. Los resultados oficiales se toman de OpenF1.
        </p>
        {f1Error ? <div className="auth-error">{f1Error}</div> : null}
        {f1Summary != null ? (
          <>
            <div className="resultados-f1-metric">
              <span className="resultados-f1-metric-value">{f1Summary.totalPoints}</span>
              <span className="resultados-f1-metric-label">Puntos totales F1</span>
            </div>
            {f1Summary.byRace.length > 0 ? (
              <div className="resultados-f1-table-wrap">
                <table className="resultados-table">
                  <thead>
                    <tr>
                      <th>Carrera</th>
                      <th>Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f1Summary.byRace.map((row) => (
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
                Aún no sumás puntos F1: cuando haya carreras con resultado oficial y tu predicción guardada, aparecerán
                aquí.
              </p>
            )}
          </>
        ) : null}
      </section>

      <div className="resultados-metrics">
        <div className="resultados-metric">
          <span className="resultados-metric-value">{totalHits}</span>
          <span className="resultados-metric-label">Puntos Totales</span>
        </div>
        <div className="resultados-metric">
          <span className="resultados-metric-value">{precision}%</span>
          <span className="resultados-metric-label">Precisión del Prompt</span>
        </div>
        <div className="resultados-metric resultados-metric-rank">
          <span className="resultados-metric-value">
            #{myRank ?? "—"} de {totalParticipants}
            {myRank != null && <RankArrow change={rankChange} />}
          </span>
          <span className="resultados-metric-label">Ranking Global</span>
        </div>
      </div>

      <section className="resultados-chart-section">
        <h2>Evolución de puntaje</h2>
        <div className="resultados-chart">
          {pointsOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={pointsOverTime} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                />
                <YAxis
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                  labelFormatter={(v) => new Date(v).toLocaleDateString("es-AR")}
                  formatter={(value) => [`${value ?? 0} puntos`, "Puntos"]}
                />
                <Line
                  type="monotone"
                  dataKey="points"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ fill: "var(--accent)", r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="resultados-chart-empty">
              <p>Aún no hay partidos con resultado. Tu evolución aparecerá aquí cuando se carguen resultados.</p>
            </div>
          )}
        </div>
      </section>

      <section className="resultados-table-section">
        <h2>Ranking</h2>
        {tableRows.length > 0 ? (
          <div className="resultados-table-wrapper">
            <table className="resultados-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Usuario</th>
                  <th>Puntos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((e) => (
                  <tr key={e.userId} className={e.isMe ? "resultados-row-me" : ""}>
                    <td>{e.rank}</td>
                    <td>{e.alias}</td>
                    <td>{e.hits}</td>
                    <td><RankArrow change={e.rankChange ?? 0} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Todavía no hay ranking"
            description="Cuando haya partidos con resultado cargado, tu posición y la de tu empresa aparecerán aquí."
            action={<Link to="/app/prode" className="btn-primary">Ir a Mis predicciones</Link>}
          />
        )}
      </section>

      {competitionLeaderboards.length > 0 && (
        <section className="resultados-table-section resultados-competitions">
          <h2 className="resultados-competitions-title">Rankings por liga</h2>
          <p className="resultados-competitions-lead">
            Mismas predicciones que en el ranking global; aquí comparás solo con quienes están en cada competencia.
          </p>
          {competitionLeaderboards.map((block) => {
            const nBlock = block.totalParticipants;
            const rankMap = new Map(block.leaderboard.map((e) => [e.rank, e]));
            const order = [
              1, 2, 3, 4, 5,
              ...(block.myRank != null && block.myRank > 5 && block.myRank < nBlock - 4 ? [block.myRank] : []),
              ...(nBlock >= 5 ? [nBlock - 4, nBlock - 3, nBlock - 2, nBlock - 1, nBlock] : []),
            ];
            const seenB = new Set<number>();
            const rows: (LeaderboardEntry & { isMe?: boolean })[] = [];
            for (const r of order) {
              if (seenB.has(r)) continue;
              seenB.add(r);
              const e = rankMap.get(r);
              if (e) rows.push({ ...e, isMe: e.rank === block.myRank });
            }
            return (
              <div key={block.id} className="resultados-competition-block">
                <h3 className="resultados-competition-name">{block.name}</h3>
                <p className="resultados-competition-meta">
                  Tu posición: <strong>#{block.myRank ?? "—"}</strong> de {block.totalParticipants}
                  {block.myRank != null && <RankArrow change={block.rankChange} />}
                </p>
                <div className="resultados-table-wrapper">
                  <table className="resultados-table">
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>Usuario</th>
                        <th>Puntos</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length > 0 ? (
                        rows.map((e) => (
                          <tr key={e.userId} className={e.isMe ? "resultados-row-me" : ""}>
                            <td>{e.rank}</td>
                            <td>{e.alias}</td>
                            <td>{e.hits}</td>
                            <td>
                              <RankArrow change={e.rankChange ?? 0} />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="resultados-table-empty">
                            Sin datos de ranking para esta liga.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <Link to="/app/ia" className="resultados-fab">
        Ajustar mi Prompt para la próxima fase
      </Link>
    </div>
  );
}
