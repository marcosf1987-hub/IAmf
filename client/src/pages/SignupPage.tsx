import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import SocialLoginButtons from "../components/SocialLoginButtons";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError, isProductionApiUrlMissing } from "../lib/api";

export default function SignupPage() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(email, password, fullName || undefined);
      navigate("/app");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingLayout mainVariant="auth">
      <div className="auth-page">
        <div className="auth-card">
        <h1>{t("signup.title")}</h1>
        <p className="auth-subtitle">{t("signup.subtitle")}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {isProductionApiUrlMissing && (
            <div className="auth-error" role="alert">
              {t("signup.missingApiUrl")}
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <label>
            <span>{t("signup.name")}</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("signup.namePlaceholder")}
              autoComplete="name"
            />
          </label>
          <label>
            <span>{t("signup.email")}</span>
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
            <span>{t("signup.password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("signup.passwordPlaceholder")}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? t("signup.submitting") : t("signup.submit")}
          </button>
        </form>
        <p className="auth-legal-consent">
          <Trans
            i18nKey="signup.legal"
            ns="auth"
            components={{
              terms: <Link to="/terms" />,
              privacy: <Link to="/privacy" />,
            }}
          />
        </p>
        <SocialLoginButtons />
        <p className="auth-footer">
          {t("signup.hasAccount")} <Link to="/login">{t("signup.loginLink")}</Link>
        </p>
        </div>
      </div>
    </MarketingLayout>
  );
}
