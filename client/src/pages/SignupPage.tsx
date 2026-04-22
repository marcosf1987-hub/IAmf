import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import { useAuth } from "../contexts/AuthContext";
import { isProductionApiUrlMissing } from "../lib/api";

export default function SignupPage() {
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
      const msg = err instanceof Error ? err.message : "Error al registrarse";
      setError(msg === "email_in_use" ? "Ese email ya está registrado" : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingLayout mainVariant="auth">
      <div className="auth-page">
        <div className="auth-card">
        <h1>Crear cuenta</h1>
        <p className="auth-subtitle">Únete al programa de IA y Prode FIFA 2026</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {isProductionApiUrlMissing && (
            <div className="auth-error" role="alert">
              Falta <code>VITE_API_URL</code> en Railway (servicio frontend) → Redeploy.
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <label>
            <span>Nombre completo</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan Pérez"
              autoComplete="name"
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
              required
              autoComplete="email"
            />
          </label>
          <label>
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Creando cuenta…" : "Registrarse"}
          </button>
        </form>
        <p className="auth-footer">
          ¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link>
        </p>
        </div>
      </div>
    </MarketingLayout>
  );
}
