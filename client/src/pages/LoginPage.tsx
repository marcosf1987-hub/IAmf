import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import SocialLoginButtons from "../components/SocialLoginButtons";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError, isProductionApiUrlMissing } from "../lib/api";
import { resolveUserErrorMessage } from "../i18n/translate-api-error";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectAfterLogin = searchParams.get("redirect");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      if (
        redirectAfterLogin &&
        redirectAfterLogin.startsWith("/") &&
        !redirectAfterLogin.startsWith("//")
      ) {
        navigate(redirectAfterLogin);
      } else {
        navigate("/app");
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : t("errors:generic.loginFailed");
      if (raw === "invalid_credentials") {
        setError(t("errors:login.invalidCredentials"));
      } else if (/JWT_SECRET/i.test(raw)) {
        setError(t("errors:login.jwtSecret"));
      } else if (/P1001|database server|Can't reach database/i.test(raw)) {
        setError(t("errors:login.database"));
      } else {
        setError(formatApiError(err instanceof Error ? err : new Error(resolveUserErrorMessage(raw))));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingLayout mainVariant="auth">
      <div className="auth-page">
        <div className="auth-card">
        <h1>{t("login.title")}</h1>
        <p className="auth-subtitle">{t("login.subtitle")}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {isProductionApiUrlMissing && (
            <div className="auth-error" role="alert">
              {t("login.missingApiUrl")}
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <label>
            <span>{t("login.email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("login.emailPlaceholder")}
              required
              autoComplete="email"
            />
          </label>
          <label>
            <span>{t("login.password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? t("login.submitting") : t("login.submit")}
          </button>
        </form>
        <SocialLoginButtons />
        <p className="auth-footer">
          {t("login.noAccount")} <Link to="/signup">{t("login.signupLink")}</Link>
        </p>
        </div>
      </div>
    </MarketingLayout>
  );
}
