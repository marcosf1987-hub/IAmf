import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ProdeGuidelinesByPhase } from "../lib/api";

type GuidelinePhaseKey = keyof ProdeGuidelinesByPhase;

const PHASE_EDITOR: {
  key: GuidelinePhaseKey;
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    key: "groups",
    label: "Fase de grupos",
    hint: "Se usa cuando en el Prode puedes generar predicciones de la ventana de grupos.",
    placeholder: "Ej. criterios para partidos de grupo, equipos fuertes en zona, etc.",
  },
  {
    key: "roundOf32",
    label: "16avos",
    hint: "Se usa para la generación de la ronda de 16avos (etapa distinta a grupos).",
    placeholder: "Ej. criterios para cruces eliminatorios tempranos…",
  },
  {
    key: "knockout",
    label: "Eliminatorias",
    hint: "Octavos en adelante, campeón y subcampeón (fase knockout en el Prode).",
    placeholder: "Ej. favoritos a copa, estilo de juego en eliminatorias…",
  },
];
import {
  fetchF1Guidelines,
  fetchF1Races,
  fetchPredictionHistory,
  fetchProdeGuidelines,
  putF1RaceGuideline,
  updateProdeGuidelines,
  type BatchPromptLine,
  type F1RaceSummary,
  type PredictionHistoryEntry,
} from "../lib/api";

const PAUTAS_MARKER_LEGACY = "TENÉ EN CUENTA ESTAS PAUTAS DEL USUARIO: ";
const PAUTAS_BLOCK_START = "--- PAUTAS DEL USUARIO (toda esta etapa) ---\n";

