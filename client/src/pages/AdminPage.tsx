import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { AdminMetric, AdminReportRange, AdminUser, TimeSeriesPoint } from "../lib/api";
import type { AdminStats } from "../lib/api";
import {
  createAdminUser,
  deleteAdminUser,
  downloadExport,
  fetchAdminAiConfig,
  fetchAdminCompanyConfig,
  fetchAdminMetrics,
  fetchAdminStats,
  fetchAdminTimeSeries,
  fetchAdminUsers,
  fetchOrgInvitations,
  postOrgInvitations,
  updateAdminAiConfig,
  updateAdminCompanyConfig,
  updateAdminUser,
  type CompanySummary,
  type OrgInvitationRow,
  type OrgUsage,
} from "../lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type Tab = "users" | "equipo" | "metrics" | "exports" | "config" | "ai";

function defaultReportRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function EquipoTab({
  usage,
  company,
  loading,
  invitations,
  onReload,
}: {
  usage: OrgUsage | null;
  company: CompanySummary | null;
  loading: boolean;
  invitations: OrgInvitationRow[];
  onReload: () => void | Promise<void>;
}) {
  const [emailsText, setEmailsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviteErr, setInviteErr] = useState("");
  const [lastResults, setLastResults] = useState<
    | {
        email: string;
        inviteUrl: string;
        error?: string;
        emailSent?: boolean;
        emailError?: string;
      }[]
    | null
  >(null);
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteErr("");
    const emails = emailsText
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!emails.length) {
      setInviteErr("Ingresa al menos un email.");
      return;
    }
    setSubmitting(true);
    try {
      const { results, mailConfigured: mc } = await postOrgInvitations(emails);
      setLastResults(results);
      setMailConfigured(mc);
      setEmailsText("");
      await onReload();
    } catch (err) {
      setInviteErr(err instanceof Error ? err.message : "Error al invitar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-section">
      <h2 className="admin-section-header" style={{ marginBottom: "0.5rem" }}>
        Cupos e invitaciones
      </h2>
      {company && (
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Empresa: <strong>{company.name}</strong> ({company.slug})
        </p>
      )}

      {loading && <p className="placeholder-text">Cargando…</p>}

      {usage && !loading && (
        <div className="admin-stats-cards" style={{ marginBottom: "1.25rem" }}>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{usage.seatLimit}</span>
            <span className="admin-stat-label">Cupos contratados</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{usage.activeUsers}</span>
            <span className="admin-stat-label">Usuarios activos</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{usage.invitationsPending}</span>
            <span className="admin-stat-label">Invitaciones pendientes</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{usage.invitationsAccepted}</span>
            <span className="admin-stat-label">Invitaciones aceptadas</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{usage.invitationsTotal}</span>
            <span className="admin-stat-label">Invitaciones enviadas (total)</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{usage.seatsRemaining}</span>
            <span className="admin-stat-label">Cupos disponibles</span>
          </div>
        </div>
      )}

      {usage?.billingCheckoutUrl && (
        <p style={{ marginBottom: "1rem" }}>
          <a
            href={usage.billingCheckoutUrl}
            className="btn-secondary btn-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ampliar cupos (checkout)
          </a>
        </p>
      )}

      <form onSubmit={handleInvite} className="admin-form" style={{ maxWidth: 520 }}>
        <label>
          <span>Emails de participantes (uno por línea o separados por coma)</span>
          <textarea
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            rows={6}
            className="chat-input"
            placeholder={"juan@empresa.com\nmaria@empresa.com"}
          />
        </label>
        {inviteErr && <div className="auth-error">{inviteErr}</div>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Generando enlaces…" : "Generar invitaciones"}
        </button>
        {mailConfigured === false && (
          <p className="auth-error" style={{ marginTop: "0.75rem" }}>
            El servidor no tiene SMTP configurado: no se envían correos automáticos. Configura SMTP_HOST,
            SMTP_USER y SMTP_PASS en Railway (backend). Igual puedes copiar el enlace de cada invitación abajo.
          </p>
        )}
        <p className="admin-date-range-hint" style={{ marginTop: "0.75rem" }}>
          {mailConfigured
            ? "Se envía un correo con el enlace a cada dirección. Si falla el envío, el enlace sigue disponible aquí."
            : "Con SMTP en el backend, se envían los mails automáticamente; si no, copia el enlace manualmente."}
        </p>
      </form>

      {lastResults && lastResults.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Última tanda</h3>
          <ul className="admin-invite-results">
            {lastResults.map((r) => (
              <li key={r.email}>
                <strong>{r.email}</strong>
                {r.error ? (
                  <span className="auth-error"> — {r.error}</span>
                ) : (
                  <>
                    :{" "}
                    <a href={r.inviteUrl} target="_blank" rel="noopener noreferrer">
                      abrir invitación
                    </a>
                    {mailConfigured && r.emailSent === true && (
                      <span className="auth-success" style={{ marginLeft: "0.5rem" }}>
                        Correo enviado
                      </span>
                    )}
                    {mailConfigured && r.emailSent === false && r.emailError && (
                      <span className="auth-error" style={{ marginLeft: "0.5rem" }} title={r.emailError}>
                        Mail no enviado (ver logs del servidor)
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: "2rem" }}>
        <h3>Historial de invitaciones</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Creada</th>
                <th>Vence</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <span className="placeholder-text">No hay invitaciones registradas.</span>
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>{new Date(inv.createdAt).toLocaleString()}</td>
                    <td>{new Date(inv.expiresAt).toLocaleString()}</td>
                    <td>
                      {inv.acceptedAt
                        ? `Aceptada ${new Date(inv.acceptedAt).toLocaleString()}`
                        : new Date(inv.expiresAt).getTime() < Date.now()
                          ? "Expirada"
                          : "Pendiente"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, refreshSession, usage, company } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [metrics, setMetrics] = useState<AdminMetric[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [loadingTimeSeries, setLoadingTimeSeries] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [appliedRange, setAppliedRange] = useState<AdminReportRange>(() => {
    const d = defaultReportRange();
    return { from: d.from, to: d.to };
  });
  const [fromInput, setFromInput] = useState(() => defaultReportRange().from);
  const [toInput, setToInput] = useState(() => defaultReportRange().to);
  const [rangeAllTime, setRangeAllTime] = useState(false);

  const [companyConfig, setCompanyConfig] = useState<{ anonymizationEnabled: boolean } | null>(null);
  const [aiConfig, setAiConfig] = useState<{
    provider: string;
    model: string;
    baseUrl: string | null;
    hasApiKey: boolean;
  } | null>(null);

  const reportScoped = appliedRange !== "all";

  const reloadUsersData = useCallback(async () => {
    setLoading(true);
    setLoadingTimeSeries(true);
    setError("");
    try {
      const [uRes, s, ts] = await Promise.all([
        fetchAdminUsers(appliedRange),
        fetchAdminStats(appliedRange),
        fetchAdminTimeSeries(appliedRange),
      ]);
      setUsers(uRes.users);
      setStats(s);
      setTimeSeries(ts.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
      setUsers([]);
      setStats(null);
      setTimeSeries([]);
    } finally {
      setLoading(false);
      setLoadingTimeSeries(false);
    }
  }, [appliedRange]);

  const reloadMetricsData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { metrics: m } = await fetchAdminMetrics(appliedRange);
      setMetrics(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
      setMetrics([]);
    } finally {
      setLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    if (tab === "users") void reloadUsersData();
  }, [tab, reloadUsersData]);

  useEffect(() => {
    if (tab === "metrics") void reloadMetricsData();
  }, [tab, reloadMetricsData]);

  useEffect(() => {
    if (tab === "ai") loadAiConfig();
    if (tab === "config") loadCompanyConfig();
  }, [tab]);

  const [equipoLoading, setEquipoLoading] = useState(false);
  const [invitations, setInvitations] = useState<OrgInvitationRow[]>([]);

  const reloadEquipo = useCallback(async () => {
    setEquipoLoading(true);
    setError("");
    try {
      await refreshSession();
      const inv = await fetchOrgInvitations();
      setInvitations(inv.invitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar invitaciones");
      setInvitations([]);
    } finally {
      setEquipoLoading(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    if (tab === "equipo") void reloadEquipo();
  }, [tab, reloadEquipo]);

  function applyReportRange() {
    if (rangeAllTime) {
      setAppliedRange("all");
    } else {
      setAppliedRange({ from: fromInput, to: toInput });
    }
  }

  async function loadCompanyConfig() {
    try {
      const config = await fetchAdminCompanyConfig();
      setCompanyConfig(config);
    } catch {
      setCompanyConfig(null);
    }
  }

  async function loadAiConfig() {
    try {
      const { config } = await fetchAdminAiConfig();
      setAiConfig(config);
    } catch {
      setAiConfig(null);
    }
  }

  if (user?.role !== "org_admin") {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="page-content">
      <h1>Panel Admin</h1>
      <p className="page-subtitle">Gestión de usuarios, métricas y exportación</p>

      <div className="admin-tabs">
        <button
          type="button"
          className={tab === "users" ? "tab-active" : ""}
          onClick={() => setTab("users")}
        >
          Usuarios
        </button>
        <button
          type="button"
          className={tab === "equipo" ? "tab-active" : ""}
          onClick={() => setTab("equipo")}
        >
          Equipo e invitaciones
        </button>
        <button
          type="button"
          className={tab === "metrics" ? "tab-active" : ""}
          onClick={() => setTab("metrics")}
        >
          Métricas
        </button>
        <button
          type="button"
          className={tab === "exports" ? "tab-active" : ""}
          onClick={() => setTab("exports")}
        >
          Exportar
        </button>
        <button
          type="button"
          className={tab === "config" ? "tab-active" : ""}
          onClick={() => setTab("config")}
        >
          Configuración
        </button>
        <button
          type="button"
          className={tab === "ai" ? "tab-active" : ""}
          onClick={() => setTab("ai")}
        >
          Configuración IA
        </button>
      </div>

      {(tab === "users" || tab === "metrics" || tab === "exports") && (
        <div className="admin-date-range">
          <span className="admin-date-range-label">Período del reporte</span>
          <label className="admin-date-range-field">
            <span>Desde</span>
            <input
              type="date"
              value={fromInput}
              disabled={rangeAllTime}
              onChange={(e) => setFromInput(e.target.value)}
            />
          </label>
          <label className="admin-date-range-field">
            <span>Hasta</span>
            <input
              type="date"
              value={toInput}
              disabled={rangeAllTime}
              onChange={(e) => setToInput(e.target.value)}
            />
          </label>
          <label className="admin-date-range-alltime">
            <input
              type="checkbox"
              checked={rangeAllTime}
              onChange={(e) => {
                const v = e.target.checked;
                setRangeAllTime(v);
                if (v) {
                  setAppliedRange("all");
                } else {
                  setAppliedRange({ from: fromInput, to: toInput });
                }
              }}
            />
            Todo el período
          </label>
          <button type="button" className="btn-secondary btn-sm" onClick={applyReportRange} disabled={rangeAllTime}>
            Aplicar fechas
          </button>
          {reportScoped && (
            <span className="admin-date-range-hint">
              Datos entre {appliedRange.from} y {appliedRange.to} (UTC, día calendario)
            </span>
          )}
          {appliedRange === "all" && (
            <span className="admin-date-range-hint">Histórico completo (sin filtro de fechas)</span>
          )}
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      {tab === "users" && (
        <UsersTab
          users={users}
          stats={stats}
          timeSeries={timeSeries}
          loadingTimeSeries={loadingTimeSeries}
          loading={loading}
          reportScoped={reportScoped}
          onRefresh={reloadUsersData}
        />
      )}
      {tab === "equipo" && (
        <EquipoTab
          usage={usage}
          company={company}
          loading={equipoLoading}
          invitations={invitations}
          onReload={reloadEquipo}
        />
      )}
      {tab === "metrics" && (
        <MetricsTab metrics={metrics} loading={loading} reportScoped={reportScoped} />
      )}
      {tab === "exports" && <ExportsTab appliedRange={appliedRange} />}
      {tab === "config" && (
        <ConfigTab
          config={companyConfig}
          onSave={async (data) => {
            const res = await updateAdminCompanyConfig(data);
            setCompanyConfig(res);
          }}
        />
      )}
      {tab === "ai" && (
        <AiConfigTab
          config={aiConfig}
          onSave={async (data) => {
            const { config } = await updateAdminAiConfig(data);
            setAiConfig(config);
          }}
        />
      )}
    </div>
  );
}

function UsersTab({
  users,
  stats,
  timeSeries,
  loadingTimeSeries,
  loading,
  reportScoped,
  onRefresh,
}: {
  users: AdminUser[];
  stats: AdminStats | null;
  timeSeries: TimeSeriesPoint[];
  loadingTimeSeries: boolean;
  loading: boolean;
  reportScoped: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "member" as "member" | "org_admin",
  });
  const [editForm, setEditForm] = useState<{ fullName: string; role: string; status: string }>({
    fullName: "",
    role: "member",
    status: "active",
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setSubmitting(true);
    try {
      await createAdminUser({
        email: form.email,
        password: form.password,
        fullName: form.fullName || undefined,
        role: form.role,
      });
      setForm({ email: "", password: "", fullName: "", role: "member" });
      setShowForm(false);
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(id: string) {
    setErr("");
    setSubmitting(true);
    try {
      await updateAdminUser(id, {
        fullName: editForm.fullName,
        role: editForm.role as "member" | "org_admin",
        status: editForm.status as "active" | "disabled",
      });
      setEditing(null);
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Desactivar este usuario?")) return;
    setErr("");
    setSubmitting(true);
    try {
      await deleteAdminUser(id);
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(u: AdminUser) {
    setEditing(u.id);
    setEditForm({
      fullName: u.fullName ?? "",
      role: u.role,
      status: u.status,
    });
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Usuarios</h2>
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancelar" : "Nuevo usuario"}
        </button>
      </div>

      {stats && (
        <div className="admin-stats-cards">
          <div className="admin-stat-card">
            <span className="admin-stat-value">{stats.totalUsers}</span>
            <span className="admin-stat-label">
              {reportScoped ? "Altas de usuario (período)" : "Usuarios activos"}
            </span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{stats.totalLogins}</span>
            <span className="admin-stat-label">{reportScoped ? "Logins (período)" : "Logins totales"}</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{stats.totalPrompts}</span>
            <span className="admin-stat-label">{reportScoped ? "Prompts (período)" : "Prompts totales"}</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{stats.promptsPerUser}</span>
            <span className="admin-stat-label">
              {reportScoped ? "Prompts / usuario activo (promedio período)" : "Prompts / usuario"}
            </span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{stats.totalPredictions}</span>
            <span className="admin-stat-label">
              {reportScoped ? "Predicciones creadas (período)" : "Predicciones"}
            </span>
          </div>
        </div>
      )}

      <div className="admin-chart-wrap">
        <h3>Usuarios y prompts a lo largo del tiempo</h3>
        {reportScoped && (
          <p className="admin-chart-scope-hint">Serie acumulada solo dentro del período seleccionado.</p>
        )}
        {loadingTimeSeries ? (
          <div className="app-loading" style={{ minHeight: 200 }}>
            <div className="spinner" />
            <p>Cargando gráfico…</p>
          </div>
        ) : timeSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timeSeries} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                stroke="var(--text-muted)"
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
              />
              <YAxis
                stroke="var(--text-muted)"
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                labelStyle={{ color: "var(--text)" }}
                labelFormatter={(v) => new Date(v).toLocaleDateString("es-AR")}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="users"
                name="Usuarios totales"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ fill: "var(--accent)", r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="prompts"
                name="Prompts totales"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ fill: "#6366f1", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="page-subtitle">No hay datos para mostrar en este período</p>
        )}
      </div>

      {reportScoped && users.length === 0 && !loading && (
        <p className="page-subtitle">No hay usuarios dados de alta en el rango seleccionado.</p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="admin-form">
          {err && <div className="auth-error">{err}</div>}
          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </label>
          <label>
            <span>Contraseña</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={6}
            />
          </label>
          <label>
            <span>Nombre</span>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </label>
          <label>
            <span>Rol</span>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "member" | "org_admin" }))}
            >
              <option value="member">Participante</option>
              <option value="org_admin">Administrador</option>
            </select>
          </label>
          <button type="submit" disabled={submitting} className="btn-primary">
            Crear
          </button>
        </form>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>
                  {editing === u.id ? (
                    <input
                      value={editForm.fullName}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, fullName: e.target.value }))
                      }
                      className="admin-input-inline"
                    />
                  ) : (
                    u.fullName || "-"
                  )}
                </td>
                <td>
                  {editing === u.id ? (
                    <select
                      value={editForm.role}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, role: e.target.value }))
                      }
                    >
                      <option value="member">Participante</option>
                      <option value="org_admin">Administrador</option>
                    </select>
                  ) : (
                    u.role === "org_admin"
                      ? "Administrador"
                      : u.role === "member"
                        ? "Participante"
                        : u.role
                  )}
                </td>
                <td>
                  {editing === u.id ? (
                    <select
                      value={editForm.status}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, status: e.target.value }))
                      }
                    >
                      <option value="active">Activo</option>
                      <option value="disabled">Desactivado</option>
                    </select>
                  ) : (
                    u.status
                  )}
                </td>
                <td>
                  {editing === u.id ? (
                    <>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => handleUpdate(u.id)}
                        disabled={submitting}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setEditing(null)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => startEdit(u)}
                      >
                        Editar
                      </button>
                      {u.status === "active" && (
                        <button
                          type="button"
                          className="btn-logout btn-sm"
                          onClick={() => handleDelete(u.id)}
                          disabled={submitting}
                        >
                          Desactivar
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricsTab({
  metrics,
  loading,
  reportScoped,
}: {
  metrics: AdminMetric[];
  loading: boolean;
  reportScoped: boolean;
}) {
  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="admin-section">
      <h2>Adopción de IA</h2>
      <p className="page-subtitle">
        {reportScoped
          ? "Logins, prompts y predicciones por usuario en el período seleccionado"
          : "Logins, prompts y predicciones por usuario (histórico completo)"}
      </p>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Logins</th>
              <th>Prompts</th>
              <th>Predicciones</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.userId}>
                <td>{m.email}</td>
                <td>{m.fullName || "-"}</td>
                <td>{m.role}</td>
                <td>{m.logins}</td>
                <td>{m.prompts}</td>
                <td>{m.predictions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfigTab({
  config,
  onSave,
}: {
  config: { anonymizationEnabled: boolean } | null;
  onSave: (data: { anonymizationEnabled: boolean }) => Promise<void>;
}) {
  const [anonymizationEnabled, setAnonymizationEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (config) setAnonymizationEnabled(config.anonymizationEnabled);
  }, [config]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    setSubmitting(true);
    try {
      await onSave({ anonymizationEnabled });
      setOk("Configuración guardada.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-section">
      <h2>Configuración de la plataforma</h2>
      <p className="page-subtitle">
        Define cómo se muestran los datos en rankings y resultados.
      </p>
      {err && <div className="auth-error">{err}</div>}
      {ok && <div className="auth-success">{ok}</div>}
      <form onSubmit={handleSubmit} className="admin-form" style={{ maxWidth: 480 }}>
        <label className="admin-config-toggle">
          <span className="admin-config-label">
            <strong>Anonimización de usuarios</strong>
            <small>Cuando está activa, los rankings muestran "Empleado #XXXX" en lugar del nombre real.</small>
          </span>
          <select
            value={anonymizationEnabled ? "on" : "off"}
            onChange={(e) => setAnonymizationEnabled(e.target.value === "on")}
          >
            <option value="on">Anonimizados (Empleado #XXXX)</option>
            <option value="off">Visibles (nombre o email)</option>
          </select>
        </label>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}

type AiProvider = "openai" | "custom" | "gemini" | "grok" | "groq" | "ollama";

const PROVIDER_MODEL_OPTIONS: Record<AiProvider, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
  grok: [
    { value: "grok-2-1212", label: "Grok 2 1212" },
    { value: "grok-2", label: "Grok 2" },
    { value: "grok-beta", label: "Grok Beta" },
  ],
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { value: "gemma2-9b-it", label: "Gemma 2 9B" },
  ],
  ollama: [
    { value: "llama2", label: "Llama 2" },
    { value: "llama3", label: "Llama 3" },
    { value: "mistral", label: "Mistral" },
    { value: "gemma", label: "Gemma" },
    { value: "phi", label: "Phi" },
    { value: "codellama", label: "Code Llama" },
  ],
  custom: [], // input libre
};

function AiConfigTab({
  config,
  onSave,
}: {
  config: { provider: string; model: string; baseUrl: string | null; hasApiKey: boolean } | null;
  onSave: (data: { provider?: AiProvider; model?: string; baseUrl?: string | null; apiKey?: string }) => Promise<void>;
}) {
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (config) {
      setProvider((config.provider as AiProvider) || "openai");
      const opts = PROVIDER_MODEL_OPTIONS[config.provider as AiProvider];
      const valid = opts?.some((o) => o.value === config.model);
      setModel(config.model && valid ? config.model : opts?.[0]?.value ?? config.model ?? "gpt-4o-mini");
      setBaseUrl(config.baseUrl || "");
    }
  }, [config]);

  useEffect(() => {
    if (provider !== "custom") {
      const opts = PROVIDER_MODEL_OPTIONS[provider];
      const valid = opts?.some((o) => o.value === model);
      if (!valid && opts.length > 0) setModel(opts[0].value);
    }
  }, [provider]);

  function getDefaultModel() {
    const opts = PROVIDER_MODEL_OPTIONS[provider];
    return opts?.[0]?.value ?? "gpt-4o-mini";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    setSubmitting(true);
    try {
      await onSave({
        provider,
        model: model.trim() || getDefaultModel(),
        baseUrl:
          provider === "custom"
            ? (baseUrl.trim() || null)
            : provider === "ollama"
              ? (baseUrl.trim() || "http://localhost:11434/v1")
              : null,
        apiKey: apiKey.trim() || undefined,
      });
      setApiKey("");
      setOk("Configuración guardada. El chat usará esta IA.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-section">
      <h2>Configuración de IA</h2>
      <p className="page-subtitle">
        Elige el proveedor y configura la API key para que el chat funcione con esta IA.
      </p>
      {err && <div className="auth-error">{err}</div>}
      {ok && <div className="auth-success">{ok}</div>}
      <form onSubmit={handleSubmit} className="admin-form" style={{ maxWidth: 480 }}>
        <label>
          <span>Proveedor</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
          >
            <option value="ollama">Ollama (local, gratis)</option>
            <option value="groq">Groq (gratis, Llama/Mixtral)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="gemini">Google Gemini</option>
            <option value="grok">xAI Grok</option>
            <option value="custom">API compatible (OpenAI)</option>
          </select>
        </label>
        {(provider === "custom" || provider === "ollama") && (
          <label>
            <span>URL base</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider === "ollama"
                  ? "http://localhost:11434/v1"
                  : "https://api.ejemplo.com/v1"
              }
            />
          </label>
        )}
        <label>
          <span>Modelo</span>
          {provider === "custom" ? (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
            />
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {(() => {
                const opts = PROVIDER_MODEL_OPTIONS[provider];
                const hasCurrent = opts.some((o) => o.value === model);
                return (
                  <>
                    {!hasCurrent && model && (
                      <option value={model}>{model}</option>
                    )}
                    {opts.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </>
                );
              })()}
            </select>
          )}
        </label>
        {provider !== "ollama" && (
          <label>
            <span>API Key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                config?.hasApiKey
                  ? "•••••••• (dejar vacío para mantener)"
                  : provider === "gemini"
                    ? "Google AI Studio"
                    : provider === "grok"
                      ? "console.x.ai"
                      : provider === "groq"
                        ? "console.groq.com"
                        : "sk-..."
              }
              autoComplete="off"
            />
            {provider === "gemini" && (
              <small className="form-hint">Obtén la clave en Google AI Studio (aistudio.google.com)</small>
            )}
            {provider === "grok" && (
              <small className="form-hint">Obtén la clave en console.x.ai</small>
            )}
            {provider === "groq" && (
              <small className="form-hint">Obtén la clave gratis en console.groq.com (tier gratuito)</small>
            )}
          </label>
        )}
        {provider === "ollama" && (
          <p className="form-hint" style={{ marginTop: 0 }}>
            Sin API key. Instala Ollama (ollama.com), ejecuta <code>ollama run llama2</code> y usa el chat.
          </p>
        )}
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Guardando…" : "Guardar"}
        </button>
      </form>
      {config?.hasApiKey && (
        <p className="page-subtitle" style={{ marginTop: "1rem" }}>
          Configuración activa. El chat usa el modelo {config.model}.
        </p>
      )}
    </div>
  );
}

function ExportsTab({ appliedRange }: { appliedRange: AdminReportRange }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function handleDownload(type: "prompts" | "logins" | "users") {
    setErr("");
    setLoading(type);
    try {
      await downloadExport(type, appliedRange);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al descargar");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="admin-section">
      <h2>Exportar reportes</h2>
      <p className="page-subtitle">
        {appliedRange === "all"
          ? "Descargar CSV (histórico completo)"
          : "Descargar CSV filtrado por el período elegido arriba"}
      </p>
      {err && <div className="auth-error">{err}</div>}
      <div className="admin-exports">
        <button
          type="button"
          className="btn-primary"
          onClick={() => handleDownload("prompts")}
          disabled={!!loading}
        >
          {loading === "prompts" ? "Descargando…" : "Prompts"}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => handleDownload("logins")}
          disabled={!!loading}
        >
          {loading === "logins" ? "Descargando…" : "Logins"}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => handleDownload("users")}
          disabled={!!loading}
        >
          {loading === "users" ? "Descargando…" : "Usuarios"}
        </button>
      </div>
    </div>
  );
}
