import { useEffect, useState } from "react";
import { fetchOAuthConfig, googleOAuthStartUrl } from "../lib/api";

type OAuthUiState =
  | { phase: "loading" }
  | { phase: "ready"; google: boolean; fetchFailed: boolean };

export default function SocialLoginButtons() {
  const [state, setState] = useState<OAuthUiState>({ phase: "loading" });

  useEffect(() => {
    void fetchOAuthConfig().then((r) => setState({ phase: "ready", google: r.google, fetchFailed: r.fetchFailed }));
  }, []);

  return (
    <div className="auth-oauth">
      <div className="auth-oauth-divider">
        <span>o continúa con</span>
      </div>
      {state.phase === "loading" ? (
        <p className="auth-oauth-hint">Cargando acceso con Google…</p>
      ) : state.fetchFailed ? (
        <p className="auth-oauth-hint auth-oauth-hint--error">
          No se pudo contactar al servidor para comprobar Google. Revisá que{" "}
          <code>VITE_API_URL</code> en el build del frontend sea la URL <code>https</code> del API (sin barra final) y
          que el dominio permita peticiones desde este sitio; luego volvé a desplegar el frontend.
        </p>
      ) : !state.google ? (
        <p className="auth-oauth-hint">
          Google no está activo en el API. En Railway (servicio del backend) configurá{" "}
          <code>OAUTH_GOOGLE_CLIENT_ID</code> y <code>OAUTH_GOOGLE_CLIENT_SECRET</code> (y recomendado:{" "}
          <code>OAUTH_PUBLIC_BASE_URL</code>, <code>FRONTEND_URL</code>), guardá y redeploy del API.
        </p>
      ) : (
        <div className="auth-oauth-buttons">
          <a href={googleOAuthStartUrl()} className="btn-oauth btn-oauth-google">
            Continuar con Google
          </a>
        </div>
      )}
    </div>
  );
}
