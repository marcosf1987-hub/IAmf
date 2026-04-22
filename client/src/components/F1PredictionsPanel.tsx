import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchF1MyPredictions,
  fetchF1Races,
  formatApiError,
  putF1Prediction,
  type F1PredictionEntry,
  type F1RaceSummary,
} from "../lib/api";
import { scoreF1PlacementsClient } from "../lib/f1-client-scoring";
import { fetchOpenF1DriverNames } from "../lib/openf1-drivers";

const POS_LABELS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"];

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

function emptyPlacements(): (number | null)[] {
  return Array(10).fill(null);
}

type MergedRow = {
  race: F1RaceSummary;
  predictionId?: string;
  placements: (number | null)[];
};

function mergeRaces(
  races: F1RaceSummary[],
  predictions: F1PredictionEntry[]
): MergedRow[] {
  const predByRace = new Map(predictions.map((p) => [p.raceId, p]));
  return [...races].sort(
    (a, b) => new Date(a.raceStartAt).getTime() - new Date(b.raceStartAt).getTime()
  ).map((race) => {
    const pr = predByRace.get(race.id);
    return {
      race,
      predictionId: pr?.id,
      placements: pr ? [...pr.placements] : emptyPlacements(),
    };
  });
}

function DriverCell({
  num,
  names,
}: {
  num: number | null;
  names: Map<number, string>;
}) {
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
  const [openRaceId, setOpenRaceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<(number | null)[]>(emptyPlacements());
  const [snapshot, setSnapshot] = useState<(number | null)[]>(emptyPlacements());
  const [saving, setSaving] = useState(false);
  const [namesBySession, setNamesBySession] = useState<Map<number, Map<number, string>>>(new Map());

  const reload = useCallback(async () => {
    setError("");
    const [{ races }, { predictions }] = await Promise.all([fetchF1Races(), fetchF1MyPredictions()]);
    setRows(mergeRaces(races, predictions));
    const sessions = [...new Set(races.map((r) => r.sessionKey))];
    const entries = await Promise.all(
      sessions.map(async (sk) => [sk, await fetchOpenF1DriverNames(sk)] as const)
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

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(snapshot),
    [draft, snapshot]
  );

  function requestOpen(raceId: string) {
    if (openRaceId && openRaceId !== raceId && dirty) {
      if (!window.confirm("Hay cambios sin guardar en otra carrera. ¿Descartarlos y abrir esta?")) return;
    }
    const row = rows.find((r) => r.race.id === raceId);
    if (!row) return;
    const pl = [...row.placements];
    setSnapshot(pl);
    setDraft(pl);
    setOpenRaceId(raceId);
  }

  function cancelEdit() {
    setOpenRaceId(null);
    setDraft(emptyPlacements());
    setSnapshot(emptyPlacements());
  }

  async function saveEdit() {
    if (!openRaceId) return;
    setSaving(true);
    setError("");
    try {
      await putF1Prediction(openRaceId, draft);
      await reload();
      setOpenRaceId(null);
      setDraft(emptyPlacements());
      setSnapshot(emptyPlacements());
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
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
      <p className="f1-predictions-lead">
        Una predicción por carrera: completá el top 10 (número de piloto) en <strong>una carrera a la vez</strong>.
        Podés editar hasta 1 hora antes de la salida a pista. Los resultados llegan desde OpenF1.
      </p>
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
        <div className="f1-predictions-grid">
          {rows.map((row) => {
            const { race } = row;
            const locked = isRaceLocked(race.raceStartAt);
            const isOpen = openRaceId === race.id;
            const otherEditorOpen = openRaceId != null && openRaceId !== race.id;
            const official =
              race.officialTop10 != null && race.officialTop10.length === 10 ? race.officialTop10 : null;
            const names = namesBySession.get(race.sessionKey) ?? new Map();
            const pts =
              official && row.placements.some((p) => p != null)
                ? scoreF1PlacementsClient(row.placements, official)
                : null;

            return (
              <article key={race.id} className={`f1-race-card ${isOpen ? "f1-race-card--open" : ""}`}>
                <header className="f1-race-card-head">
                  <div>
                    <h3 className="f1-race-card-title">{raceLabel(race)}</h3>
                    <p className="f1-race-card-meta">
                      {new Date(race.raceStartAt).toLocaleString("es-AR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {locked ? <span className="f1-race-badge f1-race-badge--locked">Cierre predicción</span> : null}
                      {official ? (
                        <span className="f1-race-badge f1-race-badge--ok">Resultado oficial</span>
                      ) : null}
                      {pts != null ? (
                        <span className="f1-race-badge f1-race-badge--pts">{pts} pts</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="f1-race-card-actions">
                    {!isOpen && !locked ? (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={otherEditorOpen}
                        title={otherEditorOpen ? "Guardá o cancelá la edición de la otra carrera primero." : undefined}
                        onClick={() => requestOpen(race.id)}
                      >
                        {row.placements.every((p) => p == null) ? "Completar predicción" : "Editar"}
                      </button>
                    ) : null}
                    {isOpen ? (
                      <>
                        <button type="button" className="btn-primary btn-sm" disabled={saving} onClick={() => void saveEdit()}>
                          {saving ? "Guardando…" : "Guardar"}
                        </button>
                        <button type="button" className="btn-secondary btn-sm" disabled={saving} onClick={cancelEdit}>
                          Cancelar
                        </button>
                      </>
                    ) : null}
                  </div>
                </header>

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
                            {isOpen && !locked ? (
                              <input
                                type="number"
                                min={1}
                                max={99}
                                step={1}
                                className="f1-pos-input"
                                value={draft[i] ?? ""}
                                placeholder="—"
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  if (raw === "") {
                                    setDraft((d) => {
                                      const n = [...d];
                                      n[i] = null;
                                      return n;
                                    });
                                    return;
                                  }
                                  const num = parseInt(raw, 10);
                                  setDraft((d) => {
                                    const n = [...d];
                                    n[i] = Number.isFinite(num) && num >= 1 && num <= 99 ? num : null;
                                    return n;
                                  });
                                }}
                                aria-label={`${label} piloto número`}
                              />
                            ) : (
                              <DriverCell num={row.placements[i] ?? null} names={names} />
                            )}
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

                {isOpen && !locked ? (
                  <p className="f1-race-editor-hint">
                    Referencia rápida (sesión #{race.sessionKey}):{" "}
                    {names.size > 0
                      ? "nombres cargados desde OpenF1 para esta sesión."
                      : "si no ves nombres, OpenF1 puede estar bloqueado por CORS; usá el número de dorsal."}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
