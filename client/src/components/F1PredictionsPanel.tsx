import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchF1MyPredictions,
  fetchF1Races,
  fetchPublicF1Drivers,
  formatApiError,
  postF1GenerateAiPrediction,
  type F1PredictionEntry,
  type F1RaceSummary,
} from "../lib/api";
import { scoreF1PlacementsClient } from "../lib/f1-client-scoring";

const POS_LABELS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"];

const PAST_SECTION_ID = "__f1_past_races__";

function raceLabel(r: F1RaceSummary): string {
  const c = r.circuitShortName?.trim();
  const co = r.countryName?.trim();
  if (c && co) return `R${r.roundOrder} · ${c} (${co})`;
  return c || co || `Ronda ${r.roundOrder}`;
}

function isRaceLocked(raceStartAt: string): boolean {
  const closeAt = new Date(raceStartAt).getTime() - 60 * 60 * 1000;
  return Date.now() >= closeAt;
}

/** Carrera cuya hora de salida ya pasó (solo UI: va a «Carreras pasadas»). */
function isRacePast(raceStartAt: string): boolean {
  return Date.now() >= new Date(raceStartAt).getTime();
}

function emptyPlacements(): (number | null)[] {
  return Array(10).fill(null);
}

type MergedRow = {
  race: F1RaceSummary;
  predictionId?: string;
  placements: (number | null)[];
};

function mergeRaces(races: F1RaceSummary[], predictions: F1PredictionEntry[]): MergedRow[] {
  const predByRace = new Map(predictions.map((p) => [p.raceId, p]));
  return [...races]
    .sort((a, b) => new Date(a.raceStartAt).getTime() - new Date(b.raceStartAt).getTime())
    .map((race) => {
      const pr = predByRace.get(race.id);
      return {
        race,
        predictionId: pr?.id,
        placements: pr ? [...pr.placements] : emptyPlacements(),
      };
    });
}

function indexOfVigenteForExpansion(rows: MergedRow[]): number {
  for (let i = 0; i < rows.length; i++) {
    if (!isRaceLocked(rows[i].race.raceStartAt)) return i;
  }
  for (let i = 0; i < rows.length; i++) {
    if (new Date(rows[i].race.raceStartAt).getTime() > Date.now()) return i;
  }
  return Math.max(0, rows.length - 1);
}

function defaultExpandedUpcomingId(rows: MergedRow[]): string | null {
  if (rows.length === 0) return null;
  return rows[indexOfVigenteForExpansion(rows)].race.id;
}

function filledCount(placements: (number | null)[]): number {
  return placements.filter((p) => p != null).length;
}

function DriverCell({ num, names }: { num: number | null; names: Map<number, string> }) {
  if (num == null) return <span className="f1-pred-cell-muted">—</span>;
  const name = names.get(num);
  return (
    <span className="f1-pred-driver">
      <span className="f1-pred-num">#{num}</span>
      {name ? <span className="f1-pred-name">{name}</span> : null}
    </span>
  );
}

