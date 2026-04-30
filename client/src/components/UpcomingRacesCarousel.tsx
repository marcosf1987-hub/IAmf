import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { fetchPublicF1Races, type F1RaceSummary } from "../lib/api";

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function raceTitle(r: F1RaceSummary): string {
  const c = r.circuitShortName?.trim();
  const co = r.countryName?.trim();
  if (c && co) return `${c} · ${co}`;
  return c || co || `Gran Premio (R${r.roundOrder})`;
}

function RaceSlide({ race, slideVariant }: { race: F1RaceSummary; slideVariant: number }) {
  const start = new Date(race.raceStartAt);
  const v = slideVariant % 5;
  return (
    <article
      className="match-carousel-card f1-race-slide"
      data-f1-slide-var={v}
      aria-labelledby={`f1-race-title-${race.id}`}
    >
      <div className="f1-race-slide-accent" aria-hidden />
      <div className="match-carousel-card-inner f1-race-slide-inner">
        <p className="match-carousel-meta">
          F1 {race.year} · Ronda {race.roundOrder}
        </p>
        <h3 id={`f1-race-title-${race.id}`} className="match-carousel-teams f1-race-slide-title">
          {raceTitle(race)}
        </h3>
        <p className="match-carousel-datetime">
          {Number.isNaN(start.getTime()) ? "—" : dateFmt.format(start)}
        </p>
        <p className="match-carousel-venue f1-race-slide-foot">Carrera · datos OpenF1</p>
      </div>
    </article>
  );
}

type Variant = "marketing" | "dashboard";

const DESKTOP_PAIR_MQ = "(min-width: 900px)";

export default function UpcomingRacesCarousel({
  variant = "marketing",
  className = "",
  hideTitle = false,
}: {
  variant?: Variant;
  className?: string;
  /** Oculta el encabezado interno (cuando el padre ya muestra `dashboard-section-heading`). */
  hideTitle?: boolean;
}) {
  const [races, setRaces] = useState<F1RaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const isDesktopPair =
    (variant === "marketing" || variant === "dashboard") && useMediaQuery(DESKTOP_PAIR_MQ);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const year = new Date().getUTCFullYear();
        const limit = variant === "dashboard" ? 12 : 8;
        const { races: list } = await fetchPublicF1Races(year, limit);
        if (!cancelled) setRaces(list.slice(0, limit));
      } catch {
        if (!cancelled) setRaces([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const n = races.length;
  const maxSlidePair = n <= 1 ? 0 : n - 2;
  const canAdvancePair = maxSlidePair > 0;

  useEffect(() => {
    if (isDesktopPair) {
      setSlide((s) => Math.min(s, Math.max(0, n <= 1 ? 0 : n - 2)));
    } else {
      setSlide((s) => Math.min(s, Math.max(0, n - 1)));
    }
  }, [isDesktopPair, n]);

  const goNext = useCallback(() => {
    if (n <= 0) return;
    if (isDesktopPair) {
      if (maxSlidePair <= 0) return;
      setSlide((s) => (s >= maxSlidePair ? 0 : s + 1));
    } else {
      if (n <= 1) return;
      setSlide((s) => (s + 1) % n);
    }
  }, [isDesktopPair, n, maxSlidePair]);

  const goPrev = useCallback(() => {
    if (n <= 0) return;
    if (isDesktopPair) {
      if (maxSlidePair <= 0) return;
      setSlide((s) => (s <= 0 ? maxSlidePair : s - 1));
    } else {
      if (n <= 1) return;
      setSlide((s) => (s - 1 + n) % n);
    }
  }, [isDesktopPair, n, maxSlidePair]);

  useEffect(() => {
    if (n <= 1) return;
    if (isDesktopPair && maxSlidePair <= 0) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const t = window.setInterval(goNext, 8000);
    return () => window.clearInterval(t);
  }, [n, isDesktopPair, maxSlidePair, goNext]);

  if (loading) {
    return (
      <section
        className={`match-carousel match-carousel--loading match-carousel--${variant} ${className}`.trim()}
        aria-busy="true"
        aria-label="Cargando próximas carreras"
      >
        {!hideTitle ? (
          <div className="match-carousel-header">
            <h2 className="match-carousel-heading">Próximas carreras F1</h2>
          </div>
        ) : null}
        <div className="match-carousel-shell">
          <div className="match-carousel-skeleton" />
        </div>
      </section>
    );
  }

  if (n === 0) {
    return (
      <section className={`match-carousel match-carousel--${variant} match-carousel--empty ${className}`.trim()}>
        {!hideTitle ? (
          <div className="match-carousel-header">
            <h2 className="match-carousel-heading">Próximas carreras F1</h2>
          </div>
        ) : null}
        <p className="f1-carousel-empty-hint">
          No hay carreras próximas en el calendario sincronizado. El administrador puede ejecutar la sincronización
          OpenF1 si hace falta.
        </p>
      </section>
    );
  }

  const current = races[slide];
  const pairClass = isDesktopPair ? " match-carousel--desktop-pair" : "";

  return (
    <section
      className={`match-carousel match-carousel--${variant}${pairClass} ${className}`.trim()}
      aria-label="Próximas carreras F1"
      aria-roledescription="carrusel"
    >
      {!hideTitle ? (
        <div className="match-carousel-header">
          <h2 className="match-carousel-heading">Próximas carreras F1</h2>
        </div>
      ) : null}

      {isDesktopPair ? (
        <div className="match-carousel-desktop-row">
          <button
            type="button"
            className="match-carousel-arrow match-carousel-arrow--prev"
            onClick={goPrev}
            disabled={!canAdvancePair}
            aria-label="Ver carreras anteriores"
          >
            <ChevronIcon dir="left" />
          </button>
          <div
            className={`match-carousel-viewport match-carousel-viewport--pair ${n === 1 ? "match-carousel-viewport--pair-single" : ""}`}
            style={{ "--slide": slide } as React.CSSProperties}
          >
            <div className="match-carousel-track">
              {races.map((r, idx) => (
                <RaceSlide key={r.id} race={r} slideVariant={idx} />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="match-carousel-arrow match-carousel-arrow--next"
            onClick={goNext}
            disabled={!canAdvancePair}
            aria-label="Ver siguientes carreras"
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
      ) : (
        <>
          <div className="match-carousel-viewport">
            <RaceSlide race={current} slideVariant={slide} />
          </div>

          <div className="match-carousel-dots" role="tablist" aria-label="Elegir carrera">
            {races.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={i === slide}
                className={`match-carousel-dot ${i === slide ? "match-carousel-dot--active" : ""}`}
                onClick={() => setSlide(i)}
                aria-label={`Carrera ${i + 1}: ${raceTitle(r)}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
