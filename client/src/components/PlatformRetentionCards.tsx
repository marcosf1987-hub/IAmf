import type { PlatformOverview } from "../lib/api";

type Props = {
  overview: PlatformOverview;
};

export default function PlatformRetentionCards({ overview }: Props) {
  const { retention } = overview;
  return (
    <section className="admin-section platform-retention">
      <h2>Retención (actividad reciente)</h2>
      <p className="page-subtitle" style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
        Usuarios activos con al menos una sesión, prompt o predicción en los últimos 7 o 30 días (ventana
        móvil, independiente del filtro de fechas).
      </p>
      <div className="platform-overview-cards">
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Pool · 7 días</div>
          <div className="platform-overview-card-value">{retention.publicPool.active7d}</div>
        </div>
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Pool · 30 días</div>
          <div className="platform-overview-card-value">{retention.publicPool.active30d}</div>
        </div>
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Plataforma · 7 días</div>
          <div className="platform-overview-card-value">{retention.platformWide.active7d}</div>
        </div>
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Plataforma · 30 días</div>
          <div className="platform-overview-card-value">{retention.platformWide.active30d}</div>
        </div>
      </div>
    </section>
  );
}