export default function F1PredictionsPanel() {
  const [rows, setRows] = useState<MergedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedRaceId, setExpandedRaceId] = useState<string | null>(null);
  const [pastSectionExpanded, setPastSectionExpanded] = useState(false);
  const [expandedPastRaceId, setExpandedPastRaceId] = useState<string | null>(null);
  const [generatingRaceId, setGeneratingRaceId] = useState<string | null>(null);
  const [namesBySession, setNamesBySession] = useState<Map<number, Map<number, string>>>(new Map());

  const { upcomingRows, pastRows } = useMemo(() => {
    const upcoming: MergedRow[] = [];
    const past: MergedRow[] = [];
    for (const r of rows) {
      if (isRacePast(r.race.raceStartAt)) past.push(r);
      else upcoming.push(r);
    }
    return { upcomingRows: upcoming, pastRows: past };
  }, [rows]);

  const reload = useCallback(async () => {
    setError("");
    const [{ races }, { predictions }] = await Promise.all([fetchF1Races(), fetchF1MyPredictions()]);
    setRows(mergeRaces(races, predictions));
    const sessions = [...new Set(races.map((r) => r.sessionKey))];
    const entries = await Promise.all(
      sessions.map(async (sk) => [sk, await fetchPublicF1Drivers(sk)] as const)
    );
    setNamesBySession(new Map(entries));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (e) {
        if (!cancelled) setError(formatApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    setExpandedRaceId(defaultExpandedUpcomingId(upcomingRows));
  }, [upcomingRows]);

  function toggleUpcomingAccordion(raceId: string) {
    setExpandedRaceId((id) => (id === raceId ? null : raceId));
  }

  function togglePastSection() {
    setPastSectionExpanded((v) => {
      if (v) setExpandedPastRaceId(null);
      return !v;
    });
  }

  function togglePastRaceAccordion(raceId: string) {
    setExpandedPastRaceId((id) => (id === raceId ? null : raceId));
  }

  async function generateAi(raceId: string) {
    setGeneratingRaceId(raceId);
    setError("");
    try {
      await postF1GenerateAiPrediction(raceId);
      await reload();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setGeneratingRaceId(null);
    }
  }

  function renderRaceBody(row: MergedRow, opts: { showGenerateAi: boolean }) {
    const { race } = row;
    const locked = isRaceLocked(race.raceStartAt);
    const official = race.officialTop10 != null && race.officialTop10.length === 10 ? race.officialTop10 : null;
    const names = namesBySession.get(race.sessionKey) ?? new Map();
    const generating = generatingRaceId === race.id;

    return (
      <>
        <div className="f1-race-card-head f1-race-card-head--panel">
          <div className="f1-race-card-actions">
            {opts.showGenerateAi && !locked ? (
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={generating || generatingRaceId != null}
                title={
                  generatingRaceId != null && generatingRaceId !== race.id
                    ? "Esperá a que termine la otra generación."
                    : undefined
                }
                onClick={() => void generateAi(race.id)}
              >
                {generating ? "Generando…" : "Generar con IA"}
              </button>
            ) : null}
          </div>
          {locked ? (
            <p className="f1-race-panel-note">La ventana de predicción de esta carrera ya cerró.</p>
          ) : null}
        </div>

        <div className="f1-pos-table-wrap">
          <table className="f1-pos-table">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Tu predicción</th>
                {official ? <th>Oficial</th> : null}
              </tr>
            </thead>
            <tbody>
              {POS_LABELS.map((label, i) => (
                <tr key={label}>
                  <td className="f1-pos-label">{label}</td>
                  <td>
                    <DriverCell num={row.placements[i] ?? null} names={names} />
                  </td>
                  {official ? (
                    <td>
                      <DriverCell num={official[i] ?? null} names={names} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {opts.showGenerateAi && !locked ? (
          <p className="f1-race-panel-note" style={{ marginTop: "0.75rem" }}>
            La predicción se arma con la IA según las pautas guardadas en el Laboratorio F1 para esta carrera.
          </p>
        ) : null}
      </>
    );
  }

  if (loading) {
    return (
      <div className="f1-predictions f1-predictions--loading" aria-busy="true">
        <p className="placeholder-text">Cargando calendario F1…</p>
      </div>
    );
  }

  return (
    <div className="f1-predictions">
      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="placeholder-text">
          No hay carreras en la base. Sincronizá el calendario OpenF1 (arranque del servidor o endpoint de admin).
        </p>
      ) : (
        <div className="f1-predictions-accordions">
          {upcomingRows.map((row) => {
            const { race } = row;
            const expanded = expandedRaceId === race.id;
            const locked = isRaceLocked(race.raceStartAt);
            const official =
              race.officialTop10 != null && race.officialTop10.length === 10 ? race.officialTop10 : null;
            const nFilled = filledCount(row.placements);
            const pts =
              official && row.placements.some((p) => p != null)
                ? scoreF1PlacementsClient(row.placements, official)
                : null;

            return (
              <section key={race.id} className="f1-race-accordion prode-accordion prode-actions-full">
                <button
                  type="button"
                  className="prode-accordion-trigger f1-race-accordion-trigger"
                  aria-expanded={expanded}
                  aria-controls={`f1-race-panel-${race.id}`}
                  id={`f1-race-trigger-${race.id}`}
                  onClick={() => toggleUpcomingAccordion(race.id)}
                >
                  <span className="prode-accordion-title">{raceLabel(race)}</span>
                  <span className="prode-accordion-meta">
                    {new Date(race.raceStartAt).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {" · "}
                    {nFilled}/10
                    {locked ? " · Cerrada" : ""}
                    {official ? " · Resultado" : ""}
                    {pts != null ? ` · ${pts} pts` : ""}
                  </span>
                  <span className="prode-accordion-chevron" aria-hidden>
                    {expanded ? "▼" : "▶"}
                  </span>
                </button>
                {expanded ? (
                  <div
                    className="prode-accordion-panel f1-race-accordion-panel"
                    id={`f1-race-panel-${race.id}`}
                    role="region"
                    aria-labelledby={`f1-race-trigger-${race.id}`}
                  >
                    {renderRaceBody(row, { showGenerateAi: true })}
                  </div>
                ) : null}
              </section>
            );
          })}

          {pastRows.length > 0 ? (
            <section className="f1-race-accordion prode-accordion prode-actions-full f1-past-races-outer">
              <button
                type="button"
                className="prode-accordion-trigger f1-race-accordion-trigger"
                aria-expanded={pastSectionExpanded}
                aria-controls="f1-past-races-panel"
                id="f1-past-races-trigger"
                onClick={() => togglePastSection()}
              >
                <span className="prode-accordion-title">Carreras pasadas</span>
                <span className="prode-accordion-meta">
                  {pastRows.length} {pastRows.length === 1 ? "carrera" : "carreras"}
                </span>
                <span className="prode-accordion-chevron" aria-hidden>
                  {pastSectionExpanded ? "▼" : "▶"}
                </span>
              </button>
              {pastSectionExpanded ? (
                <div
                  className="prode-accordion-panel f1-race-accordion-panel f1-past-races-panel-inner"
                  id="f1-past-races-panel"
                  role="region"
                  aria-labelledby="f1-past-races-trigger"
                >
                  {pastRows.map((row) => {
                    const { race } = row;
                    const expanded = expandedPastRaceId === race.id;
                    const official =
                      race.officialTop10 != null && race.officialTop10.length === 10 ? race.officialTop10 : null;
                    const nFilled = filledCount(row.placements);
                    const pts =
                      official && row.placements.some((p) => p != null)
                        ? scoreF1PlacementsClient(row.placements, official)
                        : null;

                    return (
                      <section
                        key={race.id}
                        className="f1-race-accordion f1-race-accordion--nested prode-accordion prode-actions-full"
                      >
                        <button
                          type="button"
                          className="prode-accordion-trigger f1-race-accordion-trigger"
                          aria-expanded={expanded}
                          aria-controls={`f1-race-panel-${PAST_SECTION_ID}-${race.id}`}
                          id={`f1-race-trigger-${PAST_SECTION_ID}-${race.id}`}
                          onClick={() => togglePastRaceAccordion(race.id)}
                        >
                          <span className="prode-accordion-title">{raceLabel(race)}</span>
                          <span className="prode-accordion-meta">
                            {new Date(race.raceStartAt).toLocaleString("es-AR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                            {" · "}
                            {nFilled}/10
                            {official ? " · Resultado" : ""}
                            {pts != null ? ` · ${pts} pts` : ""}
                          </span>
                          <span className="prode-accordion-chevron" aria-hidden>
                            {expanded ? "▼" : "▶"}
                          </span>
                        </button>
                        {expanded ? (
                          <div
                            className="prode-accordion-panel f1-race-accordion-panel"
                            id={`f1-race-panel-${PAST_SECTION_ID}-${race.id}`}
                            role="region"
                            aria-labelledby={`f1-race-trigger-${PAST_SECTION_ID}-${race.id}`}
                          >
                            {renderRaceBody(row, { showGenerateAi: false })}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
