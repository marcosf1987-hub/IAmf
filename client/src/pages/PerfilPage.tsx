import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { updateMe } from "../lib/api";

export default function PerfilPage() {
  const { user, setUser } = useAuth();
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
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password && password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const updates: { fullName?: string; password?: string } = {};
      if (fullName.trim()) updates.fullName = fullName.trim();
      if (password) updates.password = password;

      if (Object.keys(updates).length === 0) {
        setError("No hay cambios para guardar");
        setLoading(false);
        return;
      }

      const { user: updated } = await updateMe(updates);
      setUser(updated);
      setPassword("");
      setConfirmPassword("");
      setSuccess("Datos actualizados correctamente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div className="page-content">
      <h1>Mi usuario</h1>
      <p className="page-subtitle">Ver y editar tus datos de perfil</p>

      {error && <div className="auth-error">{error}</div>}
      {success && <div className="auth-success">{success}</div>}

      <div className="perfil-info">
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Rol:</strong> {user.role === "admin" ? "Admin (RRHH)" : "Empleado"}</p>
      </div>

      <form onSubmit={handleSubmit} className="perfil-form">
        <label>
          <span>Nombre completo</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
          />
        </label>
        <label>
          <span>Nueva contraseña (dejar vacío para no cambiar)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={6}
          />
        </label>
        <label>
          <span>Confirmar contraseña</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
