import { useEffect, useState } from "react";
import { fetchOAuthConfig, googleOAuthStartUrl } from "../lib/api";

/**
 * Bloque «Continuar con Google» en login / signup.
 * El enlace a `/auth/oauth/google/start` siempre es clicable (aunque el config diga que falten variables)
 * para poder depurar la respuesta del API en el navegador.
 */
export default function SocialLoginButtons() {
  const [checked, setChecked] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [idSet, setIdSet] = useState<boolean | undefined>();
  const [secretSet, setSecretSet] = useState<boolean | undefined>();
  const [baseSet, setBaseSet] = useState<boolean | undefined>();
  const [oauthFmt, setOauthFmt] = useState<number | undefined>();

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
      setOauthFmt(cfg.oauthConfigFormat);
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
          title={
            checked && !googleReady
              ? "El config indica variables faltantes; igual podés abrir el start y ver el JSON o la redirección."
              : undefined
          }
        >
          Continuar con Google
        </a>
      </div>
      <p className="auth-oauth-hint">
        {!checked && "Comprobando si el inicio con Google está disponible…"}
        {checked && googleReady && "Te redirigimos a Google y volvés a la app con tu sesión iniciada."}
        {checked && !googleReady && !fetchFailed && (
          <span className="auth-oauth-hint auth-oauth-hint--muted" style={{ display: "block", marginTop: "0.35rem" }}>
            Podés clicar el botón igual: si falta configuración verás JSON (p. ej. <code>oauth_not_configured</code>) o
            el error en la pestaña Red del navegador.
          </span>
        )}
        {checked && !googleReady && !fetchFailed && oauthFmt !== 2 && (
          <span className="auth-oauth-hint auth-oauth-hint--muted">
            El API no devuelve la versión nueva de configuración OAuth. Hacé <strong>Redeploy</strong> del
            servicio <strong>backend</strong> en Railway (último código de <code>main</code>) y probá de
            nuevo.
          </span>
        )}
        {checked && !googleReady && !fetchFailed && oauthFmt === 2 && (
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
                  Si ya cargaste las variables en Railway, hacé <strong>Redeploy</strong> del backend
                  (reiniciar el proceso) y probá con ventana privada o <kbd>Ctrl</kbd>+<kbd>F5</kbd> en
                  esta página.
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
