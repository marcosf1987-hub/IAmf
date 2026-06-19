import { useEffect, useMemo, useState } from "react";
import type { CompanyCompetitionScope, PlatformCompanyRow } from "../lib/api";
import { formatApiError } from "../lib/api";
import { COMPANY_SCOPE_OPTIONS, scopeLabel } from "../lib/company-competition-scope";

type Props = {
  company: PlatformCompanyRow | null;
  onClose: () => void;
  onSave: (
    companyId: string,
    data: { competitionScope?: CompanyCompetitionScope; seatLimit?: number }
  ) => Promise<void>;
  onResetPassword: (userId: string, password: string) => Promise<void>;
};

export default function PlatformCompanyDrawer({ company, onClose, onSave, onResetPassword }: Props) {
  const [scopeDraft, setScopeDraft] = useState<CompanyCompetitionScope>("all");
  const [seatDraft, setSeatDraft] = useState("50");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [resetAdminId, setResetAdminId] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [resetPass2, setResetPass2] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (!company) return;
    setScopeDraft(company.competitionScope);
    setSeatDraft(String(company.seatLimit));
    setErr("");
    setResetAdminId(null);
    setResetPass("");
    setResetPass2("");
  }, [company]);

  useEffect(() => {
    if (!company) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [company, onClose]);

  const hasChanges = useMemo(() => {
    if (!company) return false;
    const seat = parseInt(seatDraft, 10);
    return scopeDraft !== company.competitionScope || (Number.isFinite(seat) && seat !== company.seatLimit);
  }, [company, scopeDraft, seatDraft]);

  if (!company) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const seat = parseInt(seatDraft, 10);
    if (!Number.isFinite(seat) || seat < 1) {
      setErr("Los cupos deben ser un número mayor o igual a 1.");
      return;
    }
    const payload: { competitionScope?: CompanyCompetitionScope; seatLimit?: number } = {};
    if (scopeDraft !== company!.competitionScope) payload.competitionScope = scopeDraft;
    if (seat !== company!.seatLimit) payload.seatLimit = seat;
    if (Object.keys(payload).length === 0) return;

    setSaving(true);
    setErr("");
    try {
      await onSave(company!.id, payload);
      onClose();
    } catch (e) {
      setErr(formatApiError(e) || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetAdminId) return;
    if (resetPass.length < 6) {
      setErr("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (resetPass !== resetPass2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setResetBusy(true);
    setErr("");
    try {
      await onResetPassword(resetAdminId, resetPass);
      setResetAdminId(null);
      setResetPass("");
      setResetPass2("");
    } catch (e) {
      setErr(formatApiError(e) || "Error al restablecer contraseña");
    } finally {
      setResetBusy(false);
    }
  }

  const seatsUsed = company.userCount;
  const seatNum = parseInt(seatDraft, 10);
  const seatsOver = Number.isFinite(seatNum) && seatNum < seatsUsed;

  return (
    <div className="platform-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="platform-drawer"
        role="dialog"
        aria-labelledby="platform-company-drawer-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="platform-drawer-header">
          <div>
            <h2 id="platform-company-drawer-title">{company.name}</h2>
            <p className="platform-drawer-sub">
              <code className="platform-slug-code">{company.slug}</code>
              {" · "}
              Alta {new Date(company.createdAt).toLocaleDateString("es-AR")}
            </p>
          </div>
          <button type="button" className="platform-drawer-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="platform-drawer-stats">
          <div className="platform-drawer-stat">
            <span className="platform-drawer-stat-value">{company.userCount}</span>
            <span className="platform-drawer-stat-label">Usuarios</span>
          </div>
          <div className="platform-drawer-stat">
            <span className="platform-drawer-stat-value">{company.competitionCount ?? 0}</span>
            <span className="platform-drawer-stat-label">Ligas</span>
          </div>
          <div className="platform-drawer-stat">
            <span className="platform-drawer-stat-value">{company.invitationCount}</span>
            <span className="platform-drawer-stat-label">Invitaciones</span>
          </div>
        </div>

        {err ? <div className="auth-error platform-drawer-error">{err}</div> : null}

        <div className="platform-drawer-body">
          <form id="platform-company-save-form" onSubmit={(e) => void handleSave(e)} className="platform-drawer-form">
            <section className="platform-drawer-section">
              <h3>Competiciones</h3>
              <p className="platform-drawer-section-lead">
                Actual: <strong>{scopeLabel(company.competitionScope)}</strong>. Los usuarios solo verán la
                disciplina elegida.
              </p>
              <div className="platform-scope-options" role="radiogroup" aria-label="Competiciones de la empresa">
                {COMPANY_SCOPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`platform-scope-option${scopeDraft === opt.value ? " platform-scope-option--selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="companyScope"
                      value={opt.value}
                      checked={scopeDraft === opt.value}
                      onChange={() => setScopeDraft(opt.value)}
                    />
                    <span className="platform-scope-option-title">{opt.title}</span>
                    <span className="platform-scope-option-desc">{opt.description}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="platform-drawer-section">
              <h3>Cupos (asientos)</h3>
              <p className="platform-drawer-section-lead">
                {seatsUsed} en uso de {company.seatLimit} contratados.
                {seatsOver ? (
                  <span className="platform-drawer-warn"> No podés bajar por debajo de los usuarios activos.</span>
                ) : null}
              </p>
              <label className="platform-drawer-field">
                <span>Límite de usuarios activos</span>
                <input
                  type="number"
                  min={Math.max(1, seatsUsed)}
                  value={seatDraft}
                  onChange={(e) => setSeatDraft(e.target.value)}
                />
              </label>
            </section>
          </form>

          <section className="platform-drawer-section">
            <h3>Administradores</h3>
            {company.orgAdmins.length === 0 ? (
              <p className="placeholder-text">Sin org_admin activo.</p>
            ) : (
              <ul className="platform-drawer-admin-list">
                {company.orgAdmins.map((admin) => (
                  <li key={admin.id} className="platform-drawer-admin-item">
                    <span className="platform-drawer-admin-email">{admin.email}</span>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        setErr("");
                        setResetAdminId(resetAdminId === admin.id ? null : admin.id);
                        setResetPass("");
                        setResetPass2("");
                      }}
                    >
                      {resetAdminId === admin.id ? "Cancelar" : "Restablecer clave"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {resetAdminId ? (
              <form onSubmit={(e) => void handlePasswordReset(e)} className="platform-drawer-reset-form">
                <p className="platform-drawer-section-lead">
                  Nueva contraseña para{" "}
                  <strong>{company.orgAdmins.find((a) => a.id === resetAdminId)?.email}</strong>
                </p>
                <label className="platform-drawer-field">
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
                <label className="platform-drawer-field">
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
                <button type="submit" className="btn-secondary btn-sm" disabled={resetBusy}>
                  {resetBusy ? "Guardando…" : "Guardar contraseña"}
                </button>
              </form>
            ) : null}
          </section>

          <footer className="platform-drawer-footer">
            {hasChanges ? (
              <span className="platform-drawer-unsaved" aria-live="polite">
                Cambios sin guardar
              </span>
            ) : (
              <span />
            )}
            <div className="platform-drawer-footer-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                Cerrar
              </button>
              <button
                type="submit"
                form="platform-company-save-form"
                className="btn-primary"
                disabled={saving || !hasChanges || seatsOver}
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </footer>
        </div>
      </aside>
    </div>
  );
}
