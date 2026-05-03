import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { HamburgerIcon } from "./HamburgerIcon";

type Props = {
  children: ReactNode;
  /** Centra el formulario en login / signup */
  mainVariant?: "default" | "auth";
};

export default function MarketingLayout({ children, mainVariant = "default" }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname === "/login" || pathname === "/signup") {
      setMenuOpen(false);
    }
  }, [pathname]);

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

  const mainClass =
    mainVariant === "auth" ? "home-main marketing-layout-main--auth" : "home-main";

  return (
    <div className="home-page">
      <header className="home-header">
        <Link to="/" className="home-logo" onClick={() => setMenuOpen(false)}>
          <span className="home-logo-brand">Promptplay</span>
          <span className="home-logo-sub">World Cup Edition</span>
        </Link>
        <button
          type="button"
          className="home-menu-toggle"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <span className="icon-close" aria-hidden /> : <HamburgerIcon />}
        </button>
        {menuOpen && (
          <div
            className="home-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}
        <nav className={`home-nav ${menuOpen ? "home-nav-open" : ""}`}>
          <Link to="/login" className="nav-link" onClick={() => setMenuOpen(false)}>
            Iniciar sesión
          </Link>
          <Link to="/signup" className="nav-link nav-link-accent" onClick={() => setMenuOpen(false)}>
            Registrarse
          </Link>
        </nav>
      </header>

      <main className={mainClass}>{children}</main>

      <footer className="home-footer">
        <p>PromptPlay 2026 - Conviértete en un Prompt Master</p>
        <nav className="home-footer-legal" aria-label="Información legal">
          <Link to="/terms">Términos del servicio</Link>
          <span className="home-footer-legal-sep" aria-hidden>
            ·
          </span>
          <Link to="/privacy">Privacidad</Link>
        </nav>
      </footer>
    </div>
  );
}
