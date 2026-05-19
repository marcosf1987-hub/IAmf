import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ProdeGuidelinesByPhase } from "../lib/api";

type GuidelinePhaseKey = keyof ProdeGuidelinesByPhase;

const PHASE_EDITOR: {
  key: GuidelinePhaseKey;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "groups",
    label: "Fase de grupos",
    placeholder: "Ej. criterios para partidos de grupo, equipos fuertes en zona, etc.",
  },
  {
    key: "roundOf32",
    label: "16avos",
    placeholder: "Ej. criterios para cruces eliminatorios tempranos…",
  },
  {
    key: "knockout",
    label: "Eliminatorias",
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
      groupCode: string | null;
      title: string;
      items: PredictionHistoryEntry[];
    }
  | {
      key: string;
      kind: "single";
      entry: PredictionHistoryEntry;
    };

function formatGroupLabel(groupCode: string): string {
  const t = groupCode.trim();
  if (t.length === 1) return t.toUpperCase();
  return t;
}

function formatBatchTitle(phaseLabel: string | null, groupCode: string | null): string {
  if (phaseLabel === "groups" && groupCode) {
    return `Generación con IA - Fase de grupos: Grupo ${formatGroupLabel(groupCode)}`;
  }
  const phase =
    phaseLabel && PHASE_LABELS[phaseLabel] ? PHASE_LABELS[phaseLabel] : phaseLabel ?? "";
  if (phase) return `Generación con IA - ${phase}`;
  return "Generación con IA";
}

function filterBatchPromptsForGroup(
  lines: BatchPromptLine[] | undefined,
  groupCode: string | null
): BatchPromptLine[] | undefined {
  if (!lines?.length || !groupCode) return lines;
  const marker = `Ámbito: Grupo ${formatGroupLabel(groupCode)}`;
  const filtered = lines.filter((l) => l.promptText.includes(marker));
  return filtered.length > 0 ? filtered : lines;
}

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

  const batchItems: HistoryTimelineItem[] = [];
  for (const [batchId, items] of byBatch.entries()) {
    const sorted = [...items].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const phaseLabel = sorted.find((x) => x.phaseLabel)?.phaseLabel ?? null;

    if (phaseLabel === "groups") {
      const byGroup = new Map<string, PredictionHistoryEntry[]>();
      for (const e of sorted) {
        if (e.kind !== "match") continue;
        const gc = e.groupCode?.trim() || "_ungrouped";
        if (!byGroup.has(gc)) byGroup.set(gc, []);
        byGroup.get(gc)!.push(e);
      }
      for (const [gc, groupItems] of byGroup.entries()) {
        const groupCode = gc === "_ungrouped" ? null : gc;
        const createdAt = groupItems[groupItems.length - 1]?.createdAt ?? sorted[0].createdAt;
        batchItems.push({
          key: `batch-${batchId}-group-${gc}`,
          kind: "batch",
          batchId,
          createdAt,
          phaseLabel,
          groupCode,
          title: formatBatchTitle(phaseLabel, groupCode),
          items: groupItems,
        });
      }
      const championOnly = sorted.filter((e) => e.kind === "champion");
      if (championOnly.length > 0) {
        const createdAt = championOnly[championOnly.length - 1]?.createdAt ?? sorted[0].createdAt;
        batchItems.push({
          key: `batch-${batchId}-champion`,
          kind: "batch",
          batchId,
          createdAt,
          phaseLabel,
          groupCode: null,
          title: formatBatchTitle(phaseLabel, null),
          items: championOnly,
        });
      }
    } else {
      const createdAt = sorted[sorted.length - 1]?.createdAt ?? items[0].createdAt;
      batchItems.push({
        key: `batch-${batchId}`,
        kind: "batch",
        batchId,
        createdAt,
        phaseLabel,
        groupCode: null,
        title: formatBatchTitle(phaseLabel, null),
        items: sorted,
      });
    }
  }

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

  function toggleBatch(timelineKey: string) {
    setExpandedBatches((prev) => ({ ...prev, [timelineKey]: !prev[timelineKey] }));
  }

  const phaseMeta = PHASE_EDITOR.find((p) => p.key === editorPhase) ?? PHASE_EDITOR[0];

  return (
    <div className="page-content">
      <h1>Laboratorio de Prompts</h1>
      <p className="ia-mundial-scope-note">
        Escribe aquí tus mejores instrucciones para la IA, guárdalos y luego genera tus resultados en{" "}
        <Link to="/app/prode">Mis Predicciones</Link>
      </p>

      {error && <div className="auth-error">{error}</div>}

      <div className="ia-layout">
        <section className="ia-main">
          <div className="ia-console">
            <h2 className="ia-console-title">Genera aquí tus prompts</h2>
            <p className="ia-console-subtitle">
              Selecciona la etapa para la que generarás tus instrucciones y escribe tu prompt debajo
            </p>
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
                  {guidelinesSaving ? "Guardando…" : guidelinesSaved ? "Guardado" : "Guardar prompt"}
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
            <p className="ia-console-flow">
              <strong>¿Cómo se convierte tu prompt en tus predicciones?</strong> El sistema arma un prompt por cada
              grupo y fuerza a que la IA devuelva un único resultado numérico para cada partido de la etapa, incluyendo
              tus instrucciones, que pasan a ser criterios generales para toda esa etapa. Si el bloque de esa etapa está
              vacío, la generación no se puede ejecutar.
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
          Aquí está el historial de tus prompts junto con sus resultados. Solo tú puedes verlo: está guardado en tu
          cuenta y <strong>no se comparte</strong> con otros usuarios.
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
                const expanded = expandedBatches[item.key] ?? false;
                const matchCount = item.items.filter((i) => i.kind === "match").length;
                const hasChampion = item.items.some((i) => i.kind === "champion");
                const promptLines = filterBatchPromptsForGroup(
                  batchPrompts[item.batchId],
                  item.groupCode
                );
                return (
                  <div key={item.key} className="ia-history-batch">
                    <button
                      type="button"
                      className="ia-history-batch-trigger"
                      aria-expanded={expanded}
                      onClick={() => toggleBatch(item.key)}
                    >
                      <span className="ia-history-batch-title">{item.title}</span>
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
                        <IaBatchPromptBlock lines={promptLines} />
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
