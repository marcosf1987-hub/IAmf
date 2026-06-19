import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import PlatformConfigSection from "../components/PlatformConfigSection";
import PlatformCompanyDrawer from "../components/PlatformCompanyDrawer";
import PlatformAiHealthPanel from "../components/PlatformAiHealthPanel";
import PlatformDateRangeBar from "../components/PlatformDateRangeBar";
import PlatformRetentionCards from "../components/PlatformRetentionCards";
import PlatformActivityChart from "../components/PlatformActivityChart";
import PlatformExportsPanel from "../components/PlatformExportsPanel";
import {
  createPlatformCompany,
  deletePlatformUser,
  formatApiError,
  fetchPlatformAiConfig,
  fetchPlatformAiHealth,
  fetchPlatformCompanies,
  fetchPlatformMatchResultsSyncStatus,
  fetchPlatformOverview,
  fetchPlatformSettings,
  fetchPlatformSystemHealth,
  fetchPlatformTimeSeries,
  fetchPlatformUsers,
  patchPlatformCompany,
  resetPlatformOrgAdminPassword,
  setPlatformUserHiddenFromRankings,
  syncPlatformMatchResults,
  transferPlatformUserToCompany,
  updatePlatformAiConfig,
  updatePlatformSettings,
  type AiConfig,
  type FootballDataSyncStatus,
  type SyncMatchResultsResponse,
  type CompanyCompetitionScope,
  type PlatformCompanyRow,
  type PlatformAiHealth,
  type PlatformOverview,
  type PlatformReportRange,
  type PlatformTimeSeriesPoint,
  type PlatformTimeSeriesScope,
  type PlatformUserRow,
  type SystemHealthPayload,
} from "../lib/api";
import { scopeLabel } from "../lib/company-competition-scope";

type CompanyFilterOption = { value: string; label: string };

function reportRangeQuery(range: PlatformReportRange): { from?: string; to?: string } {
  if (range === "all") return {};
  return { from: range.from, to: range.to };
}

function overviewIsScoped(overview: PlatformOverview | null): boolean {
  return overview?.range != null;
}

