import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import AiConfigTab from "../components/AiConfigTab";
import {
  createPlatformCompany,
  fetchPlatformAiConfig,
  fetchPlatformCompanies,
  fetchPlatformOverview,
  fetchPlatformSettings,
  fetchPlatformUsers,
  patchPlatformCompany,
  resetPlatformOrgAdminPassword,
  transferPlatformUserToCompany,
  updatePlatformAiConfig,
  updatePlatformSettings,
  type AiConfig,
  type CompanyCompetitionScope,
  type PlatformCompanyRow,
  type PlatformOverview,
  type PlatformUserRow,
} from "../lib/api";
import { scopeLabel } from "../lib/company-competition-scope";

type CompanyFilterOption = { value: string; label: string };

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

export default function PlatformAdminPage() {
  const { user } = useAuth();
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
  const [seatEdits, setSeatEdits] = useState<Record<string, string>>({});
  const [scopeEdits, setScopeEdits] = useState<Record<string, CompanyCompetitionScope>>({});
  const [defaultScope, setDefaultScope] = useState<CompanyCompetitionScope>("all");
  const [defaultScopeDraft, setDefaultScopeDraft] = useState<CompanyCompetitionScope>("all");
  const [savingDefaultScope, setSavingDefaultScope] = useState(false);

  const [resetTarget, setResetTarget] = useState<{ userId: string; email: string } | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [resetPass2, setResetPass2] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const [transferTarget, setTransferTarget] = useState<{ userId: string; email: string } | null>(null);
  const [transferCompanyId, setTransferCompanyId] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);

  const [userFilter, setUserFilter] = useState("");
  const [userFilterDraft, setUserFilterDraft] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [companyFilterDraft, setCompanyFilterDraft] = useState("");
  const [platformAiConfig, setPlatformAiConfig] = useState<AiConfig | null>(null);

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
    setError("");
    try {
      const [{ companies: list }, ov, usersRes, aiRes, settings] = await Promise.all([
        fetchPlatformCompanies(),
        fetchPlatformOverview(),
        fetchPlatformUsers({ limit: 100, q: userFilter, company: companyFilter }),
        fetchPlatformAiConfig(),
        fetchPlatformSettings(),
      ]);
      setCompanies(list);
      setOverview(ov);
      setPlatformUsers(usersRes.users);
      setPlatformUsersTotal(usersRes.total);
      setPlatformAiConfig(aiRes.config);
      setDefaultScope(settings.defaultCompetitionScope);
      setDefaultScopeDraft(settings.defaultCompetitionScope);
      const scopes: Record<string, CompanyCompetitionScope> = {};
      for (const c of list) scopes[c.id] = c.competitionScope;
      setScopeEdits(scopes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setCompanies([]);
      setOverview(null);
      setPlatformUsers([]);
      setPlatformUsersTotal(0);
    } finally {
      setLoading(false);
    }
  }, [userFilter, companyFilter]);

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
      await patchPlatformCompany(id, { seatLimit: n });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar cupos");
    }
  }

  async function saveCompanyScope(id: string) {
    const scope = scopeEdits[id];
    if (!scope) return;
    setError("");
    setSuccessMsg("");
    try {
      await patchPlatformCompany(id, { competitionScope: scope });
      setSuccessMsg("Competiciones de la empresa actualizadas.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar competiciones");
    }
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
      setError(err instanceof Error ? err.message : "Error al guardar valor por defecto");
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
      const msg = err instanceof Error ? err.message : "Error al mover usuario";
      if (msg.includes("seats_exceeded")) {
        setError("La empresa destino no tiene cupos disponibles.");
      } else if (msg.includes("not_found")) {
        setError("Solo se pueden mover usuarios activos del pool público (platform-internal).");
      } else if (msg.includes("invalid_target")) {
        setError("Empresa destino no válida.");
      } else {
        setError(msg);
      }
    } finally {
      setTransferBusy(false);
    }
  }

  function cancelTransfer() {
    setTransferTarget(null);
    setTransferCompanyId("");
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
    <div className="page-content page-content--platform-admin">
      <h1>Administración de plataforma</h1>

      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      <section className="admin-section platform-settings-row">
        <div className="platform-settings-grid">
          <div className="platform-settings-col" id="ia-pool-publico">
            {loading ? (
              <p className="placeholder-text">Cargando configuración de IA…</p>
            ) : (
              <AiConfigTab
                config={platformAiConfig}
                title="IA del pool público"
                lead=""
                successMessage="Configuración de IA del pool guardada."
                onSave={async (data) => {
                  const { config } = await updatePlatformAiConfig(data);
                  setPlatformAiConfig(config);
                }}
              />
            )}
          </div>
          <div className="platform-settings-col">
            <h2>Competiciones por defecto (nuevas empresas)</h2>
            <p className="page-subtitle" style={{ marginTop: "0.25rem" }}>
              Las empresas B2B nuevas heredan esta opción. Actual: <strong>{scopeLabel(defaultScope)}</strong>.
            </p>
            <form onSubmit={saveDefaultScope} className="admin-form" style={{ marginTop: "0.75rem" }}>
              <label>
                <span>Al crear empresa</span>
                <select
                  value={defaultScopeDraft}
                  onChange={(e) => setDefaultScopeDraft(e.target.value as CompanyCompetitionScope)}
                >
                  <option value="all">Todas las competiciones</option>
                  <option value="football">Solo Mundial</option>
                  <option value="f1">Solo F1</option>
                </select>
              </label>
              <button type="submit" className="btn-primary" disabled={savingDefaultScope}>
                {savingDefaultScope ? "Guardando…" : "Guardar valor por defecto"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="admin-section" style={{ marginBottom: "2rem" }}>
        <h2>Pool público y liga universal</h2>
        <p className="page-subtitle" style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
          Quienes se registran sin invitación de empresa o entran con Google quedan en la org{" "}
          <code className="platform-slug-code">platform-internal</code>, entran en la{" "}
          <strong>Liga universal</strong> (ranking entre ese pool). Quienes aceptan invitación B2B solo pertenecen a
          su empresa.
        </p>
        {loading ? (
          <p className="placeholder-text">Cargando resumen…</p>
        ) : overview ? (
          <div className="platform-overview-cards">
            <div className="platform-overview-card">
              <div className="platform-overview-card-label">Usuarios pool público</div>
              <div className="platform-overview-card-value">{overview.publicPoolUserCount}</div>
            </div>
            <div className="platform-overview-card">
              <div className="platform-overview-card-label">Liga universal (miembros)</div>
              <div className="platform-overview-card-value">
                {overview.universalLeague?.memberCount ?? "—"}
              </div>
              {overview.universalLeague && (
                <div className="platform-overview-card-sub">{overview.universalLeague.name}</div>
              )}
            </div>
            <div className="platform-overview-card">
              <div className="platform-overview-card-label">Invit. ligas pendientes</div>
              <div className="platform-overview-card-value">{overview.pendingCompetitionInvites ?? 0}</div>
            </div>
            <div className="platform-overview-card">
              <div className="platform-overview-card-label">Invit. ligas aceptadas</div>
              <div className="platform-overview-card-value">{overview.acceptedCompetitionInvites ?? 0}</div>
            </div>
          </div>
        ) : null}

        {!loading && (
          <div style={{ marginTop: "1.25rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Usuarios de la plataforma</h3>
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
                  <col className="platform-users-col-date" />
                  <col className="platform-users-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nombre</th>
                    <th>Empresa</th>
                    <th>Rol</th>
                    <th>Logins</th>
                    <th>Prompts</th>
                    <th>Predicc.</th>
                    <th>Alta</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {platformUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="platform-users-col-email" title={u.email}>
                        {u.email}
                      </td>
                      <td className="platform-users-col-name">{u.fullName ?? "—"}</td>
                      <td className="platform-users-col-company" title={`${u.company.name} (${u.company.slug})`}>
                        {u.company.name}{" "}
                        <span className="platform-users-company-slug">({u.company.slug})</span>
                      </td>
                      <td className="platform-users-col-narrow">{u.role}</td>
                      <td className="platform-users-col-narrow">{u.logins}</td>
                      <td className="platform-users-col-narrow">{u.prompts}</td>
                      <td className="platform-users-col-narrow">{u.predictions}</td>
                      <td className="platform-users-col-date">
                        {new Date(u.createdAt).toLocaleDateString("es-AR")}
                      </td>
                      <td className="platform-users-col-actions">
                        {u.company.slug === "platform-internal" ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => {
                              setSuccessMsg("");
                              setError("");
                              setTransferTarget({ userId: u.id, email: u.email });
                              setTransferCompanyId("");
                            }}
                          >
                            Mover
                          </button>
                        ) : (
                          <span className="placeholder-text">—</span>
                        )}
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
                  <th>Competiciones</th>
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
                    <td className="platform-companies-col-edit">
                      <div className="platform-companies-inline-edit">
                        <select
                          className="admin-input-inline platform-companies-scope-select"
                          value={scopeEdits[c.id] ?? c.competitionScope}
                          onChange={(e) =>
                            setScopeEdits((s) => ({
                              ...s,
                              [c.id]: e.target.value as CompanyCompetitionScope,
                            }))
                          }
                        >
                          <option value="all">Todas</option>
                          <option value="football">Solo Mundial</option>
                          <option value="f1">Solo F1</option>
                        </select>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => saveCompanyScope(c.id)}
                          disabled={(scopeEdits[c.id] ?? c.competitionScope) === c.competitionScope}
                          title="Guardar competiciones"
                        >
                          Guardar
                        </button>
                      </div>
                    </td>
                    <td className="platform-companies-col-edit">
                      <div className="platform-companies-inline-edit">
                        <input
                          key={`${c.id}-${c.seatLimit}`}
                          type="number"
                          min={1}
                          className="admin-input-inline platform-companies-seat-input"
                          defaultValue={c.seatLimit}
                          onChange={(e) => setSeatEdits((s) => ({ ...s, [c.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => saveSeat(c.id)}
                          title="Guardar cupos"
                        >
                          Guardar
                        </button>
                      </div>
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
