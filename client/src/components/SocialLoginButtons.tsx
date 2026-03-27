import { useEffect, useState } from "react";
import { fetchOAuthConfig, oauthStartUrl } from "../lib/api";

export default function SocialLoginButtons() {
  const [cfg, setCfg] = useState<{ google: boolean; facebook: boolean; microsoft: boolean } | null>(null);

  useEffect(() => {
    void fetchOAuthConfig().then(setCfg);
  }, []);

  const providers = [
    { id: "google" as const, label: "Continuar con Google", className: "btn-oauth-google" },
    { id: "facebook" as const, label: "Continuar con Meta", className: "btn-oauth-facebook" },
    { id: "microsoft" as const, label: "Continuar con Microsoft", className: "btn-oauth-microsoft" },
  ];

  return (
    <div className="auth-oauth">
      <div className="auth-oauth-divider">
        <span>o continuá con</span>
      </div>
      {cfg === null ? (
        <p className="auth-oauth-hint">Cargando opciones de acceso social…</p>
      ) : (
        <>
          <div className="auth-oauth-buttons">
            {providers.map((p) => {
              if (!cfg[p.id]) {
                return (
                  <span
                    key={p.id}
                    className={`btn-oauth ${p.className} btn-oauth-disabled`}
                    title="Configurá las variables OAUTH_* de este proveedor en el servidor (API)."
                  >
                    {p.label}
                  </span>
                );
              }
              return (
                <a key={p.id} href={oauthStartUrl(p.id)} className={`btn-oauth ${p.className}`}>
                  {p.label}
                </a>
              );
            })}
          </div>
          {!cfg.google && !cfg.facebook && !cfg.microsoft && (
            <p className="auth-oauth-hint">
              Ningún proveedor OAuth está configurado en el backend. Agregá{" "}
              <code>OAUTH_GOOGLE_*</code>, <code>OAUTH_FACEBOOK_*</code> y/o <code>OAUTH_MICROSOFT_*</code> en
              las variables del servidor y reiniciá el API.
            </p>
          )}
        </>
      )}
    </div>
  );
}
