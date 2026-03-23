import { useEffect, useMemo, useState } from "react";
import { fetchProdeGuidelines, fetchPredictionHistory, updateProdeGuidelines } from "../lib/api";
import type { PredictionHistoryEntry } from "../lib/api";

const PHASE_LABELS: Record<string, string> = {
  groups: "Fase de grupos",
  roundOf32: "Treintaidosavos",
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

export default function IAPage() {
  const [guidelines, setGuidelines] = useState("");
  const [guidelinesSaving, setGuidelinesSaving] = useState(false);
  const [guidelinesSaved, setGuidelinesSaved] = useState(false);
  const [error, setError] = useState("");
  const [historyEntries, setHistoryEntries] = useState<PredictionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});

  const timeline = useMemo(() => buildTimeline(historyEntries), [historyEntries]);

  useEffect(() => {
    async function load() {
      try {
        const guidelinesRes = await fetchProdeGuidelines();
        setGuidelines(guidelinesRes.guidelines);
      } catch {
        setGuidelines("");
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const res = await fetchPredictionHistory(500);
        setHistoryEntries(res.entries);
      } catch (e) {
        setHistoryError(e instanceof Error ? e.message : "No se pudo cargar el historial");
        setHistoryEntries([]);
      } finally {
        setHistoryLoading(false);
      }
    }
    loadHistory();
  }, []);

  async function handleSaveGuidelines(e: React.FormEvent) {
    e.preventDefault();
    setGuidelinesSaving(true);
    setGuidelinesSaved(false);
    setError("");
    try {
      await updateProdeGuidelines(guidelines);
      setGuidelinesSaved(true);
      setTimeout(() => setGuidelinesSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar pautas");
    } finally {
      setGuidelinesSaving(false);
    }
  }

  function toggleBatch(batchId: string) {
    setExpandedBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  }

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
              <textarea
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
                placeholder="Ej: Considera que Argentina suele jugar bien de local. Los equipos europeos tienen ventaja defensiva. Los partidos de fase de grupos suelen ser más cerrados..."
                rows={8}
                className="chat-input"
                maxLength={2000}
              />
              <div className="guidelines-actions">
                <span className="guidelines-count">{guidelines.length}/2000</span>
                <button type="submit" disabled={guidelinesSaving} className="btn-primary btn-sm">
                  {guidelinesSaving ? "Guardando…" : guidelinesSaved ? "Guardado" : "Guardar pautas"}
                </button>
              </div>
            </form>
            <p className="ia-console-legend">
              Recuerda: Tu IA generará el Prode completo basándose exclusivamente en lo que escribas aquí arriba.
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
          Historial de <strong>tus predicciones</strong> (marcadores y campeón/subcampeón). Solo vos podés verlo:
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
