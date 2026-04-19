import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { fetchPublicUpcomingMatches, type Match } from "../lib/api";
import { getFlagImageUrl } from "../lib/flags";
import {
  FALLBACK_STADIUM_BG,
  pickVenueForMatch,
  stadiumBackgroundUrlForMatch,
} from "../lib/match-venue";

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

function MatchSlide({ match }: { match: Match }) {
  const bg = stadiumBackgroundUrlForMatch(match.id);
  const [bgSrc, setBgSrc] = useState(bg);
  const venue = pickVenueForMatch(match.id);
  const kick = new Date(match.kickoffAt);
  const urlA = getFlagImageUrl(match.teamA);
  const urlB = getFlagImageUrl(match.teamB);

  useEffect(() => {
    setBgSrc(bg);
  }, [bg]);

  return (
    <article className="match-carousel-card" aria-labelledby={`match-title-${match.id}`}>
      <div className="match-carousel-card-bg" aria-hidden="true">
        <img
          src={bgSrc}
          alt=""
          className="match-carousel-card-bg-img"
          loading="lazy"
          decoding="async"
          onError={() => setBgSrc(FALLBACK_STADIUM_BG)}
        />
        <div className="match-carousel-card-bg-blur" />
        <div className="match-carousel-card-bg-scrim" />
      </div>
      <div className="match-carousel-card-inner">
        <p className="match-carousel-meta">
          {match.stage}
          {match.groupCode ? ` · Grupo ${match.groupCode}` : ""}
        </p>
        <h3 id={`match-title-${match.id}`} className="match-carousel-teams">
          <span className="match-carousel-team">
            {urlA ? (
              <img src={urlA} alt="" className="match-carousel-flag" width={36} height={27} />
            ) : null}
            <span>{match.teamA}</span>
          </span>
          <span className="match-carousel-vs">vs</span>
          <span className="match-carousel-team">
            {urlB ? (
              <img src={urlB} alt="" className="match-carousel-flag" width={36} height={27} />
            ) : null}
            <span>{match.teamB}</span>
          </span>
        </h3>
        <p className="match-carousel-datetime">{Number.isNaN(kick.getTime()) ? "—" : dateFmt.format(kick)}</p>
        <p className="match-carousel-venue">
          {venue.stadium} · {venue.city}
        </p>
      </div>
    </article>
  );
}

type Variant = "marketing" | "dashboard";

const DESKTOP_PAIR_MQ = "(min-width: 900px)";

export default function UpcomingMatchesCarousel({
  variant = "marketing",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const isDesktopPair = variant === "marketing" && useMediaQuery(DESKTOP_PAIR_MQ);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { matches: list } = await fetchPublicUpcomingMatches(5);
        if (!cancelled) setMatches(list.slice(0, 5));
      } catch {
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const n = matches.length;
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
        aria-label="Cargando próximos partidos"
      >
        <div className="match-carousel-shell">
          <div className="match-carousel-skeleton" />
        </div>
      </section>
    );
  }

  if (n === 0) {
    return null;
  }

  const current = matches[slide];
  const pairClass = isDesktopPair ? " match-carousel--desktop-pair" : "";

  return (
    <section
      className={`match-carousel match-carousel--${variant}${pairClass} ${className}`.trim()}
      aria-label="Próximos partidos"
      aria-roledescription="carrusel"
    >
      <div className="match-carousel-header">
        <h2 className="match-carousel-heading">Próximos partidos</h2>
      </div>

      {isDesktopPair ? (
        <div className="match-carousel-desktop-row">
          <button
            type="button"
            className="match-carousel-arrow match-carousel-arrow--prev"
            onClick={goPrev}
            disabled={!canAdvancePair}
            aria-label="Ver partidos anteriores"
          >
            <ChevronIcon dir="left" />
          </button>
          <div
            className={`match-carousel-viewport match-carousel-viewport--pair ${n === 1 ? "match-carousel-viewport--pair-single" : ""}`}
            style={{ "--slide": slide } as React.CSSProperties}
          >
            <div className="match-carousel-track">
              {matches.map((m) => (
                <MatchSlide key={m.id} match={m} />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="match-carousel-arrow match-carousel-arrow--next"
            onClick={goNext}
            disabled={!canAdvancePair}
            aria-label="Ver siguientes partidos"
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
      ) : (
        <>
          <div className="match-carousel-viewport">
            <MatchSlide match={current} />
          </div>

          <div className="match-carousel-dots" role="tablist" aria-label="Elegir partido">
            {matches.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={i === slide}
                className={`match-carousel-dot ${i === slide ? "match-carousel-dot--active" : ""}`}
                onClick={() => setSlide(i)}
                aria-label={`Partido ${i + 1}: ${m.teamA} contra ${m.teamB}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
