import { Link } from "react-router-dom";

const billingBase = import.meta.env.VITE_BILLING_CHECKOUT_BASE_URL?.trim();

function checkoutUrl(seats: number): string | null {
  if (!billingBase) return null;
  return `${billingBase.replace(/\/+$/, "")}?seats=${seats}`;
}

export default function PricingPage() {
  return (
    <div className="home-page">
      <header className="home-header">
        <Link to="/" className="home-logo" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="home-logo-brand">Promptplay</span>
          <span className="home-logo-sub">World Cup Edition</span>
        </Link>
        <nav className="home-nav">
          <Link to="/login" className="nav-link">
            Iniciar sesión
          </Link>
          <Link to="/signup" className="nav-link nav-link-accent">
            Registrarse
          </Link>
        </nav>
      </header>

      <main className="page-content" style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
        <h1>Planes para empresas</h1>
        <p className="page-subtitle">
          Cobramos por <strong>cantidad de participantes</strong> (cupos). Tu administrador invita por email y cada
          aceptación consume un cupo hasta el límite contratado.
        </p>

        <section className="pricing-section" style={{ marginTop: "2rem" }}>
          <h2>Ejemplo de escalas</h2>
          <ul className="pricing-list">
            <li>
              <strong>Hasta 25</strong> participantes — ideal para equipos chicos.
            </li>
            <li>
              <strong>Hasta 100</strong> — departamentos o filiales medianas.
            </li>
            <li>
              <strong>100+</strong> — contactanos para facturación y SLA.
            </li>
          </ul>
          <p className="admin-date-range-hint">
            El precio final se define en el checkout (Stripe u otro gateway). Configurá{" "}
            <code>VITE_BILLING_CHECKOUT_BASE_URL</code> en el frontend y{" "}
            <code>BILLING_CHECKOUT_BASE_URL</code> en el backend para enlazar el mismo portal de pago.
          </p>
        </section>

        <section style={{ marginTop: "2rem" }}>
          <h2>Contratar cupos</h2>
          {checkoutUrl(25) ? (
            <div className="pricing-cta-buttons">
              <a href={checkoutUrl(25)!} className="btn-primary btn-large" target="_blank" rel="noopener noreferrer">
                Checkout — 25 cupos
              </a>
              <a href={checkoutUrl(50)!} className="btn-secondary btn-large" target="_blank" rel="noopener noreferrer">
                50 cupos
              </a>
              <a
                href={checkoutUrl(100)!}
                className="btn-secondary btn-large"
                target="_blank"
                rel="noopener noreferrer"
              >
                100 cupos
              </a>
            </div>
          ) : (
            <p className="auth-error">
              Todavía no está configurada la URL de checkout. Definí <code>VITE_BILLING_CHECKOUT_BASE_URL</code> en
              el build del frontend (URL base del payment link o Stripe Checkout).
            </p>
          )}
        </section>

        <p style={{ marginTop: "2rem" }}>
          <Link to="/">← Volver al inicio</Link>
        </p>
      </main>
    </div>
  );
}
