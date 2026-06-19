import { useEffect, useMemo, useState } from "react";
import type { SystemHealthPayload } from "../lib/api";

const CHECK_GROUPS: { title: string; ids: string[] }[] = [
  {
    title: "Infraestructura",
    ids: ["database", "migrations", "platform_company"],
  },
  {
    title: "Integraciones",
    ids: ["mail", "oauth_google", "football_data_api", "openai_api", "frontend_url"],
  },
  {
    title: "Esquema y datos",
    ids: ["matches_seed", "prediction_history", "hidden_from_rankings", "jwt_secret"],
  },
];

type Props = {
  health: SystemHealthPayload | null;
  loading: boolean;
  onRefresh: () => void;
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PlatformSystemHealthPanel({ health, loading, onRefresh }: Props) {
  const [showDetail, setShowDetail] = useState(false);

  const failedChecks = useMemo(
    () => health?.checks.filter((c) => !c.ok) ?? [],
    [health]
  );

  useEffect(() => {
    if (failedChecks.length > 0) setShowDetail(true);
  }, [failedChecks.length, health?.checkedAt]);

  const groupedChecks = useMemo(() => {
    if (!health) return [];
    const byId = new Map(health.checks.map((c) => [c.id, c]));
    return CHECK_GROUPS.map((group) => ({
      title: group.title,
      checks: group.ids.map((id) => byId.get(id)).filter((c) => c != null),
    })).filter((g) => g.checks.length > 0);
  }, [health]);

  const ungrouped = useMemo(() => {
    if (!health) return [];
    const groupedIds = new Set(CHECK_GROUPS.flatMap((g) => g.ids));
    return health.checks.filter((c) => !groupedIds.has(c.id));
  }, [health]);

  return (
    <section className="admin-section platform-system-health">
      <div className="platform-system-health-header">
        <h2>Estado del sistema</h2>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => void onRefresh()}
          disabled={loading}
        >
          {loading ? "Comprobando…" : "Actualizar"}
        </button>
      </div>

      {loading && !health ? (
        <p className="placeholder-text">Comprobando base de datos, migraciones y configuración…</p>
      ) : health ? (
        <>
          <div className="platform-system-health-hero">
            <div
              className={`platform-system-health-status-card platform-system-health-status-card--${health.ok ? "ok" : "warn"}`}
            >
              <div className="platform-system-health-status-card-label">Estado general</div>
              <div className="platform-system-health-status-card-value">
                {health.ok ? "Operativo" : "Requiere atención"}
              </div>
              <div className="platform-system-health-status-card-sub">
                Verificado {formatCheckedAt(health.checkedAt)}
              </div>
            </div>
            <div className="platform-overview-cards platform-system-health-kpis">
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">Entorno</div>
                <div className="platform-overview-card-value platform-system-health-kpi-value">
                  {health.environment}
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">Uptime</div>
                <div className="platform-overview-card-value platform-system-health-kpi-value">
                  {formatUptime(health.uptimeSeconds)}
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">Migraciones</div>
                <div className="platform-overview-card-value platform-system-health-kpi-value">
                  {health.migrations.applied}
                  {health.migrations.expected > 0 ? `/${health.migrations.expected}` : ""}
                </div>
                {health.migrations.pending.length > 0 ? (
                  <div className="platform-overview-card-sub">
                    Pendientes: {health.migrations.pending.length}
                  </div>
                ) : (
                  <div className="platform-overview-card-sub">Todas aplicadas</div>
                )}
              </div>
            </div>
          </div>

          {failedChecks.length > 0 ? (
            <div className="platform-system-health-alerts" role="alert">
              <p className="platform-system-health-alerts-title">
                {failedChecks.length} comprobación{failedChecks.length === 1 ? "" : "es"} con problemas
              </p>
              <ul className="platform-system-health-alert-list">
                {failedChecks.map((check) => (
                  <li key={check.id}>
                    <strong>{check.label}</strong>
                    {check.detail ? ` — ${check.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="page-subtitle platform-system-health-ok-hint">
              Todos los servicios responden correctamente. Abrí el diagnóstico si necesitás revisar el detalle
              técnico.
            </p>
          )}

          <button
            type="button"
            className="btn-secondary btn-sm platform-system-health-toggle"
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
          >
            {showDetail ? "Ocultar diagnóstico" : "Ver diagnóstico completo"}
          </button>

          {showDetail ? (
            <div className="platform-system-health-detail">
              {groupedChecks.map((group) => (
                <div key={group.title} className="platform-system-health-group">
                  <h3 className="platform-metrics-group-title">{group.title}</h3>
                  <div className="platform-system-health-check-grid">
                    {group.checks.map((check) => (
                      <div
                        key={check.id}
                        className={`platform-system-health-check-card${check.ok ? "" : " platform-system-health-check-card--fail"}`}
                      >
                        <span
                          className={`platform-system-health-dot${check.ok ? " platform-system-health-dot--ok" : " platform-system-health-dot--fail"}`}
                          aria-hidden="true"
                        />
                        <div className="platform-system-health-check-body">
                          <div className="platform-system-health-check-label">{check.label}</div>
                          {check.detail ? (
                            <div className="platform-system-health-check-detail">{check.detail}</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {ungrouped.length > 0 ? (
                <div className="platform-system-health-group">
                  <h3 className="platform-metrics-group-title">Otros</h3>
                  <div className="platform-system-health-check-grid">
                    {ungrouped.map((check) => (
                      <div
                        key={check.id}
                        className={`platform-system-health-check-card${check.ok ? "" : " platform-system-health-check-card--fail"}`}
                      >
                        <span
                          className={`platform-system-health-dot${check.ok ? " platform-system-health-dot--ok" : " platform-system-health-dot--fail"}`}
                          aria-hidden="true"
                        />
                        <div className="platform-system-health-check-body">
                          <div className="platform-system-health-check-label">{check.label}</div>
                          {check.detail ? (
                            <div className="platform-system-health-check-detail">{check.detail}</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="placeholder-text">No se pudo cargar el estado del sistema.</p>
      )}
    </section>
  );
}
