import { useEffect, useState } from "react";
import { Link, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function AppLayout() {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Cargando…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <Link to="/app" className="app-logo" onClick={() => setMenuOpen(false)}>
          <span className="app-logo-brand">Promptplay</span>
          <span className="app-logo-sub">World Cup Edition</span>
        </Link>
        <button
          type="button"
          className="app-menu-toggle"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
        >
          <span className={menuOpen ? "icon-close" : "icon-menu"} />
        </button>
        {menuOpen && (
          <div
            className="app-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}
        <div className={`app-header-menu ${menuOpen ? "app-header-menu-open" : ""}`}>
          <nav className="app-nav">
            <Link to="/app" onClick={() => setMenuOpen(false)}>Inicio</Link>
            <Link to="/app/prode" onClick={() => setMenuOpen(false)}>Mis Predicciones</Link>
            <Link to="/app/ia" onClick={() => setMenuOpen(false)}>Laboratorio</Link>
            <Link to="/app/resultados" onClick={() => setMenuOpen(false)}>Mis resultados</Link>
            <Link to="/app/perfil" onClick={() => setMenuOpen(false)}>Mi usuario</Link>
          </nav>
          <div className="app-header-right">
            {user.role === "org_admin" && (
              <Link to="/app/admin" className="nav-admin" onClick={() => setMenuOpen(false)}>
                Admin
              </Link>
            )}
            {user.role === "super_admin" && (
              <Link to="/app/platform" className="nav-admin" onClick={() => setMenuOpen(false)}>
                Plataforma
              </Link>
            )}
            <div className="app-user">
              <span>{user.fullName || user.email}</span>
              <button type="button" onClick={() => { logout(); setMenuOpen(false); }} className="btn-logout">
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
