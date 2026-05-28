import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import DisciplineSwitcher from "../components/DisciplineSwitcher";
import { HamburgerIcon } from "../components/HamburgerIcon";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useAppDiscipline } from "../contexts/AppDisciplineContext";
import { useAuth } from "../contexts/AuthContext";
import { scopeAllowsDiscipline } from "../lib/company-competition-scope";
import { useEscapeKey } from "../hooks/useEscapeKey";

type NavItem = { to: string; labelKey: string; end?: boolean };

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
  const { t } = useTranslation("app");
  return (
    <div className={className}>
      {user.role === "org_admin" && (
        <Link to="/app/admin" className="nav-admin" onClick={onAfterNavigate}>
          {t("layout.admin")}
        </Link>
      )}
      {user.role === "super_admin" && (
        <Link to="/app/platform" className="nav-admin" onClick={onAfterNavigate}>
          {t("layout.platform")}
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
          {t("layout.logout")}
        </button>
      </div>
    </div>
  );
}

const NAV_FOOTBALL: NavItem[] = [
  { to: "/app", labelKey: "nav.home", end: true },
  { to: "/app/prode", labelKey: "nav.predictions" },
  { to: "/app/ia", labelKey: "nav.promptLab" },
  { to: "/app/resultados", labelKey: "nav.results" },
  { to: "/app/ligas", labelKey: "nav.leagues" },
  { to: "/app/perfil", labelKey: "nav.profile" },
];

const NAV_F1: NavItem[] = [
  { to: "/app/f1", labelKey: "nav.home", end: true },
  { to: "/app/f1/predicciones", labelKey: "nav.f1Predictions" },
  { to: "/app/f1/laboratorio", labelKey: "nav.f1Lab" },
  { to: "/app/f1/resultados", labelKey: "nav.results" },
  { to: "/app/f1/ligas", labelKey: "nav.leagues" },
  { to: "/app/perfil", labelKey: "nav.profile" },
];

function isFootballAppPath(pathname: string): boolean {
  if (!pathname.startsWith("/app")) return false;
  if (pathname.startsWith("/app/f1")) return false;
  if (pathname.startsWith("/app/contexto")) return false;
  if (pathname === "/app" || pathname === "/app/") return false;
  if (pathname.startsWith("/app/admin") || pathname.startsWith("/app/platform")) return false;
  if (pathname.startsWith("/app/perfil")) return false;
  return true;
}

export default function AppLayout() {
  const { t } = useTranslation("app");
  const { user, company, loading, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { discipline, setDiscipline } = useAppDiscipline();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuFirstLinkRef = useRef<HTMLAnchorElement>(null);
  const scope = company?.competitionScope;

  const arenaPicker = pathname.startsWith("/app/contexto");

  useEffect(() => {
    if (!scope || scope === "all") return;
    if (pathname.startsWith("/app/f1") && !scopeAllowsDiscipline(scope, "f1")) {
      setDiscipline("football", { navigateToHub: true });
      navigate("/app", { replace: true });
      return;
    }
    if (isFootballAppPath(pathname) && !scopeAllowsDiscipline(scope, "football")) {
      setDiscipline("f1", { navigateToHub: true });
      navigate("/app/f1", { replace: true });
    }
  }, [pathname, scope, navigate, setDiscipline]);
  const navItems = discipline === "f1" ? NAV_F1 : NAV_FOOTBALL;
  const logoHref = discipline === "f1" ? "/app/f1" : "/app";
  const logoSub = discipline === "f1" ? t("layout.logoF1") : t("layout.logoFootball");

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
        <p>{t("layout.loading")}</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={`app-layout app-layout--discipline-${discipline}`}>
      <a href="#main-content" className="skip-link">
        {t("layout.skipToContent")}
      </a>
      <header className={`app-header${arenaPicker ? " app-header--arena-picker" : ""}`}>
        <div className="app-header-lead">
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
          aria-label={menuOpen ? t("layout.closeMenu") : t("layout.openMenu")}
          aria-expanded={menuOpen}
          aria-controls="app-header-menu-panel"
        >
          {menuOpen ? <span className="icon-close" aria-hidden /> : <HamburgerIcon />}
        </button>
        {menuOpen && (
          <div className="app-menu-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        )}
        <div
          id="app-header-menu-panel"
          className={`app-header-menu ${menuOpen ? "app-header-menu-open" : ""}`}
        >
          <nav className="app-nav" aria-label={t("layout.navSections")}>
            {navItems.map((item, i) => (
              <Link
                key={item.to}
                ref={i === 0 ? menuFirstLinkRef : undefined}
                to={item.to}
                className={navClass(pathname, item)}
                onClick={() => setMenuOpen(false)}
                aria-current={isNavCurrent(pathname, item) ? "page" : undefined}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="app-header-end">
            <LanguageSwitcher compact className="app-header-lang" />
            {!arenaPicker ? <DisciplineSwitcher /> : null}
            <HeaderAccountSection
              user={user}
              logout={logout}
              onAfterNavigate={() => setMenuOpen(false)}
              className="app-header-right app-header-right--desktop-bar"
            />
          </div>
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
