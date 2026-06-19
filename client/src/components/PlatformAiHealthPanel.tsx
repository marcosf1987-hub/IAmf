import { Fragment, useState } from "react";
import type { PlatformAiHealth } from "../lib/api";

type BatchRow = PlatformAiHealth["recentBatches"][0];

const STATUS_LABEL: Record<BatchRow["status"], string> = {
  ok: "OK",
  partial: "Parcial",
  failed: "Falló",
};

const DETAIL_STATUS_LABEL: Record<NonNullable<BatchRow["detailStatus"]>, string> = {
  ok: "OK",
  partial: "Parcial",
  parse_failed: "Parseo fallido",
  ai_error: "Error IA",
};

function BatchDetail({ row }: { row: BatchRow }) {
  if (!row.hasPersistedDiagnostics && !row.errorSummary) {
    return (
      <p className="page-subtitle" style={{ margin: 0, fontSize: "0.85rem" }}>
        Lote anterior a diagnósticos persistidos. Se infiere el estado por prompts y guardados.
      </p>
    );
  }

  return (
    <div className="platform-ai-batch-detail">
      <div className="platform-ai-batch-detail-meta">
        {row.provider ? (
          <span>
            <strong>Proveedor:</strong> {row.provider}
            {row.model ? ` · ${row.model}` : ""}
          </span>
        ) : null}
        {row.requested > 0 ? (
          <span>
            <strong>Flujo:</strong> {row.parsed}/{row.requested} parseados · {row.savedCount} guardados
          </span>
        ) : null}
        {row.detailStatus ? (
          <span>
            <strong>Diagnóstico:</strong> {DETAIL_STATUS_LABEL[row.detailStatus]}
          </span>
        ) : null}
      </div>
      {row.errorSummary ? (
        <p className="platform-ai-batch-detail-errors">{row.errorSummary}</p>
      ) : null}
      {row.scopes && row.scopes.length > 0 ? (
        <div className="admin-table-wrap" style={{ marginTop: "0.5rem" }}>
          <table className="admin-table platform-ai-health-table">
            <thead>
              <tr>
                <th>Ámbito</th>
                <th>Estado</th>
                <th>Parseados</th>
                <th>Guardados</th>
                <th>Errores</th>
              </tr>
            </thead>
            <tbody>
              {row.scopes.map((scope) => (
                <tr key={scope.scopeLabel}>
                  <td>{scope.scopeLabel}</td>
                  <td>{DETAIL_STATUS_LABEL[scope.status]}</td>
                  <td>
                    {scope.parsed}/{scope.requested}
                  </td>
                  <td>{scope.saved}</td>
                  <td>{scope.errors.length > 0 ? scope.errors.join(" · ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  data: PlatformAiHealth | null;
  loading: boolean;
};

export default function PlatformAiHealthPanel({ data, loading }: Props) {
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

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
        Cada fila es un lote de generación con IA. Los lotes nuevos guardan diagnóstico detallado (ámbito,
        parseo, errores). Hacé clic en una fila para ver el detalle.
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
        <div className="admin-table-wrap" style={{ marginTop: "1rem", maxHeight: 420 }}>
          <table className="admin-table platform-ai-health-table">
            <thead>
              <tr>
                <th aria-hidden="true" />
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Fase</th>
                <th>Estado</th>
                <th>Guardados</th>
                <th>Prompts</th>
                <th>Modelo</th>
              </tr>
            </thead>
            <tbody>
              {data.recentBatches.map((row) => {
                const expanded = expandedBatchId === row.batchId;
                return (
                  <Fragment key={row.batchId}>
                    <tr
                      className={`platform-ai-batch-row${expanded ? " platform-ai-batch-row--open" : ""}`}
                      onClick={() => setExpandedBatchId(expanded ? null : row.batchId)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="platform-ai-batch-expand" aria-hidden="true">
                        {expanded ? "▾" : "▸"}
                      </td>
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
                        <span
                          className={`platform-ai-status platform-ai-status--${row.status}`}
                          title={row.detailStatus ? DETAIL_STATUS_LABEL[row.detailStatus] : undefined}
                        >
                          {row.detailStatus
                            ? DETAIL_STATUS_LABEL[row.detailStatus]
                            : STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td>
                        {row.requested > 0
                          ? `${row.savedCount}/${row.requested}`
                          : row.savedCount}
                      </td>
                      <td>{row.promptCount}</td>
                      <td>{row.model ?? "—"}</td>
                    </tr>
                    {expanded ? (
                      <tr className="platform-ai-batch-detail-row">
                        <td colSpan={8}>
                          <BatchDetail row={row} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
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
