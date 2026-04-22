import { useEffect, useState } from "react";
import { fetchOAuthConfig, googleOAuthStartUrl } from "../lib/api";

/**
 * Bloque opcional «Continuar con Google» en login / signup.
 * Solo se muestra si el backend expone `/auth/oauth/config` con `google: true`.
 */
export default function SocialLoginButtons() {
  const [ready, setReady] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await fetchOAuthConfig();
      if (cancelled) return;
      setFetchFailed(cfg.fetchFailed);
      setReady(cfg.google);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready && !fetchFailed) {
    return null;
  }

  if (!ready && fetchFailed) {
    return (
      <div className="auth-oauth">
        <p className="auth-oauth-hint auth-oauth-hint--muted">
          No se pudo comprobar el inicio con Google. Revisá la conexión o <code>VITE_API_URL</code>.
        </p>
      </div>
    );
  }

  if (!ready) return null;

  const startUrl = googleOAuthStartUrl();

  return (
    <div className="auth-oauth">
      <div className="auth-oauth-divider" aria-hidden="true">
        <span>o</span>
      </div>
      <div className="auth-oauth-buttons">
        <a className="btn-oauth btn-oauth-google" href={startUrl}>
          Continuar con Google
        </a>
      </div>
      <p className="auth-oauth-hint">
        Te redirigimos a Google y volvés a la app con tu sesión iniciada.
      </p>
    </div>
  );
}
