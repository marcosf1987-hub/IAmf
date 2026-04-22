import { useEffect, useState } from "react";
import { fetchOAuthConfig, googleOAuthStartUrl } from "../lib/api";

/**
 * Bloque «Continuar con Google» en login / signup.
 * Siempre visible: el enlace solo está activo cuando el backend confirma OAuth listo.
 */
export default function SocialLoginButtons() {
  const [checked, setChecked] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [idSet, setIdSet] = useState<boolean | undefined>();
  const [secretSet, setSecretSet] = useState<boolean | undefined>();
  const [baseSet, setBaseSet] = useState<boolean | undefined>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await fetchOAuthConfig();
      if (cancelled) return;
      setFetchFailed(cfg.fetchFailed);
      setGoogleReady(cfg.google);
      setIdSet(cfg.googleClientIdSet);
      setSecretSet(cfg.googleClientSecretSet);
      setBaseSet(cfg.oauthPublicBaseSet);
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startUrl = googleOAuthStartUrl();

  return (
    <div className="auth-oauth">
      <div className="auth-oauth-divider" aria-hidden="true">
        <span>o</span>
      </div>
      <div className="auth-oauth-buttons">
        {checked && googleReady ? (
          <a className="btn-oauth btn-oauth-google" href={startUrl}>
            Continuar con Google
          </a>
        ) : (
          <button
            type="button"
            className="btn-oauth btn-oauth-google btn-oauth--disabled"
            disabled
            title={
              !checked
                ? "Comprobando configuración…"
                : "El servidor no tiene Google OAuth configurado (OAUTH_* y FRONTEND_URL)."
            }
          >
            Continuar con Google
          </button>
        )}
      </div>
      <p className="auth-oauth-hint">
        {!checked && "Comprobando si el inicio con Google está disponible…"}
        {checked && googleReady && "Te redirigimos a Google y volvés a la app con tu sesión iniciada."}
        {checked && !googleReady && !fetchFailed && (
          <>
            {(() => {
              const missing: string[] = [];
              if (baseSet === false) missing.push("OAUTH_PUBLIC_BASE_URL");
              if (idSet === false) missing.push("OAUTH_GOOGLE_CLIENT_ID");
              if (secretSet === false) missing.push("OAUTH_GOOGLE_CLIENT_SECRET");
              if (missing.length > 0) {
                return (
                  <>
                    El API indica que en el proceso del servidor no llega valor para:{" "}
                    <strong>{missing.join(", ")}</strong>. Revisá que estén en el servicio del{" "}
                    <strong>backend</strong> (mismo entorno), guardá y <strong>Redeploy</strong>.
                  </>
                );
              }
              return (
                <>
                  Si ya cargaste las variables en Railway, hacé <strong>Redeploy</strong> del backend:
                  el último deploy debe incluir el código que lee <code>OAUTH_*</code> como literales
                  en el servidor.
                </>
              );
            })()}
          </>
        )}
        {checked && fetchFailed && (
          <>
            No se pudo contactar al API para comprobar Google. Revisá la conexión o{" "}
            <code>VITE_API_URL</code> en el build del frontend.
          </>
        )}
      </p>
    </div>
  );
}
