import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvite, fetchInvitePreview } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshSession } = useAuth();
  const token = params.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [previewErr, setPreviewErr] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitErr, setSubmitErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token || token.length < 10) {
      setPreviewErr("Enlace inválido o incompleto.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const p = await fetchInvitePreview(token);
        setCompanyName(p.companyName);
        setEmail(p.email);
      } catch (e) {
        setPreviewErr(e instanceof Error ? e.message : "No se pudo cargar la invitación.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr("");
    if (password.length < 6) {
      setSubmitErr("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      await acceptInvite(token, password, fullName.trim() || undefined);
      await refreshSession();
      navigate("/app", { replace: true });
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Error al crear la cuenta.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Invitación</h1>
          <p className="auth-subtitle">Cargando…</p>
        </div>
      </div>
    );
  }

  if (previewErr) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Invitación</h1>
          <div className="auth-error">{previewErr}</div>
          <p className="auth-footer">
            <Link to="/login">Ir al inicio de sesión</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Unirte a {companyName}</h1>
        <p className="auth-subtitle">
          Vas a crear tu cuenta como <strong>{email}</strong>
        </p>
        {submitErr && <div className="auth-error">{submitErr}</div>}
        <form onSubmit={handleSubmit}>
          <label>
            <span>Nombre (opcional)</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label>
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Creando cuenta…" : "Aceptar y entrar"}
          </button>
        </form>
        <p className="auth-footer">
          <Link to="/login">Ya tengo cuenta</Link>
        </p>
      </div>
    </div>
  );
}
