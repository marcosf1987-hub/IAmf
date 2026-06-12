import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  acceptCompetitionInvite,
  claimCompetitionInvite,
  fetchCompetitionInvitePreview,
  formatApiError,
} from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

function postInviteLigasPath(): string {
  try {
    return localStorage.getItem("promptplay_discipline") === "f1" ? "/app/f1/ligas" : "/app/ligas";
  } catch {
    return "/app/ligas";
  }
}

export default function AcceptLeagueInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshSession } = useAuth();
  const token = params.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [previewErr, setPreviewErr] = useState("");
  const [competitionName, setCompetitionName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [inviterLabel, setInviterLabel] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);

  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitErr, setSubmitErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loginRedirect = `/login?redirect=${encodeURIComponent(`/invite/liga/accept?token=${encodeURIComponent(token)}`)}`;

  useEffect(() => {
    if (!token || token.length < 10) {
      setPreviewErr("Enlace inválido o incompleto.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const p = await fetchCompetitionInvitePreview(token);
        setCompetitionName(p.competitionName);
        setCompanyName(p.companyName);
        setEmail(p.email);
        setInviterLabel(p.inviterLabel);
        setAccountExists(p.accountExists);
      } catch (e) {
        setPreviewErr(formatApiError(e) || "No se pudo cargar la invitación.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleNewUserSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr("");
    if (password.length < 6) {
      setSubmitErr("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      await acceptCompetitionInvite(token, password, fullName.trim() || undefined);
      await refreshSession();
      navigate(postInviteLigasPath(), { replace: true });
    } catch (err) {
      setSubmitErr(formatApiError(err) || "Error al crear la cuenta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClaim() {
    setSubmitErr("");
    setSubmitting(true);
    try {
      await claimCompetitionInvite(token);
      navigate(postInviteLigasPath(), { replace: true });
    } catch (err) {
      setSubmitErr(formatApiError(err) || "No se pudo unir a la liga.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Invitación a liga</h1>
          <p className="auth-subtitle">Cargando…</p>
        </div>
      </div>
    );
  }

  if (previewErr) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Invitación a liga</h1>
          <div className="auth-error">{previewErr}</div>
          <p className="auth-footer">
            <Link to="/login">Ir al inicio de sesión</Link>
          </p>
        </div>
      </div>
    );
  }

  const emailMatch =
    user?.email && email && user.email.toLowerCase() === email.toLowerCase();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Unirte a «{competitionName}»</h1>
        <p className="auth-subtitle">
          Liga en <strong>{companyName}</strong>
          {inviterLabel ? (
            <>
              {" "}
              · Invitación de <strong>{inviterLabel}</strong>
            </>
          ) : null}
        </p>
        <p className="auth-subtitle" style={{ fontSize: "0.95rem" }}>
          Email: <strong>{email}</strong>
        </p>

        {accountExists && (
          <div style={{ marginBottom: "1rem" }}>
            {user ? (
              emailMatch ? (
                <>
                  {submitErr && <div className="auth-error">{submitErr}</div>}
                  <p>Sesión iniciada. Podés confirmar tu ingreso a la liga.</p>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={submitting}
                    onClick={() => void handleClaim()}
                  >
                    {submitting ? "Uniendo…" : "Unirme a la liga"}
                  </button>
                </>
              ) : (
                <div className="auth-error">
                  Iniciaste sesión con otro email. Cerrá sesión e ingresá con <strong>{email}</strong>, o abrí esta
                  página en una ventana privada.
                </div>
              )
            ) : (
              <>
                <p>Ya tenés cuenta con este email. Iniciá sesión y volvé a esta página para confirmar el ingreso.</p>
                <Link className="btn-primary" to={loginRedirect} style={{ display: "inline-block", marginTop: "0.5rem" }}>
                  Ir a iniciar sesión
                </Link>
              </>
            )}
          </div>
        )}

        {!accountExists && (
          <>
            <p className="auth-subtitle" style={{ fontSize: "0.95rem" }}>
              Creá tu contraseña para entrar al pool público, la liga universal y esta liga.
            </p>
            {submitErr && <div className="auth-error">{submitErr}</div>}
            <form onSubmit={(e) => void handleNewUserSubmit(e)}>
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
          </>
        )}

        <p className="auth-footer">
          <Link to="/login">Inicio de sesión</Link> · <Link to="/signup">Registrarse</Link>
        </p>
      </div>
    </div>
  );
}
