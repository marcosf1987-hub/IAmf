import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/api";

/**
 * Tras Google OAuth el API redirige con <code>?oauth=success</code> (cookies HttpOnly)
 * o <code>?oauth_error=…</code>. El hash <code>#error=…</code> queda como compatibilidad mínima.
 */
export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshSession } = useAuth();
  const [message, setMessage] = useState("Completando inicio de sesión…");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const oauthErr = search.get("oauth_error");
    if (oauthErr) {
      setIsError(true);
      setMessage(formatApiError(new Error(oauthErr)));
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    if (search.get("oauth") === "success") {
      void (async () => {
        try {
          await refreshSession();
          window.history.replaceState(null, "", window.location.pathname);
          navigate("/app", { replace: true });
        } catch (e) {
          setIsError(true);
          setMessage(formatApiError(e));
        }
      })();
      return;
    }

    const hash = window.location.hash.replace(/^#/, "");
    const hp = new URLSearchParams(hash);
    const errHash = hp.get("error");
    if (errHash) {
      setIsError(true);
      setMessage(formatApiError(new Error(errHash)));
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }

    if (hp.get("token")) {
      setIsError(true);
      setMessage(
        "Este enlace de login está desactualizado. Volvé a iniciar sesión con Google desde la pantalla de acceso."
      );
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }

    setIsError(true);
    setMessage("Respuesta inválida del servidor. Probá iniciar sesión de nuevo.");
  }, [refreshSession, navigate]);

  return (
    <MarketingLayout mainVariant="auth">
      <div className="auth-page">
        <div className="auth-card">
          <h1>Inicio con Google</h1>
          <p className={isError ? "auth-error" : "auth-subtitle"} role={isError ? "alert" : undefined}>
            {message}
          </p>
          {isError && (
            <p className="auth-footer" style={{ marginTop: "1rem" }}>
              <Link to="/login">Volver al inicio de sesión</Link>
            </p>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
