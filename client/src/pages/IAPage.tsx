import { useEffect, useState } from "react";
import { fetchProdeGuidelines, updateProdeGuidelines } from "../lib/api";

type GuidelineHistoryEntry = {
  id: string;
  text: string;
  savedAt: string;
};

export default function IAPage() {
  const [guidelines, setGuidelines] = useState("");
  const [guidelinesSaving, setGuidelinesSaving] = useState(false);
  const [guidelinesSaved, setGuidelinesSaved] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<GuidelineHistoryEntry[]>([]);

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

    try {
      const stored = localStorage.getItem("prode_guidelines_history");
      if (stored) {
        const parsed = JSON.parse(stored) as GuidelineHistoryEntry[];
        setHistory(parsed);
      }
    } catch {
      setHistory([]);
    }
  }, []);

  async function handleSaveGuidelines(e: React.FormEvent) {
    e.preventDefault();
    setGuidelinesSaving(true);
    setGuidelinesSaved(false);
    setError("");
    try {
      await updateProdeGuidelines(guidelines);
      const entry: GuidelineHistoryEntry = {
        id: `g-${Date.now()}`,
        text: guidelines,
        savedAt: new Date().toISOString(),
      };
      setHistory((prev) => {
        const next = [entry, ...prev];
        try {
          localStorage.setItem("prode_guidelines_history", JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
      setGuidelinesSaved(true);
      setTimeout(() => setGuidelinesSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar pautas");
    } finally {
      setGuidelinesSaving(false);
    }
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

      <section className="ia-versions">
        <h2>Control de versiones (log)</h2>
        {history.length === 0 ? (
          <p className="placeholder-text">
            Aún no hay versiones guardadas. Cada vez que guardes tus pautas, se almacenará una copia acá.
          </p>
        ) : (
          <div className="ia-versions-list">
            {history.map((entry, i) => (
              <div key={entry.id} className="chat-log ia-version-card">
                <h3 className="ia-version-title">Estrategia v{history.length - i}</h3>
                <div className="chat-log-response">{entry.text || "(vacío)"}</div>
                <div className="chat-log-meta">
                  {new Date(entry.savedAt).toLocaleString("es-AR")}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
