import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isProductionApiUrlMissing } from "../lib/api";
import SocialLoginButtons from "../components/SocialLoginButtons";

export default function LoginPage() {
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
      const raw = err instanceof Error ? err.message : "Error al iniciar sesión";
      let msg = raw;
      if (raw === "invalid_credentials")
        msg =
          "Email o contraseña incorrectos. Si es la primera vez en la web publicada, crea una cuenta en «Registrarse» o carga usuarios con el seed (admin@demo.com / Admin1234).";
      else if (raw.includes("JWT_SECRET")) msg = "Falta configurar JWT_SECRET en el backend (Railway → Variables).";
      else if (/P1001|database server|Can't reach database/i.test(raw))
        msg = "No se puede conectar a la base de datos. Revisa DATABASE_URL en Railway.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Iniciar sesión</h1>
        <p className="auth-subtitle">Accede a tu cuenta del programa IA + Prode</p>
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
        <SocialLoginButtons />
        <p className="auth-footer">
          ¿No tienes cuenta? <Link to="/signup">Registrarse</Link>
        </p>
      </div>
    </div>
  );
}
