import { useEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import DisciplineSwitcher from "../components/DisciplineSwitcher";
import { useAppDiscipline } from "../contexts/AppDisciplineContext";
import { useAuth } from "../contexts/AuthContext";
import { useEscapeKey } from "../hooks/useEscapeKey";

type NavItem = { to: string; label: string; end?: boolean };

function isNavCurrent(pathname: string, item: NavItem): boolean {
  if (item.end) {
    return pathname === item.to || pathname === `${item.to}/`;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function navClass(pathname: string, item: NavItem): string {
  return isNavCurrent(pathname, item) ? "app-nav-link--current" : "";
}

type HeaderAccountProps = {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  logout: () => void | Promise<void>;
  onAfterNavigate?: () => void;
  className?: string;
};

function HeaderAccountSection({ user, logout, onAfterNavigate, className }: HeaderAccountProps) {
  return (
    <div className={className}>
      {user.role === "org_admin" && (
        <Link to="/app/admin" className="nav-admin" onClick={onAfterNavigate}>
          Admin
        </Link>
      )}
      {user.role === "super_admin" && (
        <Link to="/app/platform" className="nav-admin" onClick={onAfterNavigate}>
          Plataforma
        </Link>
      )}
      <div className="app-user">
        <span>{user.fullName || user.email}</span>
        <button
          type="button"
          onClick={() => {
            logout();
            onAfterNavigate?.();
          }}
          className="btn-logout"
        >
          Salir
        </button>
      </div>
    </div>
  );
}

function MenuIconFootball() {
  return (
    <svg className="app-menu-discipline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
      <path d="M12 3.5v2.5M12 18v2.5M3.5 12h2.5M18 12h2.5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MenuIconF1() {
  return (
    <svg className="app-menu-discipline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="2.5" strokeWidth="1.5" />
      <path
        d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

const NAV_FOOTBALL: NavItem[] = [
  { to: "/app", label: "Inicio", end: true },
  { to: "/app/prode", label: "Mis predicciones" },
  { to: "/app/ia", label: "Laboratorio · Mundial" },
  { to: "/app/resultados", label: "Mis resultados" },
  { to: "/app/ligas", label: "Mis ligas" },
  { to: "/app/perfil", label: "Mi usuario" },
];

const NAV_F1: NavItem[] = [
  { to: "/app/f1", label: "Inicio", end: true },
  { to: "/app/f1/predicciones", label: "Predicciones" },
  { to: "/app/f1/laboratorio", label: "Laboratorio · F1" },
  { to: "/app/f1/resultados", label: "Resultados" },
  { to: "/app/ligas", label: "Mis ligas" },
  { to: "/app/perfil", label: "Mi usuario" },
];

export default function AppLayout() {
  const { user, loading, logout } = useAuth();
  const { pathname } = useLocation();
  const { discipline } = useAppDiscipline();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuFirstLinkRef = useRef<HTMLAnchorElement>(null);

  const arenaPicker = pathname.startsWith("/app/contexto");
  const navItems = discipline === "f1" ? NAV_F1 : NAV_FOOTBALL;
  const logoHref = discipline === "f1" ? "/app/f1" : "/app";
  const logoSub = discipline === "f1" ? "Fórmula 1" : "Mundial 2026";

  useEscapeKey(menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
      menuFirstLinkRef.current?.focus({ preventScroll: true });
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
    <div className={`app-layout app-layout--discipline-${discipline}`}>
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      <header className={`app-header${arenaPicker ? " app-header--arena-picker" : ""}`}>
        <div className="app-header-lead">
          {!arenaPicker ? <DisciplineSwitcher /> : null}
          {arenaPicker ? (
            <div className="app-logo app-logo--arena-static" aria-label="Promptplay">
              <span className="app-logo-brand">Promptplay</span>
            </div>
          ) : (
            <Link to={logoHref} className="app-logo" onClick={() => setMenuOpen(false)}>
              <span className="app-logo-brand">Promptplay</span>
              <span className="app-logo-sub">{logoSub}</span>
            </Link>
          )}
        </div>
        <button
          type="button"
          className="app-menu-toggle"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
          aria-controls="app-header-menu-panel"
        >
          {menuOpen ? (
            <span className="icon-close" />
          ) : arenaPicker ? (
            <span className="icon-menu" />
          ) : discipline === "f1" ? (
            <MenuIconF1 />
          ) : (
            <MenuIconFootball />
          )}
        </button>
        {menuOpen && (
          <div className="app-menu-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        )}
        <div
          id="app-header-menu-panel"
          className={`app-header-menu ${menuOpen ? "app-header-menu-open" : ""}`}
        >
          <nav className="app-nav" aria-label="Secciones principales">
            {navItems.map((item, i) => (
              <Link
                key={item.to}
                ref={i === 0 ? menuFirstLinkRef : undefined}
                to={item.to}
                className={navClass(pathname, item)}
                onClick={() => setMenuOpen(false)}
                aria-current={isNavCurrent(pathname, item) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <HeaderAccountSection
            user={user}
            logout={logout}
            onAfterNavigate={() => setMenuOpen(false)}
            className="app-header-right app-header-right--mobile-drawer"
          />
        </div>
      </header>
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
