import { useEffect, useState } from "react";
import { fetchOAuthConfig, oauthStartUrl } from "../lib/api";

export default function SocialLoginButtons() {
  const [cfg, setCfg] = useState<{ google: boolean; facebook: boolean; microsoft: boolean } | null>(null);

  useEffect(() => {
    void fetchOAuthConfig().then(setCfg);
  }, []);

  if (!cfg) return null;
  const any = cfg.google || cfg.facebook || cfg.microsoft;
  if (!any) return null;

  return (
    <div className="auth-oauth">
      <div className="auth-oauth-divider">
        <span>o continuá con</span>
      </div>
      <div className="auth-oauth-buttons">
        {cfg.google && (
          <a href={oauthStartUrl("google")} className="btn-oauth btn-oauth-google">
            Continuar con Google
          </a>
        )}
        {cfg.facebook && (
          <a href={oauthStartUrl("facebook")} className="btn-oauth btn-oauth-facebook">
            Continuar con Meta
          </a>
        )}
        {cfg.microsoft && (
          <a href={oauthStartUrl("microsoft")} className="btn-oauth btn-oauth-microsoft">
            Continuar con Microsoft
          </a>
        )}
      </div>
    </div>
  );
}
