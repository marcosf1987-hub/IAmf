import { useState } from "react";
import { downloadPlatformExport, formatApiError, type PlatformReportRange } from "../lib/api";

type ExportType = "users" | "prompts" | "logins";

type Props = {
  reportRange: PlatformReportRange;
  userFilter?: string;
  companyFilter?: string;
  /** Solo muestra el botón de usuarios (para la barra de la tabla). */
  usersOnly?: boolean;
};

function reportRangeQuery(range: PlatformReportRange): { from?: string; to?: string } {
  if (range === "all") return {};
  return { from: range.from, to: range.to };
}

export default function PlatformExportsPanel({
  reportRange,
  userFilter,
  companyFilter,
  usersOnly = false,
}: Props) {
  const [loading, setLoading] = useState<ExportType | null>(null);
  const [err, setErr] = useState("");

  async function handleDownload(type: ExportType) {
    setErr("");
    setLoading(type);
    try {
      await downloadPlatformExport(type, {
        ...reportRangeQuery(reportRange),
        q: userFilter?.trim() || undefined,
        company: companyFilter?.trim() || undefined,
      });
    } catch (e) {
      setErr(formatApiError(e) || "Error al descargar");
    } finally {
      setLoading(null);
    }
  }

  if (usersOnly) {
    return (
      <>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => void handleDownload("users")}
          disabled={!!loading}
        >
          {loading === "users" ? "Exportando…" : "Exportar usuarios CSV"}
        </button>
        {err ? <span className="auth-error" style={{ fontSize: "0.85rem" }}>{err}</span> : null}
      </>
    );
  }

  return (
    <section className="admin-section">
      <h2>Exportar reportes</h2>
      <p className="page-subtitle" style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
        {reportRange === "all"
          ? "CSV de toda la plataforma (histórico completo)."
          : `CSV filtrado al período del reporte (${reportRange.from} — ${reportRange.to}).`}
        {userFilter || companyFilter
          ? " Respeta también los filtros de búsqueda/empresa activos en Usuarios."
          : ""}
      </p>
      {err ? <div className="auth-error">{err}</div> : null}
      <div className="admin-exports">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleDownload("users")}
          disabled={!!loading}
        >
          {loading === "users" ? "Descargando…" : "Usuarios"}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleDownload("prompts")}
          disabled={!!loading}
        >
          {loading === "prompts" ? "Descargando…" : "Prompts"}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleDownload("logins")}
          disabled={!!loading}
        >
          {loading === "logins" ? "Descargando…" : "Sesiones"}
        </button>
      </div>
      <p className="page-subtitle" style={{ marginTop: "0.75rem", marginBottom: 0, fontSize: "0.85rem" }}>
        El CSV de usuarios incluye métricas de actividad (sesiones, prompts, predicciones) según el período
        seleccionado.
      </p>
    </section>
  );
}
