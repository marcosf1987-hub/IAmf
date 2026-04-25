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
  fetchPredictionHistory,
  fetchProdeGuidelines,
  updateProdeGuidelines,
  type BatchPromptLine,
  type PredictionHistoryEntry,
} from "../lib/api";
import { IaBatchPromptBlock } from "../components/IaBatchPromptBlock";

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
  const [guidelines, setGuidelines] = useState<ProdeGuidelinesByPhase>(EMPTY_GUIDELINES);
  const [editorPhase, setEditorPhase] = useState<GuidelinePhaseKey>("groups");
  const [guidelinesSaving, setGuidelinesSaving] = useState(false);
  const [guidelinesSaved, setGuidelinesSaved] = useState(false);
  const [error, setError] = useState("");
  const [historyEntries, setHistoryEntries] = useState<PredictionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [batchPrompts, setBatchPrompts] = useState<Record<string, BatchPromptLine[]>>({});
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});

  const timeline = useMemo(() => buildTimeline(historyEntries), [historyEntries]);

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
    setGuidelinesSaving(true);
    setGuidelinesSaved(false);
    setError("");
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

  return (
    <div className="page-content">
      <h1>Laboratorio de Lógica Predictiva</h1>
      <p className="ia-mundial-scope-note">
        Este espacio es <strong>solo para el Prode del Mundial 2026</strong> (fases, marcadores y campeón). La Fórmula 1
        tiene laboratorio e historial de prompts <strong>independientes</strong> en <code>/app/f1/laboratorio</code>.
      </p>

      {error && <div className="auth-error">{error}</div>}

      <div className="ia-layout">
        <section className="ia-main">
          <div className="ia-console">
            <h2 className="ia-console-title">Consola de Edición</h2>
            <p className="ia-console-subtitle">Configura tu modelo maestro</p>
            <form onSubmit={handleSaveGuidelines} className="guidelines-form">
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
              <div className="guidelines-actions">
                <button
                  type="submit"
                  disabled={guidelinesSaving || guidelinesSaved}
                  className="btn-primary btn-sm"
                  title={
                    guidelinesSaved
                      ? "Pautas guardadas. Edita el texto para volver a guardar."
                      : undefined
                  }
                >
                  {guidelinesSaving ? "Guardando…" : guidelinesSaved ? "Guardado" : "Guardar pautas"}
                </button>
                {guidelinesSaved && !guidelinesSaving ? (
                  <Link
                    to="/app/prode?generate=1"
                    className="btn-secondary btn-sm guidelines-prode-link"
                  >
                    Generar predicción
                  </Link>
                ) : (
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
                )}
              </div>
            </form>
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
