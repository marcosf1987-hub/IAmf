import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import { useAuth } from "../contexts/AuthContext";

/**
 * El API redirige aquí con <code>#token=…</code> o <code>#error=…</code> tras Google OAuth.
 */
export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [message, setMessage] = useState("Completando inicio de sesión…");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      setIsError(true);
      setMessage(err);
      return;
    }

    if (!token || token.length < 10) {
      setIsError(true);
      setMessage("Respuesta inválida del servidor. Probá iniciar sesión de nuevo.");
      return;
    }

    void (async () => {
      try {
        await loginWithToken(token);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        navigate("/app", { replace: true });
      } catch (e) {
        setIsError(true);
        setMessage(e instanceof Error ? e.message : "No se pudo validar la sesión.");
      }
    })();
  }, [loginWithToken, navigate]);

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