/** Extrae el texto guardado en el Laboratorio desde el prompt completo (formato actual o histórico del servidor). */
function extractGuidelinesFromPrompt(promptText: string): string | null {
  const newIdx = promptText.indexOf(PAUTAS_BLOCK_START);
  if (newIdx !== -1) {
    const after = promptText.slice(newIdx + PAUTAS_BLOCK_START.length);
    const end = after.indexOf("\n---\n");
    const raw = end >= 0 ? after.slice(0, end) : after;
    const t = raw.trim();
    return t.length > 0 ? t : null;
  }
  const idx = promptText.indexOf(PAUTAS_MARKER_LEGACY);
  if (idx === -1) return null;
  const after = promptText.slice(idx + PAUTAS_MARKER_LEGACY.length);
  const end = after.indexOf("\n\nResponde");
  const raw = end >= 0 ? after.slice(0, end) : after;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function IaBatchPromptBlock({ lines }: { lines?: BatchPromptLine[] }) {
  if (!lines?.length) {
    return (
      <div className="ia-batch-prompt-block ia-batch-prompt-block--empty">
        <p className="ia-batch-prompt-note">
          No hay texto de prompt guardado para este lote (generaciones anteriores a esta función, o migración{" "}
          <code>batchId</code> en PromptLog sin aplicar).
        </p>
      </div>
    );
  }

  const sample = lines[0];
  const guidelines = extractGuidelinesFromPrompt(sample.promptText);
  const isChampionOnlySample = sample.promptText.includes("campeón y subcampeón");

  return (
    <div className="ia-batch-prompt-block">
      <h4 className="ia-batch-prompt-subtitle">Prompt enviado a la IA</h4>
      {guidelines != null ? (
        <>
          <p className="ia-batch-prompt-label">Pautas del Laboratorio (en esa ejecución)</p>
          <pre className="ia-batch-prompt-pre">{guidelines}</pre>
        </>
      ) : (
        <p className="ia-batch-prompt-muted">
          Este lote no incluyó pautas del Laboratorio (el texto guardado estaba vacío al generar).
        </p>
      )}
      <p className="ia-batch-prompt-label">
        {isChampionOnlySample
          ? "Texto completo — campeón/subcampeón"
          : "Texto completo — primer partido del lote (cada partido repite la misma lógica y pautas)"}
      </p>
      <pre className="ia-batch-prompt-pre ia-batch-prompt-pre--full">{sample.promptText}</pre>
      {lines.length > 1 && (
        <details className="ia-batch-prompt-details">
          <summary>Ver los {lines.length} prompts de este lote</summary>
          <ol className="ia-batch-prompt-all">
            {lines.map((l, i) => (
              <li key={`${l.createdAt}-${i}`}>
                <pre className="ia-batch-prompt-pre">{l.promptText}</pre>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  groups: "Fase de grupos",
  roundOf32: "16avos",
  knockout: "Eliminatorias",
};

type HistoryTimelineItem =
  | {
      key: string;
      kind: "batch";
      batchId: string;
      createdAt: string;
      phaseLabel: string | null;
      items: PredictionHistoryEntry[];
    }
  | {
      key: string;
      kind: "single";
      entry: PredictionHistoryEntry;
    };

function buildTimeline(entries: PredictionHistoryEntry[]): HistoryTimelineItem[] {
  const byBatch = new Map<string, PredictionHistoryEntry[]>();
  const singles: PredictionHistoryEntry[] = [];

  for (const e of entries) {
    if (e.batchId) {
      if (!byBatch.has(e.batchId)) byBatch.set(e.batchId, []);
      byBatch.get(e.batchId)!.push(e);
    } else {
      singles.push(e);
    }
  }

  const batchItems: HistoryTimelineItem[] = [...byBatch.entries()].map(([batchId, items]) => {
    const sorted = [...items].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const createdAt = sorted[sorted.length - 1]?.createdAt ?? items[0].createdAt;
    const phaseLabel = sorted.find((x) => x.phaseLabel)?.phaseLabel ?? null;
    return {
      key: `batch-${batchId}`,
      kind: "batch" as const,
      batchId,
      createdAt,
      phaseLabel,
      items: sorted,
    };
  });

  const singleItems: HistoryTimelineItem[] = singles.map((entry) => ({
    key: `single-${entry.id}`,
    kind: "single" as const,
    entry,
  }));

  const merged = [...batchItems, ...singleItems];
  merged.sort((a, b) => {
    const ta = a.kind === "batch" ? a.createdAt : a.entry.createdAt;
    const tb = b.kind === "batch" ? b.createdAt : b.entry.createdAt;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });
  return merged;
}

const EMPTY_GUIDELINES: ProdeGuidelinesByPhase = { groups: "", roundOf32: "", knockout: "" };

function f1LabRaceLabel(r: F1RaceSummary): string {
  const c = r.circuitShortName?.trim();
  const co = r.countryName?.trim();
  if (c && co) return `R${r.roundOrder} · ${c} (${co})`;
  return c || co || `Ronda ${r.roundOrder}`;
}

function normalizeGuidelinesResponse(res: { guidelines: unknown }): ProdeGuidelinesByPhase {
  const raw = res.guidelines;
  if (typeof raw === "string") {
    return { groups: raw, roundOf32: "", knockout: "" };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, string>;
    return {
      groups: o.groups ?? "",
      roundOf32: o.roundOf32 ?? "",
      knockout: o.knockout ?? "",
    };
  }
  return EMPTY_GUIDELINES;
}

export default function IAPage() {
  const location = useLocation();
  const [labMode, setLabMode] = useState<"mundial" | "f1">("mundial");
  const [guidelines, setGuidelines] = useState<ProdeGuidelinesByPhase>(EMPTY_GUIDELINES);
  const [editorPhase, setEditorPhase] = useState<GuidelinePhaseKey>("groups");
  const [guidelinesSaving, setGuidelinesSaving] = useState(false);
  const [guidelinesSaved, setGuidelinesSaved] = useState(false);
  const [f1Races, setF1Races] = useState<F1RaceSummary[]>([]);
  const [f1SessionKey, setF1SessionKey] = useState<number | null>(null);
  const [f1GuidelinesMap, setF1GuidelinesMap] = useState<Record<string, string>>({});
  const [f1Text, setF1Text] = useState("");
  const [f1Loading, setF1Loading] = useState(false);
  const [f1Saving, setF1Saving] = useState(false);
  const [f1Saved, setF1Saved] = useState(false);
  const [error, setError] = useState("");
  const [historyEntries, setHistoryEntries] = useState<PredictionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [batchPrompts, setBatchPrompts] = useState<Record<string, BatchPromptLine[]>>({});
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});

  const timeline = useMemo(() => buildTimeline(historyEntries), [historyEntries]);

  const loadF1Lab = useCallback(async () => {
    setF1Loading(true);
    setError("");
    try {
      const [{ races }, gRes] = await Promise.all([fetchF1Races(), fetchF1Guidelines()]);
      const sorted = [...races].sort(
        (a, b) => new Date(a.raceStartAt).getTime() - new Date(b.raceStartAt).getTime()
      );
      setF1Races(sorted);
      const map = gRes.bySessionKey ?? {};
      setF1GuidelinesMap(map);
      setF1SessionKey((prev) => {
        if (prev != null && sorted.some((r) => r.sessionKey === prev)) return prev;
        return sorted[0]?.sessionKey ?? null;
      });
      setF1Saved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar F1");
      setF1Races([]);
      setF1SessionKey(null);
      setF1Text("");
    } finally {
      setF1Loading(false);
    }
  }, []);

  useEffect(() => {
    if (labMode !== "f1" || f1SessionKey == null) return;
    setF1Text(f1GuidelinesMap[String(f1SessionKey)] ?? "");
  }, [labMode, f1SessionKey, f1GuidelinesMap]);

  useEffect(() => {
    if (labMode === "f1") void loadF1Lab();
  }, [labMode, loadF1Lab]);

  const reloadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetchPredictionHistory(500);
      setHistoryEntries(res.entries ?? []);
      setBatchPrompts(res.batchPrompts ?? {});
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "No se pudo cargar el historial");
      setHistoryEntries([]);
      setBatchPrompts({});
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const guidelinesRes = await fetchProdeGuidelines();
        setGuidelines(normalizeGuidelinesResponse(guidelinesRes));
        setGuidelinesSaved(true);
      } catch {
        setGuidelines(EMPTY_GUIDELINES);
        setGuidelinesSaved(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    void reloadHistory();
  }, [location.pathname, reloadHistory]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && location.pathname.endsWith("/ia")) {
        void reloadHistory();
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [location.pathname, reloadHistory]);

  async function handleSaveGuidelines(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (labMode === "f1") {
      if (f1SessionKey == null) {
        setError("No hay carrera seleccionable.");
        return;
      }
      setF1Saving(true);
      setF1Saved(false);
      try {
        const res = await putF1RaceGuideline(f1SessionKey, f1Text);
        setF1GuidelinesMap(res.bySessionKey);
        setF1Saved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar pautas F1");
      } finally {
        setF1Saving(false);
      }
      return;
    }
    setGuidelinesSaving(true);
    setGuidelinesSaved(false);
    try {
      await updateProdeGuidelines(guidelines);
      setGuidelinesSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar pautas");
    } finally {
      setGuidelinesSaving(false);
    }
  }

  function toggleBatch(batchId: string) {
    setExpandedBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  }

  const phaseMeta = PHASE_EDITOR.find((p) => p.key === editorPhase) ?? PHASE_EDITOR[0];
  const f1RaceMeta = f1Races.find((r) => r.sessionKey === f1SessionKey);

  return (
    <div className="page-content">
      <h1>Laboratorio de Lógica Predictiva</h1>

      {error && <div className="auth-error">{error}</div>}

      <div className="ia-layout">
        <section className="ia-main">
          <div className="ia-console">
            <h2 className="ia-console-title">Consola de Edición</h2>
            <p className="ia-console-subtitle">Configura tu modelo maestro</p>
            <form onSubmit={handleSaveGuidelines} className="guidelines-form">
              <div className="ia-lab-mode-tabs" role="tablist" aria-label="Laboratorio por disciplina">
                <button
                  type="button"
                  role="tab"
                  aria-selected={labMode === "mundial"}
                  className={`ia-lab-mode-tab ${labMode === "mundial" ? "ia-lab-mode-tab--active" : ""}`}
                  onClick={() => setLabMode("mundial")}
                >
                  Mundial
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={labMode === "f1"}
                  className={`ia-lab-mode-tab ${labMode === "f1" ? "ia-lab-mode-tab--active" : ""}`}
                  onClick={() => setLabMode("f1")}
                >
                  F1
                </button>
              </div>

              {labMode === "mundial" ? (
                <div className="guidelines-phase-block">
                  <label htmlFor="guidelines-phase" className="guidelines-phase-label">
                    Etapa
                  </label>
                  <select
                    id="guidelines-phase"
                    className="guidelines-phase-select"
                    value={editorPhase}
                    onChange={(e) => setEditorPhase(e.target.value as GuidelinePhaseKey)}
                  >
                    {PHASE_EDITOR.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <p className="guidelines-phase-hint">{phaseMeta.hint}</p>
                  <textarea
                    value={guidelines[editorPhase]}
                    onChange={(e) => {
                      setGuidelinesSaved(false);
                      setGuidelines((prev) => ({ ...prev, [editorPhase]: e.target.value }));
                    }}
                    placeholder={phaseMeta.placeholder}
                    rows={10}
                    className="chat-input"
                    maxLength={2000}
                    aria-label={`Pautas: ${phaseMeta.label}`}
                  />
                  <span className="guidelines-count">{guidelines[editorPhase].length}/2000</span>
                </div>
              ) : (
                <div className="guidelines-phase-block">
                  <label htmlFor="f1-race-session" className="guidelines-phase-label">
                    Carrera
                  </label>
                  {f1Loading ? (
                    <p className="placeholder-text">Cargando calendario F1…</p>
                  ) : f1Races.length === 0 ? (
                    <p className="placeholder-text">
                      No hay carreras en la base. Sincronizá OpenF1 desde el servidor o esperá al arranque con sync
                      habilitado.
                    </p>
                  ) : (
                    <>
                      <select
                        id="f1-race-session"
                        className="guidelines-phase-select"
                        value={f1SessionKey ?? ""}
                        onChange={(e) => {
                          setF1Saved(false);
                          setF1SessionKey(parseInt(e.target.value, 10));
                        }}
                      >
                        {f1Races.map((r) => (
                          <option key={r.id} value={r.sessionKey}>
                            {f1LabRaceLabel(r)} —{" "}
                            {new Date(r.raceStartAt).toLocaleDateString("es-AR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </option>
                        ))}
                      </select>
                      <p className="guidelines-phase-hint">
                        Pautas por carrera (session_key {f1SessionKey ?? "—"}). Cuando exista generación con IA por
                        carrera, el servidor usará este texto para esa sesión.
                      </p>
                      <textarea
                        value={f1Text}
                        onChange={(e) => {
                          setF1Saved(false);
                          setF1Text(e.target.value);
                        }}
                        placeholder="Ej. ponderá parrilla, clima en el circuito, degradación de blandos, estrategia de safety car…"
                        rows={10}
                        className="chat-input"
                        maxLength={20000}
                        aria-label={`Pautas F1: ${f1RaceMeta ? f1LabRaceLabel(f1RaceMeta) : "carrera"}`}
                      />
                      <span className="guidelines-count">{f1Text.length}/20000</span>
                    </>
                  )}
                </div>
              )}
              <div className="guidelines-actions">
                <button
                  type="submit"
                  disabled={
                    labMode === "mundial"
                      ? guidelinesSaving || guidelinesSaved
                      : f1Saving || f1Saved || f1Loading || f1Races.length === 0 || f1SessionKey == null
                  }
                  className="btn-primary btn-sm"
                  title={
                    labMode === "mundial" && guidelinesSaved
                      ? "Pautas guardadas. Edita el texto para volver a guardar."
                      : labMode === "f1" && f1Saved
                        ? "Pautas guardadas. Edita el texto para volver a guardar."
                        : undefined
                  }
                >
                  {labMode === "mundial"
                    ? guidelinesSaving
                      ? "Guardando…"
                      : guidelinesSaved
                        ? "Guardado"
                        : "Guardar pautas"
                    : f1Saving
                      ? "Guardando…"
                      : f1Saved
                        ? "Guardado"
                        : "Guardar pautas"}
                </button>
                {labMode === "mundial" && guidelinesSaved && !guidelinesSaving ? (
                  <Link
                    to="/app/prode?generate=1"
                    className="btn-secondary btn-sm guidelines-prode-link"
                  >
                    Generar predicción
                  </Link>
                ) : labMode === "mundial" ? (
                  <span
                    className="btn-secondary btn-sm guidelines-prode-link guidelines-prode-link-disabled"
                    title={
                      guidelinesSaving
                        ? "Espera a que termine el guardado."
                        : "Guarda las pautas antes de ir al Prode a generar predicciones."
                    }
                  >
                    Generar predicción
                  </span>
                ) : (
                  <Link to="/app/prode#f1" className="btn-secondary btn-sm guidelines-prode-link">
                    Ir a predicciones F1
                  </Link>
                )}
              </div>
            </form>
            {labMode === "mundial" ? (
              <>
                <p className="ia-console-legend">
                  Hay <strong>tres bloques</strong> (uno por etapa); elige la etapa arriba y edita cada una en la misma
                  caja. Al guardar se persisten los tres. Si falta el texto de una etapa, no podrás generar en el Prode
                  cuando esa ventana esté activa.
                </p>
                <p className="ia-console-flow">
                  <strong>¿Cómo llega esto a los resultados?</strong> Al generar en el Prode, el servidor arma un
                  prompt por cada partido de la etapa e incluye las pautas como{" "}
                  <em>criterios generales de toda esa etapa</em> (no solo de ese encuentro), para que el modelo mantenga
                  la misma guía en todos los marcadores. Si el bloque de esa etapa está vacío, la generación no se puede
                  ejecutar.
                </p>
              </>
            ) : (
              <p className="ia-console-legend">
                En <strong>F1</strong> las pautas van <strong>por carrera</strong> (selector arriba). Son la base para
                futuras generaciones con IA por gran premio; hoy podés guardarlas y completar el top 10 manualmente en
                Mis predicciones → pestaña F1.
              </p>
            )}
          </div>
        </section>

        <aside className="ia-sidebar">
          <h2 className="ia-resources-title">Centro de Recursos</h2>
          <div className="ia-resources-widgets">
            <div className="ia-widget">
              <h3>Ranking FIFA Actualizado</h3>
              <span className="ia-widget-placeholder">Próximamente</span>
            </div>
            <div className="ia-widget">
              <h3>Historial de Goles 2024-2026</h3>
              <span className="ia-widget-placeholder">Próximamente</span>
            </div>
            <div className="ia-widget">
              <h3>Histórico de campeones del mundo</h3>
              <span className="ia-widget-placeholder">Próximamente</span>
            </div>
          </div>
        </aside>
      </div>

      <section className="ia-versions" aria-labelledby="ia-versions-heading">
        <h2 id="ia-versions-heading">Control de versiones (log)</h2>
        <p className="ia-prediction-history-note">
          Historial de <strong>tus predicciones</strong> (marcadores y campeón/subcampeón). Solo tú puedes verlo:
          está guardado en tu cuenta y <strong>no se comparte</strong> con otros usuarios.
        </p>

        {historyLoading && <p className="placeholder-text">Cargando historial…</p>}
        {historyError && <div className="auth-error">{historyError}</div>}

        {!historyLoading && !historyError && timeline.length === 0 && (
          <p className="placeholder-text">
            Aún no hay movimientos registrados. Aparecerán cuando generes predicciones con IA o guardes
            marcadores manualmente desde el Prode.
          </p>
        )}

        {!historyLoading && timeline.length > 0 && (
          <div className="ia-history-timeline">
            {timeline.map((item) => {
              if (item.kind === "batch") {
                const expanded = expandedBatches[item.batchId] ?? false;
                const phase =
                  item.phaseLabel && PHASE_LABELS[item.phaseLabel]
                    ? PHASE_LABELS[item.phaseLabel]
                    : item.phaseLabel ?? "";
                const matchCount = item.items.filter((i) => i.kind === "match").length;
                const hasChampion = item.items.some((i) => i.kind === "champion");
                return (
                  <div key={item.key} className="ia-history-batch">
                    <button
                      type="button"
                      className="ia-history-batch-trigger"
                      aria-expanded={expanded}
                      onClick={() => toggleBatch(item.batchId)}
                    >
                      <span className="ia-history-batch-title">
                        Generación con IA
                        {phase ? ` · ${phase}` : ""}
                      </span>
                      <span className="ia-history-batch-meta">
                        {matchCount > 0 && `${matchCount} partido${matchCount === 1 ? "" : "s"}`}
                        {hasChampion && (
                          <span>{matchCount > 0 ? " · " : ""}Campeón/subcampeón</span>
                        )}
                      </span>
                      <span className="ia-history-batch-date">
                        {new Date(item.createdAt).toLocaleString("es-AR")}
                      </span>
                      <span className="ia-history-batch-chevron" aria-hidden>
                        {expanded ? "▼" : "▶"}
                      </span>
                    </button>
                    {expanded && (
                      <>
                        <IaBatchPromptBlock lines={batchPrompts[item.batchId]} />
                        <ul className="ia-history-batch-list">
                        {item.items.map((row) => (
                          <li key={row.id}>
                            {row.kind === "champion" && row.champion && row.runnerUp && (
                              <span>
                                🏆 {row.champion} / 🥈 {row.runnerUp}
                              </span>
                            )}
                            {row.kind === "match" && row.teamA && row.teamB && (
                              <span>
                                {row.teamA} vs {row.teamB}: {row.scoreA}-{row.scoreB}
                              </span>
                            )}
                          </li>
                        ))}
                        </ul>
                      </>
                    )}
                  </div>
                );
              }

              const row = item.entry;
              return (
                <div key={item.key} className="ia-history-single">
                  <div className="ia-history-single-line">
                    <span className="ia-history-single-badge">
                      {row.source === "manual" ? "Manual" : "IA"}
                    </span>
                    {row.kind === "champion" && row.champion && row.runnerUp && (
                      <span>
                        Campeón/subcampeón: {row.champion} / {row.runnerUp}
                      </span>
                    )}
                    {row.kind === "match" && row.teamA && row.teamB && (
                      <span>
                        {row.teamA} vs {row.teamB}: {row.scoreA}-{row.scoreB}
                      </span>
                    )}
                    <span className="ia-history-single-date">
                      {new Date(row.createdAt).toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
