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

const DESKTOP_GRID_MQ = "(min-width: 900px)";

export default function UpcomingMatchesCarousel({
  variant = "marketing",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const isDesktopGrid = variant === "marketing" && useMediaQuery(DESKTOP_GRID_MQ);

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
  const go = useCallback(
    (delta: number) => {
      if (n === 0) return;
      setIndex((i) => (i + delta + n) % n);
    },
    [n]
  );

  useEffect(() => {
    if (isDesktopGrid || n <= 1) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const t = window.setInterval(() => go(1), 8000);
    return () => window.clearInterval(t);
  }, [n, go, isDesktopGrid]);

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

  const current = matches[index];
  const gridClass = isDesktopGrid ? " match-carousel--grid-desktop" : "";

  return (
    <section
      className={`match-carousel match-carousel--${variant}${gridClass} ${className}`.trim()}
      aria-label="Próximos partidos"
      {...(!isDesktopGrid ? { "aria-roledescription": "carrusel" } : {})}
    >
      <div className="match-carousel-header">
        <h2 className="match-carousel-heading">Próximos partidos</h2>
      </div>

      {isDesktopGrid ? (
        <div className="match-carousel-viewport match-carousel-viewport--grid">
          {matches.map((m) => (
            <MatchSlide key={m.id} match={m} />
          ))}
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
                aria-selected={i === index}
                className={`match-carousel-dot ${i === index ? "match-carousel-dot--active" : ""}`}
                onClick={() => setIndex(i)}
                aria-label={`Partido ${i + 1}: ${m.teamA} contra ${m.teamB}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
