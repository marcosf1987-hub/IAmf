import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isProductionApiUrlMissing } from "../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/app");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al iniciar sesión";
      setError(msg === "invalid_credentials" ? "Email o contraseña incorrectos" : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Iniciar sesión</h1>
        <p className="auth-subtitle">Accedé a tu cuenta del programa IA + Prode</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {isProductionApiUrlMissing && (
            <div className="auth-error" role="alert">
              Falta configurar la URL del servidor en el despliegue. En Railway → servicio del frontend → Variables →{" "}
              <code>VITE_API_URL</code> = tu URL del backend (https://…, sin / al final) → Redeploy.
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
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
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="auth-footer">
          ¿No tenés cuenta? <Link to="/signup">Registrarse</Link>
        </p>
      </div>
    </div>
  );
}
