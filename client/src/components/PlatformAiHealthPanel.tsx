import type { PlatformAiHealth } from "../lib/api";

const STATUS_LABEL: Record<PlatformAiHealth["recentBatches"][0]["status"], string> = {
  ok: "OK",
  partial: "Parcial",
  failed: "Falló",
};

type Props = {
  data: PlatformAiHealth | null;
  loading: boolean;
};

export default function PlatformAiHealthPanel({ data, loading }: Props) {
  if (loading && !data) {
    return <p className="placeholder-text">Cargando salud IA…</p>;
  }
  if (!data) {
    return <p className="placeholder-text">No se pudo cargar la salud IA.</p>;
  }

  const { batches, predictions } = data;

  return (
    <section className="admin-section platform-ai-health">
      <h2>Salud IA (generación Prode)</h2>
      <p className="page-subtitle" style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
        Cada fila es un lote de generación con IA. <strong>Parcial</strong> indica que hubo prompts de
        respaldo (fallback) antes de guardar predicciones.
        {data.range
          ? ` Período: ${data.range.from} — ${data.range.to} (UTC).`
          : " Histórico completo."}
      </p>

      <div className="platform-overview-cards">
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Lotes IA</div>
          <div className="platform-overview-card-value">{batches.total}</div>
          <div className="platform-overview-card-sub">
            OK {batches.ok} · Parcial {batches.partial} · Falló {batches.failed}
          </div>
        </div>
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Tasa con guardados</div>
          <div className="platform-overview-card-value">{batches.successRate}%</div>
          <div className="platform-overview-card-sub">Lotes con al menos 1 predicción guardada</div>
        </div>
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Predicciones vía IA</div>
          <div className="platform-overview-card-value">{predictions.savedViaAi}</div>
        </div>
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Usuarios con IA</div>
          <div className="platform-overview-card-value">{predictions.usersWithAiGeneration}</div>
          <div className="platform-overview-card-sub">{predictions.prodePrompts} prompts Prode</div>
        </div>
      </div>

      {data.recentBatches.length > 0 ? (
        <div className="admin-table-wrap" style={{ marginTop: "1rem", maxHeight: 320 }}>
          <table className="admin-table platform-ai-health-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Fase</th>
                <th>Estado</th>
                <th>Guardados</th>
                <th>Prompts</th>
              </tr>
            </thead>
            <tbody>
              {data.recentBatches.map((row) => (
                <tr key={row.batchId}>
                  <td>
                    {new Date(row.createdAt).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td title={row.userEmail}>{row.userEmail}</td>
                  <td>{row.phaseLabel ?? "—"}</td>
                  <td>
                    <span className={`platform-ai-status platform-ai-status--${row.status}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td>{row.savedCount}</td>
                  <td>{row.promptCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="placeholder-text" style={{ marginTop: "1rem" }}>
          Sin generaciones IA en el período seleccionado.
        </p>
      )}
    </section>
  );
}
