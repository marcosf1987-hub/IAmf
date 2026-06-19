import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PlatformTimeSeriesPoint, PlatformTimeSeriesScope } from "../lib/api";

type Props = {
  data: PlatformTimeSeriesPoint[];
  loading: boolean;
  scope: PlatformTimeSeriesScope;
  onScopeChange: (scope: PlatformTimeSeriesScope) => void;
  reportScoped: boolean;
};

export default function PlatformActivityChart({
  data,
  loading,
  scope,
  onScopeChange,
  reportScoped,
}: Props) {
  return (
    <section className="admin-section platform-activity-chart">
      <div className="platform-activity-chart-header">
        <h2>Actividad a lo largo del tiempo</h2>
        <div className="platform-activity-chart-scope" role="group" aria-label="Alcance del gráfico">
          <button
            type="button"
            className={`btn-secondary btn-sm${scope === "platform" ? " platform-scope-active" : ""}`}
            onClick={() => onScopeChange("platform")}
          >
            Toda la plataforma
          </button>
          <button
            type="button"
            className={`btn-secondary btn-sm${scope === "pool" ? " platform-scope-active" : ""}`}
            onClick={() => onScopeChange("pool")}
          >
            Solo pool público
          </button>
        </div>
      </div>
      <p className="page-subtitle" style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
        Series acumuladas de altas, prompts IA y sesiones registradas.
        {reportScoped ? " Solo dentro del período seleccionado." : " Histórico completo."}
      </p>
      {loading ? (
        <div className="app-loading" style={{ minHeight: 200 }}>
          <div className="spinner" />
          <p>Cargando gráfico…</p>
        </div>
      ) : data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              stroke="var(--text-muted)"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              tickFormatter={(v) =>
                new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
              }
            />
            <YAxis stroke="var(--text-muted)" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              labelStyle={{ color: "var(--text)" }}
              labelFormatter={(v) => new Date(v).toLocaleDateString("es-AR")}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="users"
              name="Altas acumuladas"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ fill: "var(--accent)", r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="prompts"
              name="Prompts acumulados"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: "#8b5cf6", r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="logins"
              name="Sesiones acumuladas"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ fill: "#22c55e", r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="placeholder-text">Sin datos en el período seleccionado.</p>
      )}
    </section>
  );
}
