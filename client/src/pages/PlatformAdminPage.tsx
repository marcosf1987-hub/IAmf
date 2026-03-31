import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { createPlatformCompany, fetchPlatformCompanies, patchPlatformCompanySeat, type PlatformCompanyRow } from "../lib/api";

export default function PlatformAdminPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<PlatformCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    adminEmail: "",
    adminPassword: "",
    seatLimit: 50,
  });
  const [submitting, setSubmitting] = useState(false);
  const [seatEdits, setSeatEdits] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { companies: list } = await fetchPlatformCompanies();
      setCompanies(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
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
    try {
      await patchPlatformCompanySeat(id, n);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar cupos");
    }
  }

  if (user?.role !== "super_admin") {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="page-content">
      <h1>Administración de plataforma</h1>
      <p className="page-subtitle">Alta de empresas (tenants) y ajuste manual de cupos.</p>

      {error && <div className="auth-error">{error}</div>}

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
        {loading ? (
          <p className="placeholder-text">Cargando…</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Slug</th>
                  <th>Usuarios</th>
                  <th>Invitaciones</th>
                  <th>Cupos</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.slug}</td>
                    <td>{c.userCount}</td>
                    <td>{c.invitationCount}</td>
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
