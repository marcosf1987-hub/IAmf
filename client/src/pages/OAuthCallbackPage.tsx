import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [err, setErr] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const errorRaw = params.get("error");
    const token = params.get("token");

    if (errorRaw) {
      try {
        setErr(decodeURIComponent(errorRaw.replace(/\+/g, " ")));
      } catch {
        setErr(errorRaw);
      }
      return;
    }

    if (!token) {
      setErr("No se recibió el token de acceso. Vuelve a intentar desde el inicio de sesión.");
      return;
    }

    void (async () => {
      try {
        await loginWithToken(token);
        navigate("/app", { replace: true });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "No se pudo validar la sesión.");
      }
    })();
  }, [loginWithToken, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{err ? "No se pudo iniciar sesión" : "Iniciando sesión…"}</h1>
        {!err && <p className="auth-subtitle">Validando tu cuenta…</p>}
        {err && <div className="auth-error">{err}</div>}
        {err && (
          <p className="auth-footer" style={{ marginTop: "1rem" }}>
            <Link to="/login">Volver al inicio de sesión</Link>
          </p>
        )}
      </div>
    </div>
  );
}