function CompanyFilterCombobox({
  value,
  onChange,
  options,
  onApply,
}: {
  value: string;
  onChange: (next: string) => void;
  options: CompanyFilterOption[];
  onApply: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="platform-company-combobox" ref={rootRef}>
      <input
        type="search"
        className="admin-input-inline platform-company-combobox-input"
        placeholder="Empresa (buscar o elegir)…"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setOpen(false);
            onApply();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        autoComplete="off"
      />
      {open && filtered.length > 0 ? (
        <ul className="platform-company-combobox-menu" role="listbox">
          {filtered.map((o) => (
            <li key={`${o.value}-${o.label}`}>
              <button
                type="button"
                role="option"
                className="platform-company-combobox-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type PlatformAdminTab = "resumen" | "usuarios" | "empresas" | "config" | "operaciones";

export default function PlatformAdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<PlatformAdminTab>("resumen");
  const [companies, setCompanies] = useState<PlatformCompanyRow[]>([]);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [platformUsers, setPlatformUsers] = useState<PlatformUserRow[]>([]);
  const [platformUsersTotal, setPlatformUsersTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    adminEmail: "",
    adminPassword: "",
    seatLimit: 50,
  });
  const [submitting, setSubmitting] = useState(false);
  const [defaultScope, setDefaultScope] = useState<CompanyCompetitionScope>("all");
  const [defaultScopeDraft, setDefaultScopeDraft] = useState<CompanyCompetitionScope>("all");
  const [savingDefaultScope, setSavingDefaultScope] = useState(false);
  const [companyDrawer, setCompanyDrawer] = useState<PlatformCompanyRow | null>(null);

  const [transferTarget, setTransferTarget] = useState<{ userId: string; email: string } | null>(null);
  const [transferCompanyId, setTransferCompanyId] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);

  const [userFilter, setUserFilter] = useState("");
  const [userFilterDraft, setUserFilterDraft] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [companyFilterDraft, setCompanyFilterDraft] = useState("");
  const [platformAiConfig, setPlatformAiConfig] = useState<AiConfig | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncMatchResultsResponse | null>(null);
  const [matchSyncFullScan, setMatchSyncFullScan] = useState(true);
  const [matchSyncStatus, setMatchSyncStatus] = useState<FootballDataSyncStatus | null>(null);
  const [userActionBusy, setUserActionBusy] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthPayload | null>(null);
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
  const [aiHealth, setAiHealth] = useState<PlatformAiHealth | null>(null);
  const [aiHealthLoading, setAiHealthLoading] = useState(false);
  const [reportRange, setReportRange] = useState<PlatformReportRange>("all");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [rangeAllTime, setRangeAllTime] = useState(true);
  const [chartScope, setChartScope] = useState<PlatformTimeSeriesScope>("platform");
  const [timeSeries, setTimeSeries] = useState<PlatformTimeSeriesPoint[]>([]);
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false);

  const reportRangeHint = useMemo(() => {
    if (reportRange === "all") return "Histórico completo (sin filtro de fechas)";
    return `Actividad entre ${reportRange.from} y ${reportRange.to} (UTC, día calendario)`;
  }, [reportRange]);

  const companyFilterOptions = useMemo<CompanyFilterOption[]>(
    () => [
      { value: "", label: "Todas las empresas" },
      { value: "platform-internal", label: "Pool público (platform-internal)" },
      ...companies.map((c) => ({ value: c.slug, label: `${c.name} (${c.slug})` })),
    ],
    [companies]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setAiHealthLoading(true);
    setError("");
    const rangeQs = reportRangeQuery(reportRange);
    try {
      const [{ companies: list }, ov, usersRes, aiRes, settings, syncStatus, aiHealthRes] =
        await Promise.all([
          fetchPlatformCompanies(),
          fetchPlatformOverview(rangeQs),
          fetchPlatformUsers({ limit: 100, q: userFilter, company: companyFilter, ...rangeQs }),
          fetchPlatformAiConfig(),
          fetchPlatformSettings(),
          fetchPlatformMatchResultsSyncStatus(),
          fetchPlatformAiHealth(rangeQs),
        ]);
      setCompanies(list);
      setOverview(ov);
      setPlatformUsers(usersRes.users);
      setPlatformUsersTotal(usersRes.total);
      setPlatformAiConfig(aiRes.config);
      setMatchSyncStatus(syncStatus);
      setAiHealth(aiHealthRes);
      setDefaultScope(settings.defaultCompetitionScope);
      setDefaultScopeDraft(settings.defaultCompetitionScope);
    } catch (e) {
      setError(formatApiError(e) || "Error al cargar");
      setCompanies([]);
      setOverview(null);
      setPlatformUsers([]);
      setPlatformUsersTotal(0);
      setMatchSyncStatus(null);
      setAiHealth(null);
    } finally {
      setLoading(false);
      setAiHealthLoading(false);
    }
  }, [userFilter, companyFilter, reportRange]);

  const reloadTimeSeries = useCallback(async () => {
    setTimeSeriesLoading(true);
    try {
      const rangeQs = reportRangeQuery(reportRange);
      const res = await fetchPlatformTimeSeries({ ...rangeQs, scope: chartScope });
      setTimeSeries(res.data);
    } catch {
      setTimeSeries([]);
    } finally {
      setTimeSeriesLoading(false);
    }
  }, [reportRange, chartScope]);

  useEffect(() => {
    if (tab === "resumen" || tab === "usuarios") {
      void reloadTimeSeries();
    }
  }, [tab, reloadTimeSeries]);

  function applyReportRange() {
    if (rangeAllTime) {
      setReportRange("all");
      return;
    }
    if (!fromInput || !toInput) {
      setError("Indicá fecha desde y hasta, o marcá todo el período.");
      return;
    }
    setError("");
    setReportRange({ from: fromInput, to: toInput });
  }

  const reloadSystemHealth = useCallback(async () => {
    setSystemHealthLoading(true);
    try {
      const health = await fetchPlatformSystemHealth();
      setSystemHealth(health);
    } catch (e) {
      setSystemHealth(null);
      setError(formatApiError(e));
    } finally {
      setSystemHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadSystemHealth();
  }, [reloadSystemHealth]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccessMsg("");
    try {
      await createPlatformCompany({
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword,
        seatLimit: form.seatLimit,
      });
      setForm({ name: "", slug: "", adminEmail: "", adminPassword: "", seatLimit: 50 });
      await reload();
    } catch (err) {
      setError(formatApiError(err) || "Error al crear empresa");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCompanySettings(
    companyId: string,
    data: { competitionScope?: CompanyCompetitionScope; seatLimit?: number }
  ) {
    setError("");
    setSuccessMsg("");
    await patchPlatformCompany(companyId, data);
    setSuccessMsg("Configuración de empresa guardada.");
    await reload();
  }

  async function saveDefaultScope(e: React.FormEvent) {
    e.preventDefault();
    setSavingDefaultScope(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await updatePlatformSettings({ defaultCompetitionScope: defaultScopeDraft });
      setDefaultScope(res.defaultCompetitionScope);
      setSuccessMsg("Valor por defecto para nuevas empresas guardado.");
    } catch (err) {
      setError(formatApiError(err) || "Error al guardar valor por defecto");
    } finally {
      setSavingDefaultScope(false);
    }
  }

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transferTarget || !transferCompanyId) return;
    setError("");
    setSuccessMsg("");
    const emailLabel = transferTarget.email;
    const companyName = companies.find((c) => c.id === transferCompanyId)?.name ?? "empresa";
    setTransferBusy(true);
    try {
      await transferPlatformUserToCompany(transferTarget.userId, transferCompanyId);
      setTransferTarget(null);
      setTransferCompanyId("");
      setSuccessMsg(`${emailLabel} movido a ${companyName} como member (fuera del pool y liga universal pública).`);
      await reload();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes("seats_exceeded")) {
        setError("La empresa destino no tiene cupos disponibles.");
      } else if (raw.includes("not_found")) {
        setError("Solo se pueden mover usuarios del pool público que estén activos.");
      } else if (raw.includes("invalid_target")) {
        setError("Empresa destino no válida.");
      } else {
        setError(formatApiError(err));
      }
    } finally {
      setTransferBusy(false);
    }
  }

  function cancelTransfer() {
    setTransferTarget(null);
    setTransferCompanyId("");
  }

  async function handleAdminPasswordReset(userId: string, password: string) {
    const admin = companyDrawer?.orgAdmins.find((a) => a.id === userId);
    await resetPlatformOrgAdminPassword(userId, password);
    setSuccessMsg(`Contraseña restablecida para ${admin?.email ?? "el administrador"}.`);
  }

  async function toggleUserHiddenFromRankings(userId: string, hidden: boolean, email: string) {
    setUserActionBusy(userId);
    setError("");
    try {
      await setPlatformUserHiddenFromRankings(userId, hidden);
      setPlatformUsers((list) =>
        list.map((u) => (u.id === userId ? { ...u, hiddenFromRankings: hidden } : u))
      );
      setSuccessMsg(
        hidden
          ? `${email} oculto de los rankings.`
          : `${email} vuelve a aparecer en los rankings.`
      );
    } catch (err) {
      setError(formatApiError(err) || "Error al actualizar visibilidad");
    } finally {
      setUserActionBusy(null);
    }
  }

  async function removePlatformUser(userId: string, email: string) {
    if (
      !window.confirm(
        `¿Eliminar permanentemente a ${email}? Se borran sus datos y ligas que creó. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setUserActionBusy(userId);
    setError("");
    try {
      await deletePlatformUser(userId);
      setPlatformUsers((list) => list.filter((u) => u.id !== userId));
      setPlatformUsersTotal((n) => Math.max(0, n - 1));
      setSuccessMsg(`Usuario ${email} eliminado.`);
    } catch (err) {
      setError(formatApiError(err) || "Error al eliminar usuario");
    } finally {
      setUserActionBusy(null);
    }
  }

  async function runMatchResultsSync() {
    setSyncBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await syncPlatformMatchResults({ fullScan: matchSyncFullScan });
      setSyncResult(res);
      setSuccessMsg(res.message);
      const status = await fetchPlatformMatchResultsSyncStatus();
      setMatchSyncStatus(status);
    } catch (err) {
      setSyncResult(null);
      setError(formatApiError(err) || "Error al sincronizar resultados");
    } finally {
      setSyncBusy(false);
    }
  }

  if (user?.role !== "super_admin") {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="page-content page-content--platform-admin">
      <h1>Administración de plataforma</h1>
      <p className="page-subtitle">Super admin · pool público, empresas B2B y operación del Mundial</p>

      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      <div className="admin-tabs platform-admin-tabs">
        <button type="button" className={tab === "resumen" ? "tab-active" : ""} onClick={() => setTab("resumen")}>
          Resumen
        </button>
        <button type="button" className={tab === "usuarios" ? "tab-active" : ""} onClick={() => setTab("usuarios")}>
          Usuarios
        </button>
        <button type="button" className={tab === "empresas" ? "tab-active" : ""} onClick={() => setTab("empresas")}>
          Empresas
        </button>
        <button type="button" className={tab === "config" ? "tab-active" : ""} onClick={() => setTab("config")}>
          Configuración
        </button>
        <button
          type="button"
          className={tab === "operaciones" ? "tab-active" : ""}
          onClick={() => setTab("operaciones")}
        >
          Operaciones
        </button>
      </div>

      {tab === "resumen" && (
        <>
          <section className="admin-section platform-system-health">
        <div className="platform-system-health-header">
          <h2>Estado del sistema</h2>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => void reloadSystemHealth()}
            disabled={systemHealthLoading}
          >
            {systemHealthLoading ? "Comprobando…" : "Actualizar"}
          </button>
        </div>
        {systemHealthLoading && !systemHealth ? (
          <p className="placeholder-text">Comprobando base de datos, migraciones y configuración…</p>
        ) : systemHealth ? (
          <>
            <p className="page-subtitle platform-system-health-summary">
              <span
                className={`platform-health-badge ${systemHealth.ok ? "platform-health-badge--ok" : "platform-health-badge--warn"}`}
              >
                {systemHealth.ok ? "Todo OK" : "Requiere atención"}
              </span>
              {" · "}
              Entorno: <strong>{systemHealth.environment}</strong>
              {" · "}
              Uptime: {Math.floor(systemHealth.uptimeSeconds / 3600)}h{" "}
              {Math.floor((systemHealth.uptimeSeconds % 3600) / 60)}m
              {" · "}
              Migraciones: {systemHealth.migrations.applied}
              {systemHealth.migrations.expected > 0
                ? `/${systemHealth.migrations.expected}`
                : ""}
              {systemHealth.migrations.pending.length > 0
                ? ` · Pendientes: ${systemHealth.migrations.pending.join(", ")}`
                : ""}
            </p>
            <ul className="platform-system-health-list">
              {systemHealth.checks.map((check) => (
                <li
                  key={check.id}
                  className={`platform-system-health-item ${check.ok ? "platform-system-health-item--ok" : "platform-system-health-item--fail"}`}
                >
                  <span className="platform-system-health-status" aria-hidden="true">
                    {check.ok ? "✓" : "✗"}
                  </span>
                  <span className="platform-system-health-label">{check.label}</span>
                  {check.detail ? (
                    <span className="platform-system-health-detail">{check.detail}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="placeholder-text">No se pudo cargar el estado del sistema.</p>
        )}
      </section>

          <PlatformDateRangeBar
            fromInput={fromInput}
            toInput={toInput}
            rangeAllTime={rangeAllTime}
            appliedLabel={reportRangeHint}
            onFromChange={setFromInput}
            onToChange={setToInput}
            onRangeAllTimeChange={(v) => {
              setRangeAllTime(v);
              if (v) setReportRange("all");
            }}
            onApply={applyReportRange}
          />

          {overview ? (
            <section className="admin-section platform-resumen-kpis">
              <h2>Vista rápida</h2>
              {overviewIsScoped(overview) ? (
                <p className="page-subtitle platform-resumen-hint" style={{ marginTop: 0 }}>
                  Predicciones e invitaciones filtradas al período {overview.range!.from} — {overview.range!.to}.
                </p>
              ) : null}
              <div className="platform-overview-cards">
                <div className="platform-overview-card">
                  <div className="platform-overview-card-label">
                    {overview.inPeriod ? "Pool activos (período)" : "Pool activos"}
                  </div>
                  <div className="platform-overview-card-value">
                    {overview.inPeriod
                      ? overview.inPeriod.publicPool.activeUsers
                      : overview.publicPool.activeUsers}
                  </div>
                  {overview.inPeriod ? (
                    <div className="platform-overview-card-sub">
                      {overview.inPeriod.publicPool.newUsers} altas · {overview.publicPool.activeUsers} activos hoy
                    </div>
                  ) : null}
                </div>
                <div className="platform-overview-card">
                  <div className="platform-overview-card-label">
                    {overview.inPeriod ? "Plataforma activos (período)" : "Plataforma activos"}
                  </div>
                  <div className="platform-overview-card-value">
                    {overview.inPeriod
                      ? overview.inPeriod.platformWide.activeUsers
                      : overview.platformWide.activeUsers}
                  </div>
                  {overview.inPeriod ? (
                    <div className="platform-overview-card-sub">
                      {overview.inPeriod.platformWide.newUsers} altas · {overview.platformWide.activeUsers} activos hoy
                    </div>
                  ) : null}
                </div>
                <div className="platform-overview-card">
                  <div className="platform-overview-card-label">
                    {overviewIsScoped(overview) ? "Con predicciones (período)" : "Con predicciones"}
                  </div>
                  <div className="platform-overview-card-value">
                    {overview.engagement.usersWithFootballPredictions}
                  </div>
                </div>
                <div className="platform-overview-card">
                  <div className="platform-overview-card-label">Partidos con resultado</div>
                  <div className="platform-overview-card-value">
                    {overview.engagement.matchesWithResult}/{overview.engagement.matchesTotal}
                  </div>
                  <div className="platform-overview-card-sub">Histórico del torneo</div>
                </div>
              </div>
              <p className="page-subtitle platform-resumen-hint">
                Métricas detalladas en la pestaña{" "}
                <button type="button" className="platform-inline-link" onClick={() => setTab("usuarios")}>
                  Usuarios
                </button>
                .
              </p>
            </section>
          ) : loading ? (
            <p className="placeholder-text">Cargando indicadores…</p>
          ) : null}

          {overview ? <PlatformRetentionCards overview={overview} /> : null}

          <PlatformActivityChart
            data={timeSeries}
            loading={timeSeriesLoading}
            scope={chartScope}
            onScopeChange={setChartScope}
            reportScoped={reportRange !== "all"}
          />

          <PlatformAiHealthPanel data={aiHealth} loading={aiHealthLoading} />
        </>
      )}

      {tab === "config" && (
        <section className="admin-section">
          <h2>Configuración de plataforma</h2>
          <PlatformConfigSection
            loading={loading}
            aiConfig={platformAiConfig}
            onSaveAi={async (data) => {
              const { config } = await updatePlatformAiConfig(data);
              setPlatformAiConfig(config);
            }}
            defaultScope={defaultScope}
            defaultScopeDraft={defaultScopeDraft}
            onDefaultScopeChange={setDefaultScopeDraft}
            onSaveDefaultScope={saveDefaultScope}
            savingDefaultScope={savingDefaultScope}
            matchSyncStatus={matchSyncStatus}
            onGoToOperations={() => setTab("operaciones")}
          />
        </section>
      )}

      {tab === "operaciones" && (
      <>
      <section className="admin-section" style={{ marginBottom: "2rem" }}>
        <h2>Resultados del Mundial (football-data.org)</h2>
        <p className="page-subtitle" style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
          Importa marcadores y nombres de equipos desde football-data.org hacia la base de datos. Requiere{" "}
          <code className="platform-slug-code">FOOTBALL_DATA_API_KEY</code> en el backend. El auto-sync corre cada 5
          minutos si la key está configurada.
        </p>
        {matchSyncStatus ? (
          <div className="platform-overview-cards platform-match-sync-cards" style={{ marginBottom: "1rem" }}>
            <div className="platform-overview-card">
              <div className="platform-overview-card-label">API key</div>
              <div className="platform-overview-card-value">{matchSyncStatus.apiKeyConfigured ? "Sí" : "No"}</div>
            </div>
            <div className="platform-overview-card">
              <div className="platform-overview-card-label">Con resultado</div>
              <div className="platform-overview-card-value">
                {matchSyncStatus.matchesWithResult}/{matchSyncStatus.totalMatches}
              </div>
            </div>
            <div className="platform-overview-card">
              <div className="platform-overview-card-label">Pendientes</div>
              <div className="platform-overview-card-value">{matchSyncStatus.pendingRows}</div>
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void runMatchResultsSync()}
            disabled={syncBusy || matchSyncStatus?.apiKeyConfigured === false}
          >
            {syncBusy ? "Sincronizando…" : "Sincronizar resultados"}
          </button>
          <label className="admin-date-range-alltime" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={matchSyncFullScan}
              onChange={(e) => setMatchSyncFullScan(e.target.checked)}
              disabled={syncBusy}
            />
            Escaneo completo
          </label>
        </div>
        {syncResult ? (
          <div className="platform-sync-diagnostics" style={{ marginTop: "1rem" }}>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>Resumen:</strong> {syncResult.updated} fila(s) actualizada(s) ·{" "}
              {syncResult.diagnostics.finishedInApi} finalizados en API ·{" "}
              {syncResult.diagnostics.matched} emparejados · {syncResult.diagnostics.scoresWritten}{" "}
              marcadores escritos
            </p>
            {(syncResult.diagnostics.skippedNoMatch > 0 || syncResult.diagnostics.skippedNoScore > 0) && (
              <p className="page-subtitle" style={{ marginBottom: "0.5rem" }}>
                Sin pareja en BD: {syncResult.diagnostics.skippedNoMatch} · Sin marcador usable:{" "}
                {syncResult.diagnostics.skippedNoScore}
              </p>
            )}
            {syncResult.diagnostics.samples.length > 0 ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>API (local · visitante)</th>
                      <th>Estado</th>
                      <th>BD / resultado</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncResult.diagnostics.samples.map((s, i) => (
                      <tr key={`${s.kind}-${s.apiUtcDate}-${i}`}>
                        <td>{s.kind === "updated" ? "OK" : s.kind === "no_match" ? "Sin pareja" : "Sin marcador"}</td>
                        <td>
                          {s.apiHome} vs {s.apiAway}
                        </td>
                        <td>{s.apiStatus}</td>
                        <td>
                          {s.kind === "updated"
                            ? `${s.ourTeamA} ${s.resultScoreA}–${s.resultScoreB} ${s.ourTeamB}`
                            : s.ourTeamA
                              ? `${s.ourTeamA} vs ${s.ourTeamB}`
                              : "—"}
                        </td>
                        <td>{s.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <PlatformExportsPanel reportRange={reportRange} />
      </>
      )}

      {tab === "usuarios" && (
      <>
      <PlatformDateRangeBar
        fromInput={fromInput}
        toInput={toInput}
        rangeAllTime={rangeAllTime}
        appliedLabel={reportRangeHint}
        onFromChange={setFromInput}
        onToChange={setToInput}
        onRangeAllTimeChange={(v) => {
          setRangeAllTime(v);
          if (v) setReportRange("all");
        }}
        onApply={applyReportRange}
      />
      {overview ? <PlatformRetentionCards overview={overview} /> : null}
      <section className="admin-section" style={{ marginBottom: "2rem" }}>
        <h2>Indicadores de plataforma</h2>
        <p className="page-subtitle" style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
          Métricas del pool público (<code className="platform-slug-code">platform-internal</code>), del resto de
          empresas B2B y del engagement con el Prode. En la tabla, sesiones/prompts/predicciones respetan el período
          seleccionado; pautas y última actividad son históricos.
          {overviewIsScoped(overview)
            ? ` Invitaciones y predicciones de las cards también usan el período ${overview!.range!.from} — ${overview!.range!.to}.`
            : ""}
        </p>
        {loading ? (
          <p className="placeholder-text">Cargando resumen…</p>
        ) : overview ? (
          <>
            <h3 className="platform-metrics-group-title">Pool público</h3>
            <div className="platform-overview-cards">
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">
                  {overview.inPeriod ? "Activos con actividad (período)" : "Usuarios activos"}
                </div>
                <div className="platform-overview-card-value">
                  {overview.inPeriod
                    ? overview.inPeriod.publicPool.activeUsers
                    : overview.publicPool.activeUsers}
                </div>
                <div className="platform-overview-card-sub">
                  {overview.inPeriod
                    ? `${overview.inPeriod.publicPool.newUsers} altas · ${overview.publicPool.activeUsers} activos hoy`
                    : "Registro público y Google"}
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">Liga universal (activos)</div>
                <div className="platform-overview-card-value">
                  {overview.publicPool.universalLeagueActiveMembers}
                </div>
                <div className="platform-overview-card-sub">
                  {overview.publicPool.universalLeagueTotalMembers !==
                  overview.publicPool.universalLeagueActiveMembers
                    ? `${overview.publicPool.universalLeagueTotalMembers} miembros totales (incl. inactivos)`
                    : "Miembros con cuenta activa"}
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">
                  {overviewIsScoped(overview) ? "Invit. enviadas pool" : "Invit. ligas pool"}
                </div>
                <div className="platform-overview-card-value">
                  {overview.platformWide.publicPoolCompetitionInvitesPending}
                </div>
                <div className="platform-overview-card-sub">
                  {overviewIsScoped(overview) ? "Enviadas en el período" : "Pendientes (no vencidas)"}
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">
                  {overviewIsScoped(overview) ? "Invit. aceptadas pool" : "Invit. ligas pool"}
                </div>
                <div className="platform-overview-card-value">
                  {overview.platformWide.publicPoolCompetitionInvitesAccepted}
                </div>
                <div className="platform-overview-card-sub">
                  {overviewIsScoped(overview) ? "Aceptadas en el período" : "Aceptadas (histórico)"}
                </div>
              </div>
            </div>

            <h3 className="platform-metrics-group-title">Toda la plataforma</h3>
            <div className="platform-overview-cards">
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">
                  {overview.inPeriod ? "Activos con actividad (período)" : "Usuarios activos"}
                </div>
                <div className="platform-overview-card-value">
                  {overview.inPeriod
                    ? overview.inPeriod.platformWide.activeUsers
                    : overview.platformWide.activeUsers}
                </div>
                <div className="platform-overview-card-sub">
                  {overview.inPeriod
                    ? `${overview.inPeriod.platformWide.newUsers} altas · B2B: ${overview.platformWide.b2bActiveUsers} · Deshabilitados: ${overview.platformWide.disabledUsers}`
                    : `B2B: ${overview.platformWide.b2bActiveUsers} · Deshabilitados: ${overview.platformWide.disabledUsers}`}
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">
                  {overviewIsScoped(overview) ? "Invit. enviadas (global)" : "Invit. ligas (global)"}
                </div>
                <div className="platform-overview-card-value">
                  {overview.platformWide.competitionInvitesPending}
                </div>
                <div className="platform-overview-card-sub">
                  {overviewIsScoped(overview) ? "Enviadas en el período" : "Pendientes en todas las empresas"}
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">
                  {overviewIsScoped(overview) ? "Invit. aceptadas (global)" : "Invit. ligas (global)"}
                </div>
                <div className="platform-overview-card-value">
                  {overview.platformWide.competitionInvitesAccepted}
                </div>
                <div className="platform-overview-card-sub">
                  {overviewIsScoped(overview) ? "Aceptadas en el período" : "Aceptadas en todas las empresas"}
                </div>
              </div>
            </div>

            <h3 className="platform-metrics-group-title">Engagement Prode</h3>
            <div className="platform-overview-cards">
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">
                  {overviewIsScoped(overview) ? "Con predicciones fútbol (período)" : "Con predicciones fútbol"}
                </div>
                <div className="platform-overview-card-value">
                  {overview.engagement.usersWithFootballPredictions}
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">
                  {overviewIsScoped(overview) ? "Con predicciones F1 (período)" : "Con predicciones F1"}
                </div>
                <div className="platform-overview-card-value">{overview.engagement.usersWithF1Predictions}</div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">Con pautas guardadas</div>
                <div className="platform-overview-card-value">{overview.engagement.usersWithGuidelines}</div>
                <div className="platform-overview-card-sub">Histórico (sin filtro de fechas)</div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">Partidos con resultado</div>
                <div className="platform-overview-card-value">
                  {overview.engagement.matchesWithResult}/{overview.engagement.matchesTotal}
                </div>
              </div>
            </div>
          </>
        ) : null}

        <PlatformActivityChart
          data={timeSeries}
          loading={timeSeriesLoading}
          scope={chartScope}
          onScopeChange={setChartScope}
          reportScoped={reportRange !== "all"}
        />

        {!loading && (
          <div style={{ marginTop: "1.25rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.35rem" }}>Usuarios de la plataforma</h3>
            <p className="page-subtitle" style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
              Todos los usuarios (pool + empresas B2B). Sesiones, prompts y predicciones respetan el período del
              reporte; pautas y última actividad son históricos.{" "}
              <strong>Sesiones</strong> cuenta logins, registro, Google e invitación B2B.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
              <input
                type="search"
                className="admin-input-inline"
                style={{ minWidth: 200, flex: "1 1 180px" }}
                placeholder="Filtrar por email o nombre…"
                value={userFilterDraft}
                onChange={(e) => setUserFilterDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setUserFilter(userFilterDraft.trim());
                  }
                }}
              />
              <CompanyFilterCombobox
                value={companyFilterDraft}
                onChange={setCompanyFilterDraft}
                options={companyFilterOptions}
                onApply={() => setCompanyFilter(companyFilterDraft.trim())}
              />
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setUserFilter(userFilterDraft.trim());
                  setCompanyFilter(companyFilterDraft.trim());
                }}
              >
                Buscar
              </button>
              <PlatformExportsPanel
                reportRange={reportRange}
                userFilter={userFilter}
                companyFilter={companyFilter}
                usersOnly
              />
              {userFilter || companyFilter ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setUserFilter("");
                    setUserFilterDraft("");
                    setCompanyFilter("");
                    setCompanyFilterDraft("");
                  }}
                >
                  Limpiar
                </button>
              ) : null}
            </div>
          </div>
        )}

        {transferTarget && (
          <div
            className="platform-transfer-panel"
            style={{
              marginTop: "0.75rem",
              marginBottom: "1rem",
              padding: "1rem",
              border: "1px solid var(--border)",
              maxWidth: 480,
            }}
          >
            <p style={{ marginTop: 0, marginBottom: "0.75rem" }}>
              <strong>Mover a empresa B2B:</strong> {transferTarget.email}
            </p>
            <p className="page-subtitle" style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
              Sale del pool público y de la liga universal global. Quedará como <strong>member</strong> en la empresa
              destino y entrará en su liga universal.
            </p>
            <form onSubmit={submitTransfer} className="admin-form" style={{ gap: "0.75rem" }}>
              <label>
                <span>Empresa destino</span>
                <select
                  value={transferCompanyId}
                  onChange={(e) => setTransferCompanyId(e.target.value)}
                  required
                  className="admin-input-inline"
                  style={{ width: "100%", maxWidth: 360 }}
                >
                  <option value="">Seleccionar…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.slug})
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button type="submit" className="btn-primary" disabled={transferBusy || !transferCompanyId}>
                  {transferBusy ? "Moviendo…" : "Mover usuario"}
                </button>
                <button type="button" className="btn-secondary" onClick={cancelTransfer} disabled={transferBusy}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {!loading && platformUsers.length > 0 && (
          <div style={{ marginTop: "0.25rem" }}>
            <p className="page-subtitle" style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              Mostrando {platformUsers.length} de {platformUsersTotal} usuario{platformUsersTotal === 1 ? "" : "s"}
              {platformUsersTotal > platformUsers.length ? " (límite 100 por consulta)" : ""}.
            </p>
            <div className="admin-table-wrap platform-users-table-wrap" style={{ maxHeight: 420 }}>
              <table className="admin-table platform-users-table">
                <colgroup>
                  <col className="platform-users-col-email" />
                  <col className="platform-users-col-name" />
                  <col className="platform-users-col-company" />
                  <col className="platform-users-col-narrow" />
                  <col className="platform-users-col-narrow" />
                  <col className="platform-users-col-narrow" />
                  <col className="platform-users-col-narrow" />
                  <col className="platform-users-col-narrow" />
                  <col className="platform-users-col-narrow" />
                  <col className="platform-users-col-narrow" />
                  <col className="platform-users-col-date" />
                  <col className="platform-users-col-date" />
                  <col className="platform-users-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nombre</th>
                    <th>Empresa</th>
                    <th>Estado</th>
                    <th>Rol</th>
                    <th title="Logins, registro, Google o invitación B2B">Sesiones</th>
                    <th title="Prompts de generación Prode/F1">IA Prode</th>
                    <th title="Todos los prompts (incluye chat)">Prompts</th>
                    <th title="Partidos de fútbol predichos">Fútbol</th>
                    <th title="Carreras F1 predichas">F1</th>
                    <th title="Pautas guardadas en el Laboratorio">Pautas</th>
                    <th>Alta</th>
                    <th>Última act.</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {platformUsers.map((u) => (
                    <tr key={u.id} className={u.status !== "active" ? "platform-users-row-inactive" : undefined}>
                      <td className="platform-users-col-email" title={u.email}>
                        {u.email}
                      </td>
                      <td className="platform-users-col-name">{u.fullName ?? "—"}</td>
                      <td className="platform-users-col-company" title={`${u.company.name} (${u.company.slug})`}>
                        {u.company.name}{" "}
                        <span className="platform-users-company-slug">({u.company.slug})</span>
                      </td>
                      <td className="platform-users-col-narrow">
                        <span
                          className={`platform-user-status platform-user-status--${u.status === "active" ? "active" : "inactive"}`}
                        >
                          {u.status === "active" ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="platform-users-col-narrow">{u.role}</td>
                      <td className="platform-users-col-narrow">{u.sessionCount}</td>
                      <td className="platform-users-col-narrow">{u.prodePrompts}</td>
                      <td className="platform-users-col-narrow">{u.totalPrompts}</td>
                      <td className="platform-users-col-narrow">{u.footballPredictions}</td>
                      <td className="platform-users-col-narrow">{u.f1Predictions}</td>
                      <td className="platform-users-col-narrow">{u.hasGuidelines ? "Sí" : "—"}</td>
                      <td className="platform-users-col-date">
                        {new Date(u.createdAt).toLocaleDateString("es-AR")}
                      </td>
                      <td className="platform-users-col-date">
                        {u.lastActivityAt
                          ? new Date(u.lastActivityAt).toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "short",
                              year: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="platform-users-col-actions">
                        <div className="platform-users-actions">
                          {u.company.slug === "platform-internal" ? (
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              disabled={userActionBusy === u.id}
                              onClick={() => {
                                setSuccessMsg("");
                                setError("");
                                setTransferTarget({ userId: u.id, email: u.email });
                                setTransferCompanyId("");
                              }}
                            >
                              Mover
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={userActionBusy === u.id}
                            onClick={() =>
                              void toggleUserHiddenFromRankings(
                                u.id,
                                !u.hiddenFromRankings,
                                u.email
                              )
                            }
                          >
                            {u.hiddenFromRankings ? "Mostrar" : "Ocultar"}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm platform-users-delete-btn"
                            disabled={userActionBusy === u.id}
                            onClick={() => void removePlatformUser(u.id, u.email)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!loading && platformUsers.length === 0 && (
          <p className="placeholder-text" style={{ marginTop: "0.5rem" }}>
            {userFilter || companyFilter
              ? "No hay usuarios que coincidan con los filtros."
              : "Aún no hay usuarios registrados en la plataforma."}
          </p>
        )}
      </section>
      </>
      )}

      {tab === "empresas" && (
      <>
      <section className="admin-section" style={{ marginBottom: "2rem" }}>
        <h2>Nueva empresa + admin</h2>
        <form onSubmit={handleCreate} className="admin-form" style={{ maxWidth: 520 }}>
          <label>
            <span>Nombre empresa</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label>
            <span>Slug (URL, solo minúsculas y guiones)</span>
            <input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="acme-corp"
            />
          </label>
          <label>
            <span>Email del administrador</span>
            <input
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
              required
            />
          </label>
          <label>
            <span>Contraseña inicial del admin</span>
            <input
              type="password"
              value={form.adminPassword}
              onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
              required
              minLength={6}
            />
          </label>
          <label>
            <span>Cupos (asientos)</span>
            <input
              type="number"
              min={1}
              value={form.seatLimit}
              onChange={(e) => setForm((f) => ({ ...f, seatLimit: parseInt(e.target.value, 10) || 1 }))}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Creando…" : "Crear empresa"}
          </button>
        </form>
      </section>

      <section className="admin-section">
        <h2>Empresas B2B</h2>
        <p className="page-subtitle" style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
          Cupos, competiciones y administradores se editan desde <strong>Configurar</strong> en cada fila.
        </p>
        {loading ? (
          <p className="placeholder-text">Cargando…</p>
        ) : (
          <div className="admin-table-wrap platform-companies-wrap">
            <table className="admin-table platform-companies-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Slug</th>
                  <th className="platform-companies-col-narrow">Usuarios</th>
                  <th className="platform-companies-col-narrow">Ligas</th>
                  <th className="platform-companies-col-narrow">Invit.</th>
                  <th>Competiciones</th>
                  <th className="platform-companies-col-narrow">Cupos</th>
                  <th className="platform-companies-col-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr
                    key={c.id}
                    className={companyDrawer?.id === c.id ? "platform-companies-row--open" : undefined}
                  >
                    <td className="platform-companies-col-name">{c.name}</td>
                    <td className="platform-companies-col-slug">
                      <code className="platform-slug-code">{c.slug}</code>
                    </td>
                    <td className="platform-companies-col-narrow">
                      {c.userCount}/{c.seatLimit}
                    </td>
                    <td className="platform-companies-col-narrow">{c.competitionCount ?? "—"}</td>
                    <td className="platform-companies-col-narrow">{c.invitationCount}</td>
                    <td>{scopeLabel(c.competitionScope)}</td>
                    <td className="platform-companies-col-narrow">{c.seatLimit}</td>
                    <td className="platform-companies-col-actions">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setError("");
                          setSuccessMsg("");
                          setCompanyDrawer(c);
                        }}
                      >
                        Configurar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PlatformCompanyDrawer
        company={companyDrawer}
        onClose={() => setCompanyDrawer(null)}
        onSave={saveCompanySettings}
        onResetPassword={handleAdminPasswordReset}
      />
      </>
      )}
    </div>
  );
}
