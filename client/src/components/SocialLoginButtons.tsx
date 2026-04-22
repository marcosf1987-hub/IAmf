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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await fetchOAuthConfig();
      if (cancelled) return;
      setFetchFailed(cfg.fetchFailed);
      setGoogleReady(cfg.google);
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
        {checked && !googleReady && !fetchFailed &&
          "En este entorno Google no está activo todavía: en el backend hacen falta OAUTH_PUBLIC_BASE_URL, OAUTH_GOOGLE_CLIENT_ID y OAUTH_GOOGLE_CLIENT_SECRET (y FRONTEND_URL para volver del login)."}
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
