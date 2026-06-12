import { useEffect, useState } from "react";
import { fetchOAuthConfig, googleOAuthStartUrl } from "../lib/api";

/**
 * Bloque «Continuar con Google» en login / signup.
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
        <a
          className={`btn-oauth btn-oauth-google${checked && !googleReady ? " btn-oauth--unconfigured" : ""}`}
          href={startUrl}
        >
          Continuar con Google
        </a>
      </div>
      <p className="auth-oauth-hint">
        {!checked && "Comprobando si el inicio con Google está disponible…"}
        {checked && googleReady && "Te redirigimos a Google y volvés a la app con tu sesión iniciada."}
        {checked && !googleReady && !fetchFailed && (
          <span className="auth-oauth-hint auth-oauth-hint--muted" style={{ display: "block", marginTop: "0.35rem" }}>
            El inicio con Google no está disponible en este momento. Podés entrar con email y contraseña.
          </span>
        )}
        {checked && fetchFailed && (
          <span className="auth-oauth-hint auth-oauth-hint--muted" style={{ display: "block", marginTop: "0.35rem" }}>
            No pudimos comprobar el inicio con Google. Revisá tu conexión o probá con email y contraseña.
          </span>
        )}
      </p>
    </div>
  );
}
