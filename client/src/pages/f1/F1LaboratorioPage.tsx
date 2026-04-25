import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { IaBatchPromptBlock, extractF1GuidelinesFromPrompt } from "../../components/IaBatchPromptBlock";
import {
  fetchF1AiPromptLogs,
  fetchF1Guidelines,
  fetchF1Races,
  putF1RaceGuideline,
  type F1RaceSummary,
  type PromptLog,
} from "../../lib/api";

function raceLabel(r: F1RaceSummary): string {
  const c = r.circuitShortName?.trim();
  const co = r.countryName?.trim();
  if (c && co) return `R${r.roundOrder} · ${c} (${co})`;
  return c || co || `Ronda ${r.roundOrder}`;
}

/** Carreras desde hoy 00:00 (hora local), no las ya corridas en el calendario. */
function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function racesFromTodayOnwards(list: F1RaceSummary[]): F1RaceSummary[] {
  const start = startOfTodayLocal().getTime();
  return [...list]
    .filter((r) => new Date(r.raceStartAt).getTime() >= start)
    .sort((a, b) => new Date(a.raceStartAt).getTime() - new Date(b.raceStartAt).getTime());
}

export default function F1LaboratorioPage() {
  const location = useLocation();
  const [races, setRaces] = useState<F1RaceSummary[]>([]);
  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [promptLogs, setPromptLogs] = useState<PromptLog[]>([]);
  const [promptLogsLoading, setPromptLogsLoading] = useState(true);
  const [promptLogsError, setPromptLogsError] = useState("");
  const [expandedF1Logs, setExpandedF1Logs] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [{ races }, gRes] = await Promise.all([fetchF1Races(), fetchF1Guidelines()]);
      const upcoming = racesFromTodayOnwards(races);
      setRaces(upcoming);
      const m = gRes.bySessionKey ?? {};
      setMap(m);
      setSessionKey((prev) => {
        if (prev != null && upcoming.some((r) => r.sessionKey === prev)) return prev;
        return upcoming[0]?.sessionKey ?? null;
      });
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setRaces([]);
      setSessionKey(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadPromptLogs = useCallback(async () => {
    setPromptLogsLoading(true);
    setPromptLogsError("");
    try {
      const res = await fetchF1AiPromptLogs();
      setPromptLogs(res.prompts ?? []);
    } catch (e) {
      setPromptLogsError(e instanceof Error ? e.message : "No se pudo cargar el historial de prompts");
      setPromptLogs([]);
    } finally {
      setPromptLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void reloadPromptLogs();
  }, [location.pathname, reloadPromptLogs]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && location.pathname.includes("/f1/laboratorio")) {
        void reloadPromptLogs();
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [location.pathname, reloadPromptLogs]);

  function toggleF1Log(id: string) {
    setExpandedF1Logs((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  useEffect(() => {
    if (sessionKey == null) return;
    setText(map[String(sessionKey)] ?? "");
  }, [sessionKey, map]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sessionKey == null) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await putF1RaceGuideline(sessionKey, text);
      setMap(res.bySessionKey);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const raceMeta = races.find((r) => r.sessionKey === sessionKey);

  return (
    <div className="f1-page-inner">
      <h2 className="f1-page-title">Laboratorio F1</h2>
      <p className="f1-page-lead">
        Pautas por carrera (OpenF1 <code>session_key</code>). Son la base para generar el top 10 con IA en Predicciones
        F1. El historial de prompts de F1 no se mezcla con el del Mundial.
      </p>
      {error ? <div className="auth-error">{error}</div> : null}
      <div className="ia-layout f1-lab-layout">
        <div className="ia-main">
          <form onSubmit={handleSubmit} className="guidelines-form">
        {loading ? (
          <p className="placeholder-text">Cargando calendario…</p>
        ) : races.length === 0 ? (
          <p className="placeholder-text">
            No hay carreras programadas desde hoy en adelante en el calendario, o la base está vacía. Revisá OpenF1.
          </p>
        ) : (
          <div className="guidelines-phase-block">
            <label htmlFor="f1-lab-race" className="guidelines-phase-label">
              Carrera
            </label>
            <select
              id="f1-lab-race"
              className="guidelines-phase-select"
              value={sessionKey ?? ""}
              onChange={(e) => {
                setSaved(false);
                setSessionKey(parseInt(e.target.value, 10));
              }}
            >
              {races.map((r) => (
                <option key={r.id} value={r.sessionKey}>
                  {raceLabel(r)} —{" "}
                  {new Date(r.raceStartAt).toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </option>
              ))}
            </select>
            <p className="guidelines-phase-hint">
              Solo carreras con fecha de carrera <strong>desde hoy</strong> (hora local). Session key:{" "}
              <code>{sessionKey ?? "—"}</code>
              {raceMeta ? ` · ${raceLabel(raceMeta)}` : ""}
            </p>
            <textarea
              value={text}
              onChange={(e) => {
                setSaved(false);
                setText(e.target.value);
              }}
              placeholder="Ej. parrilla, clima, degradación, SC…"
              rows={12}
              className="chat-input"
              maxLength={20000}
              aria-label="Pautas F1 para la carrera seleccionada"
            />
            <span className="guidelines-count">{text.length}/20000</span>
          </div>
        )}
        <div className="guidelines-actions">
          <button
            type="submit"
            className="btn-primary btn-sm"
            disabled={saving || saved || loading || races.length === 0 || sessionKey == null}
          >
            {saving ? "Guardando…" : saved ? "Guardado" : "Guardar pautas"}
          </button>
          <Link to="/app/f1/predicciones" className="btn-secondary btn-sm guidelines-prode-link">
            Ir a predicciones F1
          </Link>
        </div>
          </form>
        </div>

        <aside className="ia-sidebar f1-lab-sidebar" aria-label="Ideas para variables en tus pautas F1">
          <h3 className="ia-resources-title">Datos que podés mencionar</h3>
          <div className="ia-resources-widgets">
            <div className="ia-widget">
              <h3>Parrilla y clasificación</h3>
              <p className="ia-widget-placeholder">
                Posición de salida, penalidades en la grilla, motor nuevo o caja de cambios.
              </p>
            </div>
            <div className="ia-widget">
              <h3>Neumáticos y degradación</h3>
              <p className="ia-widget-placeholder">
                Compuesto medio vs duro, temperatura de pista, stint largo o undercut probables.
              </p>
            </div>
            <div className="ia-widget">
              <h3>Historial del circuito</h3>
              <p className="ia-widget-placeholder">
                DRS, adelantamientos en T1, safety cars frecuentes, clima típico del fin de semana.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <section className="ia-versions f1-lab-prompt-history" aria-labelledby="f1-lab-prompts-heading">
        <h2 id="f1-lab-prompts-heading">Control de versiones (log)</h2>
        <p className="ia-prediction-history-note">
          Historial de <strong>tus generaciones con IA</strong> para el top 10 de cada gran premio (mismo estilo que el
          log del Laboratorio del Mundial). Solo vos podés verlo: está en tu cuenta y{" "}
          <strong>no se comparte</strong> con otros usuarios.
        </p>
        {promptLogsLoading ? <p className="placeholder-text">Cargando historial…</p> : null}
        {promptLogsError ? <div className="auth-error">{promptLogsError}</div> : null}
        {!promptLogsLoading && !promptLogsError && promptLogs.length === 0 ? (
          <p className="placeholder-text">
            Aún no hay movimientos registrados. Aparecerán cuando uses &quot;Generar con IA&quot; en Predicciones F1
            (con pautas guardadas en esta sección para esa carrera).
          </p>
        ) : null}
        {!promptLogsLoading && promptLogs.length > 0 ? (
          <div className="ia-history-timeline">
            {promptLogs.map((log) => {
              const expanded = expandedF1Logs[log.id] ?? false;
              return (
                <div key={log.id} className="ia-history-batch">
                  <button
                    type="button"
                    className="ia-history-batch-trigger"
                    aria-expanded={expanded}
                    onClick={() => toggleF1Log(log.id)}
                  >
                    <span className="ia-history-batch-title">Generación con IA · F1 Top 10</span>
                    <span className="ia-history-batch-meta">{log.model?.trim() || "modelo"}</span>
                    <span className="ia-history-batch-date">
                      {new Date(log.createdAt).toLocaleString("es-AR")}
                    </span>
                    <span className="ia-history-batch-chevron" aria-hidden>
                      {expanded ? "▼" : "▶"}
                    </span>
                  </button>
                  {expanded ? (
                    <IaBatchPromptBlock
                      lines={[{ promptText: log.promptText, createdAt: log.createdAt }]}
                      extractGuidelines={extractF1GuidelinesFromPrompt}
                      fullPromptDetailLabel="Texto completo — predicción top 10 (parrilla)"
                      responseText={log.responseText}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
