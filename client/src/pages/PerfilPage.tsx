import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError, updateMe } from "../lib/api";

function roleLabel(role: string, t: (k: string) => string): string {
  if (role === "super_admin") return t("roles.super_admin");
  if (role === "org_admin") return t("roles.org_admin");
  return t("roles.participant");
}

export default function PerfilPage() {
  const { t } = useTranslation("profile");
  const { user, refreshSession } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? "");

  useEffect(() => {
    if (user) setFullName(user.fullName ?? "");
  }, [user]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (password && password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    if (password && password.length < 6) {
      setError(t("passwordMin"));
      return;
    }

    setLoading(true);
    try {
      const updates: { fullName?: string; password?: string } = {};
      if (fullName.trim()) updates.fullName = fullName.trim();
      if (password) updates.password = password;

      if (Object.keys(updates).length === 0) {
        setError(t("nothingToSave"));
        setLoading(false);
        return;
      }

      await updateMe(updates);
      await refreshSession();
      setPassword("");
      setConfirmPassword("");
      setSuccess(t("success"));
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="page-content">
      <h1>{t("title")}</h1>
      <p className="page-subtitle">{t("subtitle")}</p>

      {error && <div className="auth-error">{error}</div>}
      {success && (
        <div className="auth-success" role="status">
          {success}
        </div>
      )}

      <div className="perfil-info">
        <p><strong>{t("email")}</strong> {user.email}</p>
        <p><strong>{t("role")}</strong> {roleLabel(user.role, t)}</p>
      </div>

      <form onSubmit={handleSubmit} className="perfil-form">
        <label>
          <span>{t("fullName")}</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("namePlaceholder")}
          />
        </label>
        <label>
          <span>{t("newPassword")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={6}
          />
        </label>
        <label>
          <span>{t("confirmPassword")}</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? t("saving") : t("save")}
        </button>
      </form>
    </div>
  );
}
