import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import AiConfigTab from "../components/AiConfigTab";
import {
  createPlatformCompany,
  fetchPlatformAiConfig,
  fetchPlatformCompanies,
  fetchPlatformOverview,
  fetchPlatformPublicPoolUsers,
  patchPlatformCompanySeat,
  resetPlatformOrgAdminPassword,
  updatePlatformAiConfig,
  type AiConfig,
  type PlatformCompanyRow,
  type PlatformOverview,
  type PlatformPublicPoolUser,
} from "../lib/api";

export default function PlatformAdminPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<PlatformCompanyRow[]>([]);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [publicPoolUsers, setPublicPoolUsers] = useState<PlatformPublicPoolUser[]>([]);
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
  const [seatEdits, setSeatEdits] = useState<Record<string, string>>({});

  const [resetTarget, setResetTarget] = useState<{ userId: string; email: string } | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [resetPass2, setResetPass2] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const [poolFilter, setPoolFilter] = useState("");
  const [poolFilterDraft, setPoolFilterDraft] = useState("");
  const [platformAiConfig, setPlatformAiConfig] = useState<AiConfig | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [{ companies: list }, ov, pool, aiRes] = await Promise.all([
        fetchPlatformCompanies(),
        fetchPlatformOverview(),
        fetchPlatformPublicPoolUsers(100, poolFilter),
        fetchPlatformAiConfig(),
      ]);
      setCompanies(list);
      setOverview(ov);
      setPublicPoolUsers(pool.users);
      setPlatformAiConfig(aiRes.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setCompanies([]);
      setOverview(null);
      setPublicPoolUsers([]);
    } finally {
      setLoading(false);
    }
  }, [poolFilter]);

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
      setError(err instanceof Error ? err.message : "Error al crear empresa");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveSeat(id: string) {
    const raw = seatEdits[id];
    if (!raw) return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      setError("Cupos inválidos");
      return;
    }
    setError("");
    setSuccessMsg("");
    try {
      await patchPlatformCompanySeat(id, n);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar cupos");
    }
  }

  async function submitPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setError("");
    setSuccessMsg("");
    if (resetPass.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (resetPass !== resetPass2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    const emailLabel = resetTarget.email;
    setResetBusy(true);
    try {
      await resetPlatformOrgAdminPassword(resetTarget.userId, resetPass);
      setResetTarget(null);
      setResetPass("");
      setResetPass2("");
      setSuccessMsg(`Contraseña restablecida para ${emailLabel}. El admin puede iniciar sesión con la nueva clave.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al restablecer");
    } finally {
      setResetBusy(false);
    }
  }

  function cancelReset() {
    setResetTarget(null);
    setResetPass("");
    setResetPass2("");
    setError("");
  }

  if (user?.role !== "super_admin") {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="page-content">
      <h1>Administración de plataforma</h1>
      <p className="page-subtitle">
        Pool público (registro y OAuth), liga universal, empresas B2B, cupos y accesos de administradores.
      </p>
      <p className="page-subtitle" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
        <strong>IA del pool público</strong> se configura en el bloque siguiente (usuarios en{" "}
        <code className="platform-slug-code">platform-internal</code>). No está en Admin de empresa.
      </p>

      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      <section className="admin-section" id="ia-pool-publico" style={{ marginBottom: "2rem" }}>
        {loading ? (
          <p className="placeholder-text">Cargando configuración de IA…</p>
        ) : (
          <AiConfigTab
            config={platformAiConfig}
            title="IA del pool público"
            lead="Proveedor, modelo y API key para usuarios en la org platform-internal (registro público y OAuth). Si no hay fila en BD, el backend usa solo variables de entorno (p. ej. OPENAI_API_KEY)."
            successMessage="Configuración de IA del pool guardada."
            onSave={async (data) => {
              const { config } = await updatePlatformAiConfig(data);
              setPlatformAiConfig(config);
            }}
          />
        )}
      </section>

      <section className="admin-section" style={{ marginBottom: "2rem" }}>
        <h2>Pool público y liga universal</h2>
        <p className="page-subtitle" style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
          Quienes se registran sin invitación de empresa o entran con Google/OAuth quedan en la org{" "}
          <code className="platform-slug-code">platform-internal</code>, entran en la{" "}
          <strong>Liga universal</strong> (ranking entre ese pool). Quienes aceptan invitación B2B solo pertenecen a
          su empresa.
        </p>
        {loading ? (
          <p className="placeholder-text">Cargando resumen…</p>
        ) : overview ? (
          <div className="platform-overview-cards" style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <div
              style={{
                border: "1px solid var(--border)",
                padding: "1rem 1.25rem",
                minWidth: 200,
              }}
            >
              <div className="placeholder-text" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>
                Usuarios pool público
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{overview.publicPoolUserCount}</div>
            </div>
            <div
              style={{
                border: "1px solid var(--border)",
                padding: "1rem 1.25rem",
                minWidth: 220,
              }}
            >
              <div className="placeholder-text" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>
                Liga universal (miembros)
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>
                {overview.universalLeague?.memberCount ?? "—"}
              </div>
              {overview.universalLeague && (
                <div style={{ fontSize: "0.85rem", marginTop: "0.35rem", color: "var(--text-muted)" }}>
                  {overview.universalLeague.name}
                </div>
              )}
            </div>
            <div
              style={{
                border: "1px solid var(--border)",
                padding: "1rem 1.25rem",
                minWidth: 200,
              }}
            >
              <div className="placeholder-text" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>
                Invit. ligas pendientes
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>
                {overview.pendingCompetitionInvites ?? 0}
              </div>
            </div>
            <div
              style={{
                border: "1px solid var(--border)",
                padding: "1rem 1.25rem",
                minWidth: 200,
              }}
            >
              <div className="placeholder-text" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>
                Invit. ligas aceptadas
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>
                {overview.acceptedCompetitionInvites ?? 0}
              </div>
            </div>
          </div>
        ) : null}

        {!loading && (
          <div style={{ marginTop: "1.25rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Registros del pool público</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
              <input
                type="search"
                className="admin-input-inline"
                style={{ minWidth: 220, flex: "1 1 200px" }}
                placeholder="Filtrar por email o nombre…"
                value={poolFilterDraft}
                onChange={(e) => setPoolFilterDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPoolFilter(poolFilterDraft.trim());
                  }
                }}
              />
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setPoolFilter(poolFilterDraft.trim())}
              >
                Buscar
              </button>
              {poolFilter ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setPoolFilter("");
                    setPoolFilterDraft("");
                  }}
                >
                  Limpiar
                </button>
              ) : null}
            </div>
          </div>
        )}

        {!loading && publicPoolUsers.length > 0 && (
          <div style={{ marginTop: "0.25rem" }}>
            <div className="admin-table-wrap" style={{ maxHeight: 320, overflow: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Alta</th>
                  </tr>
                </thead>
                <tbody>
                  {publicPoolUsers.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>{u.fullName ?? "—"}</td>
                      <td>{u.role}</td>
                      <td>{new Date(u.createdAt).toLocaleString("es-AR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!loading && publicPoolUsers.length === 0 && (
          <p className="placeholder-text" style={{ marginTop: "0.5rem" }}>
            {poolFilter ? "No hay usuarios que coincidan con el filtro." : "Aún no hay usuarios en el pool público."}
          </p>
        )}
      </section>

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
        <h2>Empresas</h2>
        {resetTarget && (
          <div
            className="platform-reset-panel"
            style={{
              marginBottom: "1.25rem",
              padding: "1rem",
              border: "1px solid var(--border)",
              maxWidth: 420,
            }}
          >
            <p style={{ marginTop: 0, marginBottom: "0.75rem" }}>
              <strong>Nueva contraseña para:</strong> {resetTarget.email}
            </p>
            <form onSubmit={submitPasswordReset} className="admin-form" style={{ gap: "0.75rem" }}>
              <label>
                <span>Contraseña nueva</span>
                <input
                  type="password"
                  value={resetPass}
                  onChange={(e) => setResetPass(e.target.value)}
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label>
                <span>Repetir contraseña</span>
                <input
                  type="password"
                  value={resetPass2}
                  onChange={(e) => setResetPass2(e.target.value)}
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button type="submit" className="btn-primary" disabled={resetBusy}>
                  {resetBusy ? "Guardando…" : "Guardar contraseña"}
                </button>
                <button type="button" className="btn-secondary" onClick={cancelReset} disabled={resetBusy}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
        {loading ? (
          <p className="placeholder-text">Cargando…</p>
        ) : (
          <div className="admin-table-wrap platform-companies-wrap">
            <table className="admin-table platform-companies-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Slug</th>
                  <th>Admins</th>
                  <th className="platform-companies-col-narrow">Usuarios</th>
                  <th className="platform-companies-col-narrow">Ligas</th>
                  <th className="platform-companies-col-narrow">Invitaciones</th>
                  <th>Cupos</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td className="platform-companies-col-name">{c.name}</td>
                    <td className="platform-companies-col-slug">
                      <code className="platform-slug-code">{c.slug}</code>
                    </td>
                    <td className="platform-companies-col-admins">
                      {c.orgAdmins?.length ? (
                        <div className="platform-org-admin-list">
                          {c.orgAdmins.map((a) => (
                            <div className="platform-org-admin-item" key={a.id}>
                              <span className="platform-org-admin-email">{a.email}</span>
                              <button
                                type="button"
                                className="btn-secondary btn-sm platform-org-admin-btn"
                                onClick={() => {
                                  setSuccessMsg("");
                                  setError("");
                                  setResetTarget({ userId: a.id, email: a.email });
                                  setResetPass("");
                                  setResetPass2("");
                                }}
                              >
                                Restablecer
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="placeholder-text">—</span>
                      )}
                    </td>
                    <td className="platform-companies-col-narrow">{c.userCount}</td>
                    <td className="platform-companies-col-narrow">{c.competitionCount ?? "—"}</td>
                    <td className="platform-companies-col-narrow">{c.invitationCount}</td>
                    <td>
                      <input
                        key={`${c.id}-${c.seatLimit}`}
                        type="number"
                        min={1}
                        className="admin-input-inline"
                        style={{ width: 80 }}
                        defaultValue={c.seatLimit}
                        onChange={(e) => setSeatEdits((s) => ({ ...s, [c.id]: e.target.value }))}
                      />{" "}
                      <button type="button" className="btn-secondary btn-sm" onClick={() => saveSeat(c.id)}>
                        Guardar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
