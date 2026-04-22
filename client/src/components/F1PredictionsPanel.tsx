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

/** Primera carrera con ventana de predicción abierta; si no hay, la próxima por fecha; si todo pasó, la última. */
function indexOfVigenteForExpansion(rows: MergedRow[]): number {
  for (let i = 0; i < rows.length; i++) {
    if (!isRaceLocked(rows[i].race.raceStartAt)) return i;
  }
  for (let i = 0; i < rows.length; i++) {
    if (new Date(rows[i].race.raceStartAt).getTime() > Date.now()) return i;
  }
  return Math.max(0, rows.length - 1);
}

function defaultExpandedRaceId(rows: MergedRow[]): string | null {
  if (rows.length === 0) return null;
  return rows[indexOfVigenteForExpansion(rows)].race.id;
}

function filledCount(placements: (number | null)[]): number {
  return placements.filter((p) => p != null).length;
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
  const [expandedRaceId, setExpandedRaceId] = useState<string | null>(null);
  const [editingRaceId, setEditingRaceId] = useState<string | null>(null);
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

  useEffect(() => {
    setExpandedRaceId(defaultExpandedRaceId(rows));
  }, [rows]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(snapshot),
    [draft, snapshot]
  );

  function cancelEdit() {
    setEditingRaceId(null);
    setDraft(emptyPlacements());
    setSnapshot(emptyPlacements());
  }

  function toggleAccordion(raceId: string) {
    if (expandedRaceId === raceId) {
      if (editingRaceId === raceId && dirty) {
        if (!window.confirm("Hay cambios sin guardar. ¿Cerrar la carrera y descartarlos?")) return;
      }
      if (editingRaceId === raceId) cancelEdit();
      setExpandedRaceId(null);
      return;
    }
    if (editingRaceId && editingRaceId !== raceId && dirty) {
      if (!window.confirm("Hay cambios sin guardar en otra carrera. ¿Descartarlos y abrir esta?")) return;
      cancelEdit();
    } else if (editingRaceId && editingRaceId !== raceId) {
      cancelEdit();
    }
    setExpandedRaceId(raceId);
  }

  function requestEdit(raceId: string) {
    if (expandedRaceId !== raceId) setExpandedRaceId(raceId);
    if (editingRaceId && editingRaceId !== raceId && dirty) {
      if (!window.confirm("Hay cambios sin guardar en otra carrera. ¿Descartarlos y editar esta?")) return;
    }
    const row = rows.find((r) => r.race.id === raceId);
    if (!row) return;
    const pl = [...row.placements];
    setSnapshot(pl);
    setDraft(pl);
    setEditingRaceId(raceId);
  }

  async function saveEdit() {
    if (!editingRaceId) return;
    setSaving(true);
    setError("");
    try {
      await putF1Prediction(editingRaceId, draft);
      await reload();
      cancelEdit();
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
        Se muestra expandida la <strong>próxima carrera con predicción vigente</strong> (la más cercana donde aún podés
        cargar o editar). El resto queda colapsado: abrí cada una para ver o modificar. Una edición a la vez; podés
        enviar hasta 1 hora antes de la salida a pista.
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
        <div className="f1-predictions-accordions">
          {rows.map((row) => {
            const { race } = row;
            const locked = isRaceLocked(race.raceStartAt);
            const expanded = expandedRaceId === race.id;
            const isEditing = editingRaceId === race.id;
            const otherEditing = editingRaceId != null && editingRaceId !== race.id;
            const official =
              race.officialTop10 != null && race.officialTop10.length === 10 ? race.officialTop10 : null;
            const names = namesBySession.get(race.sessionKey) ?? new Map();
            const pts =
              official && row.placements.some((p) => p != null)
                ? scoreF1PlacementsClient(row.placements, official)
                : null;
            const nFilled = filledCount(row.placements);

            return (
              <section key={race.id} className="f1-race-accordion prode-accordion prode-actions-full">
                <button
                  type="button"
                  className="prode-accordion-trigger f1-race-accordion-trigger"
                  aria-expanded={expanded}
                  aria-controls={`f1-race-panel-${race.id}`}
                  id={`f1-race-trigger-${race.id}`}
                  onClick={() => toggleAccordion(race.id)}
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
                    <div className="f1-race-card-head f1-race-card-head--panel">
                      <div className="f1-race-card-actions">
                        {!isEditing && !locked ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={otherEditing}
                            title={
                              otherEditing ? "Guardá o cancelá la edición de la otra carrera primero." : undefined
                            }
                            onClick={() => requestEdit(race.id)}
                          >
                            {row.placements.every((p) => p == null) ? "Completar predicción" : "Editar"}
                          </button>
                        ) : null}
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              disabled={saving}
                              onClick={() => void saveEdit()}
                            >
                              {saving ? "Guardando…" : "Guardar"}
                            </button>
                            <button type="button" className="btn-secondary btn-sm" disabled={saving} onClick={cancelEdit}>
                              Cancelar
                            </button>
                          </>
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
                                {isEditing && !locked ? (
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

                    {isEditing && !locked ? (
                      <p className="f1-race-editor-hint">
                        Referencia (sesión #{race.sessionKey}):{" "}
                        {names.size > 0
                          ? "nombres desde OpenF1."
                          : "si no ves nombres, puede ser CORS; usá el dorsal."}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
