import { useEffect, useState } from "react";
import { fetchOAuthConfig, googleOAuthStartUrl } from "../lib/api";

type OAuthUiState =
  | { phase: "loading" }
  | {
      phase: "ready";
      google: boolean;
      fetchFailed: boolean;
      googleClientIdSet?: boolean;
      googleClientSecretSet?: boolean;
    };

export default function SocialLoginButtons() {
  const [state, setState] = useState<OAuthUiState>({ phase: "loading" });

  useEffect(() => {
    void fetchOAuthConfig().then((r) =>
      setState({
        phase: "ready",
        google: r.google,
        fetchFailed: r.fetchFailed,
        googleClientIdSet: r.googleClientIdSet,
        googleClientSecretSet: r.googleClientSecretSet,
      })
    );
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
          {state.googleClientIdSet === false && state.googleClientSecretSet === false ? (
            <>
              El API no ve <code>OAUTH_GOOGLE_CLIENT_ID</code> ni <code>OAUTH_GOOGLE_CLIENT_SECRET</code>. Revisá que
              estén en el servicio del <strong>backend</strong> (Root <code>server</code>) en el mismo entorno que
              desplegás, sin typo en el nombre, y hacé <strong>redeploy</strong> del API.
            </>
          ) : state.googleClientSecretSet === false ? (
            <>
              El API ve el Client ID pero <strong>no</strong> el secreto: revisá{" "}
              <code>OAUTH_GOOGLE_CLIENT_SECRET</code> (valor no vacío, variable sellada o referencia bien resuelta en
              Railway) y redeploy del backend.
            </>
          ) : state.googleClientIdSet === false ? (
            <>
              El API no ve <code>OAUTH_GOOGLE_CLIENT_ID</code> (o está vacío). Corregilo en Railway y redeploy del
              backend.
            </>
          ) : (
            <>
              Google aún no queda activo. Revisá <code>OAUTH_PUBLIC_BASE_URL</code> y <code>FRONTEND_URL</code>, guardá
              variables y redeploy del API.
            </>
          )}
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
