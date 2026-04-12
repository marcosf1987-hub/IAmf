import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

function appNavLinkClass(pathname: string, to: string): string {
  if (to === "/app") {
    return pathname === "/app" || pathname === "/app/" ? "app-nav-link--current" : "";
  }
  if (to === "/app/ligas") {
    return pathname.startsWith("/app/ligas") ? "app-nav-link--current" : "";
  }
  return pathname === to || pathname.startsWith(`${to}/`) ? "app-nav-link--current" : "";
}

export default function AppLayout() {
  const { user, loading, logout } = useAuth();
  const { pathname } = useLocation();
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
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
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
          <nav className="app-nav" aria-label="Secciones principales">
            <Link
              to="/app"
              className={appNavLinkClass(pathname, "/app")}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname === "/app" || pathname === "/app/" ? "page" : undefined}
            >
              Inicio
            </Link>
            <Link
              to="/app/prode"
              className={appNavLinkClass(pathname, "/app/prode")}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname.startsWith("/app/prode") ? "page" : undefined}
            >
              Mis Predicciones
            </Link>
            <Link
              to="/app/ia"
              className={appNavLinkClass(pathname, "/app/ia")}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname.startsWith("/app/ia") ? "page" : undefined}
            >
              Laboratorio
            </Link>
            <Link
              to="/app/resultados"
              className={appNavLinkClass(pathname, "/app/resultados")}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname.startsWith("/app/resultados") ? "page" : undefined}
            >
              Mis resultados
            </Link>
            <Link
              to="/app/ligas"
              className={appNavLinkClass(pathname, "/app/ligas")}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname.startsWith("/app/ligas") ? "page" : undefined}
            >
              Ligas &amp; Comunidad
            </Link>
            <Link
              to="/app/perfil"
              className={appNavLinkClass(pathname, "/app/perfil")}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname.startsWith("/app/perfil") ? "page" : undefined}
            >
              Mi usuario
            </Link>
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
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
