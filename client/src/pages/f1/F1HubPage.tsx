import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import UpcomingRacesCarousel from "../../components/UpcomingRacesCarousel";
import { fetchPublicF1Races, type F1RaceSummary } from "../../lib/api";

function f1RaceHeadline(r: F1RaceSummary): string {
  const c = r.circuitShortName?.trim();
  const co = r.countryName?.trim();
  if (c && co) return `${c} · ${co}`;
  return c || co || `Ronda ${r.roundOrder}`;
}

function formatF1Countdown(iso: string): string {
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return "—";
  const t = end - Date.now();
  if (t <= 0) return "En curso o finalizada";
  const s = Math.floor(t / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

export default function F1HubPage() {
  const [next, setNext] = useState<F1RaceSummary | null>(null);
  const [label, setLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const year = new Date().getUTCFullYear();
        const { races } = await fetchPublicF1Races(year, 12);
        if (!cancelled) setNext(races[0] ?? null);
      } catch {
        if (!cancelled) setNext(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!next) {
      setLabel("");
      return;
    }
    const tick = () => setLabel(formatF1Countdown(next.raceStartAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [next]);

  return (
    <div className="f1-hub">
      <section className="f1-hub-links" aria-labelledby="f1-hub-links-title">
        <h2 id="f1-hub-links-title" className="f1-hub-heading">
          Accesos
        </h2>
        <div className="f1-hub-cards">
          <Link to="/app/f1/predicciones" className="dashboard-card f1-hub-card">
            <h3>Predicciones</h3>
            <p>Top 10 por carrera</p>
          </Link>
          <Link to="/app/f1/laboratorio" className="dashboard-card f1-hub-card">
            <h3>Laboratorio</h3>
            <p>Pautas por carrera (session)</p>
          </Link>
          <Link to="/app/f1/resultados" className="dashboard-card f1-hub-card">
            <h3>Resultados</h3>
            <p>Puntos F1 y desglose</p>
          </Link>
        </div>
      </section>

      <section className="dashboard-f1-countdown f1-hub-countdown" aria-labelledby="f1-hub-count-title">
        <h2 id="f1-hub-count-title" className="dashboard-section-heading">
          Próxima carrera
        </h2>
        {next ? (
          <div className="dashboard-f1-countdown-inner">
            <p className="dashboard-f1-countdown-race">{f1RaceHeadline(next)}</p>
            <p className="dashboard-f1-countdown-digits" aria-live="polite">
              {label || formatF1Countdown(next.raceStartAt)}
            </p>
            <p className="dashboard-f1-countdown-sub">
              {new Date(next.raceStartAt).toLocaleString("es-AR", {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
          </div>
        ) : (
          <p className="dashboard-f1-countdown-empty">
            Sin carreras próximas en el calendario sincronizado (OpenF1).
          </p>
        )}
      </section>

      <UpcomingRacesCarousel variant="dashboard" className="dashboard-upcoming-carousel f1-hub-carousel" />
    </div>
  );
}
