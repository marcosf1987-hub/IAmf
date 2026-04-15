import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import UpcomingMatchesCarousel from "../components/UpcomingMatchesCarousel";
import { getCurrentPhase, formatTimeLeftLong } from "../lib/prode-phases";

export default function HomePage() {
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

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-logo">
          <span className="home-logo-brand">Promptplay</span>
          <span className="home-logo-sub">World Cup Edition</span>
        </div>
        <button
          type="button"
          className="home-menu-toggle"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
        >
          <span className={menuOpen ? "icon-close" : "icon-menu"} />
        </button>
        {menuOpen && (
          <div
            className="home-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}
        <nav className={`home-nav ${menuOpen ? "home-nav-open" : ""}`}>
          <Link to="/pricing" className="nav-link" onClick={() => setMenuOpen(false)}>
            Precios
          </Link>
          <Link to="/login" className="nav-link" onClick={() => setMenuOpen(false)}>
            Iniciar sesión
          </Link>
          <Link to="/signup" className="nav-link nav-link-accent" onClick={() => setMenuOpen(false)}>
            Registrarse
          </Link>
        </nav>
      </header>

      <main className="home-hero">
        <h1>Analiza. Predice. Compite.</h1>
        <p className="home-lead home-subtitle">
          Domina la IA y convierte los datos en decisiones.
        </p>
        <p className="home-lead">
          Lleva tu capacidad de análisis al siguiente nivel. Entrena tus habilidades de prompting
          diseñando la estrategia ganadora para el Mundial y demuestra que puedes lograr la IA más
          precisa de todo tu equipo.
        </p>
        <div className="home-cta">
          <Link to="/signup" className="btn-primary btn-large">
            Empezar ahora
          </Link>
          <Link to="/login" className="btn-secondary btn-large">
            Ya tengo cuenta
          </Link>
        </div>
        <p className="home-countdown">
          {getCurrentPhase() ? (
            <>Faltan <strong>{formatTimeLeftLong(getCurrentPhase()!.deadline)}</strong> para el cierre de carga de la fase actual.</>
          ) : (
            "El cierre de carga de modelos ya finalizó."
          )}
        </p>
      </main>

      <section className="home-features">
        <div className="feature-card">
          <div className="feature-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h3>ANALIZA</h3>
          <p>Busca información y utiliza la IA para encontrar patrones donde otros solo ven números.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 10.5 7.5 6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3Z" />
            </svg>
          </div>
          <h3>PREDICE</h3>
          <p>Construye prompts de alta complejidad para generar proyecciones automatizadas.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 15V17c0 .5-.4 1-1 1s-1 .5-1 1v2" />
              <path d="M14 15V17c0 .5.4 1 1 1s1 .5 1 1v2" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </div>
          <h3>COMPITE</h3>
          <p>Mide la efectividad de tu lógica contra la de tus colegas en un ranking de precisión en tiempo real.</p>
        </div>
      </section>

      <UpcomingMatchesCarousel variant="marketing" className="home-upcoming-carousel" />

      <footer className="home-footer">
        <p>PromptPlay 2026 - Conviértete en un Prompt Master</p>
      </footer>
    </div>
  );
}
