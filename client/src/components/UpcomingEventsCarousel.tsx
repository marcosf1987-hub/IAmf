import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  fetchPublicF1Races,
  fetchPublicUpcomingMatches,
  type F1RaceSummary,
  type Match,
} from "../lib/api";
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

const DESKTOP_PAIR_MQ = "(min-width: 900px)";

type UpcomingEvent =
  | { kind: "match"; key: string; at: number; match: Match }
  | { kind: "race"; key: string; at: number; race: F1RaceSummary };

function buildUpcomingEvents(matches: Match[], race: F1RaceSummary | null): UpcomingEvent[] {
  const events: UpcomingEvent[] = matches.slice(0, 4).map((m) => ({
    kind: "match" as const,
    key: `match-${m.id}`,
    at: new Date(m.kickoffAt).getTime(),
    match: m,
  }));
  if (race) {
    events.push({
      kind: "race",
      key: `race-${race.id}`,
      at: new Date(race.raceStartAt).getTime(),
      race,
    });
  }
  return events.sort((a, b) => a.at - b.at);
}

function raceTitle(r: F1RaceSummary): string {
  const c = r.circuitShortName?.trim();
  const co = r.countryName?.trim();
  if (c && co) return `${c} · ${co}`;
  return c || co || `Gran Premio (R${r.roundOrder})`;
}

function eventAriaLabel(ev: UpcomingEvent, index: number): string {
  if (ev.kind === "match") {
    return `Evento ${index + 1}: ${ev.match.teamA} contra ${ev.match.teamB}`;
  }
  return `Evento ${index + 1}: ${raceTitle(ev.race)}`;
}

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

function EventSlide({ event, slideVariant }: { event: UpcomingEvent; slideVariant: number }) {
  if (event.kind === "match") {
    return <MatchSlide match={event.match} />;
  }
  return <RaceSlide race={event.race} slideVariant={slideVariant} />;
}

export default function UpcomingEventsCarousel({ className = "" }: { className?: string }) {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const isDesktopPair = useMediaQuery(DESKTOP_PAIR_MQ);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const year = new Date().getUTCFullYear();
        const [matchesRes, racesRes] = await Promise.all([
          fetchPublicUpcomingMatches(4),
          fetchPublicF1Races(year, 1),
        ]);
        if (!cancelled) {
          const nextRace = racesRes.races[0] ?? null;
          setEvents(buildUpcomingEvents(matchesRes.matches, nextRace));
        }
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const n = events.length;
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
        className={`match-carousel match-carousel--loading match-carousel--marketing ${className}`.trim()}
        aria-busy="true"
        aria-label="Cargando próximos eventos"
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

  const current = events[slide];
  const pairClass = isDesktopPair ? " match-carousel--desktop-pair" : "";

  return (
    <section
      className={`match-carousel match-carousel--marketing${pairClass} ${className}`.trim()}
      aria-label="Próximos eventos que puedes predecir"
      aria-roledescription="carrusel"
    >
      <div className="match-carousel-header">
        <h2 className="match-carousel-heading">Próximos eventos que puedes predecir</h2>
      </div>

      {isDesktopPair ? (
        <div className="match-carousel-desktop-row">
          <button
            type="button"
            className="match-carousel-arrow match-carousel-arrow--prev"
            onClick={goPrev}
            disabled={!canAdvancePair}
            aria-label="Ver eventos anteriores"
          >
            <ChevronIcon dir="left" />
          </button>
          <div
            className={`match-carousel-viewport match-carousel-viewport--pair ${n === 1 ? "match-carousel-viewport--pair-single" : ""}`}
            style={{ "--slide": slide } as React.CSSProperties}
          >
            <div className="match-carousel-track">
              {events.map((ev, idx) => (
                <EventSlide key={ev.key} event={ev} slideVariant={idx} />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="match-carousel-arrow match-carousel-arrow--next"
            onClick={goNext}
            disabled={!canAdvancePair}
            aria-label="Ver siguientes eventos"
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
      ) : (
        <>
          <div className="match-carousel-viewport">
            <EventSlide event={current} slideVariant={slide} />
          </div>

          <div className="match-carousel-dots" role="tablist" aria-label="Elegir evento">
            {events.map((ev, i) => (
              <button
                key={ev.key}
                type="button"
                role="tab"
                aria-selected={i === slide}
                className={`match-carousel-dot ${i === slide ? "match-carousel-dot--active" : ""}`}
                onClick={() => setSlide(i)}
                aria-label={eventAriaLabel(ev, i)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
