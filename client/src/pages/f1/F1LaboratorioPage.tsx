import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchF1Guidelines,
  fetchF1Races,
  putF1RaceGuideline,
  type F1RaceSummary,
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
  const [races, setRaces] = useState<F1RaceSummary[]>([]);
  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    void load();
  }, [load]);

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
        Pautas por carrera (OpenF1 <code>session_key</code>). Son la base para futuras generaciones con IA por gran
        premio.
      </p>
      {error ? <div className="auth-error">{error}</div> : null}
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
  );
}
