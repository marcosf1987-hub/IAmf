import { Link } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import UpcomingEventsCarousel from "../components/UpcomingEventsCarousel";
import { getCurrentPhase, formatTimeLeftLong } from "../lib/prode-phases";

export default function HomePage() {
  return (
    <MarketingLayout>
        <div className="home-hero">
          <h1>Analiza. Predice. Compite.</h1>
          <div className="home-cta">
            <Link to="/signup" className="btn-primary btn-large">
              Empezar ahora
            </Link>
            <Link to="/login" className="btn-secondary btn-large">
              Ya tengo cuenta
            </Link>
          </div>
          <p className="home-lead home-subtitle">
            ¿Eres bueno con la IA? Demuéstralo.
          </p>
          <p className="home-lead">
            Lleva tu uso de la IA al siguiente nivel. Entrena tus habilidades de prompting diseñando la
            estrategia ganadora. Demuestra que puedes lograr la IA más precisa de todo tu equipo.
          </p>
          <section className="dashboard-tip home-tip" aria-label="Cómo funciona PromptPlay">
            <p className="dashboard-tip-text">
              💡 En PromptPlay no completas los resultados a mano. Diseñas las instrucciones lógicas para tu IA y
              ella simula todo el fixture por vos.
            </p>
          </section>
          <p className="home-countdown">
            {getCurrentPhase() ? (
              <>
                Faltan <strong>{formatTimeLeftLong(getCurrentPhase()!.deadline)}</strong> para el cierre de carga de la
                fase actual.
              </>
            ) : (
              "El cierre de carga de modelos ya finalizó."
            )}
          </p>
        </div>

        <UpcomingEventsCarousel className="home-upcoming-carousel" />

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
    </MarketingLayout>
  );
}
