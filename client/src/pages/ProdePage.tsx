import { useEffect, useState } from "react";
import type { Match, Prediction, ChampionPrediction } from "../lib/api";
import { getFlag } from "../lib/flags";
import { fetchMatches, fetchMyPredictions, fetchChampionPrediction, generateProdePredictions } from "../lib/api";
import { getCurrentPhase, formatTimeLeft, type ProdePhaseId } from "../lib/prode-phases";

const STAGE_LABELS: Record<string, string> = {
  group: "Fase de grupos",
  roundOf32: "Treintaidosavos",
  roundOf16: "Octavos",
  quarterFinal: "Cuartos",
  semiFinal: "Semifinal",
  thirdPlace: "Tercer puesto",
  final: "Final",
};

/** Orden de visualización: cronológico por fase (grupos primero, final al final) */
const STAGE_ORDER = ["group", "roundOf32", "roundOf16", "quarterFinal", "semiFinal", "thirdPlace", "final"];

const PHASE_GENERATE_HINT: Record<ProdePhaseId, string> = {
  groups:
    "Esta acción solo genera marcadores con IA para los partidos de fase de grupos (no para cruces ni final).",
  roundOf32: "Solo partidos de la ronda de 32 (R32). Antes tenés que tener predicción en todos los partidos de grupos.",
  knockout:
    "Incluye octavos, cuartos, semis, tercer puesto y final, más campeón/subcampeón. Antes completá todos los partidos de la fase de 16avos (R32).",
};

export default function ProdePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [championPrediction, setChampionPrediction] = useState<ChampionPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const currentPhase = getCurrentPhase();

  useEffect(() => {
    async function load() {
      try {
        const [matchesRes, predsRes, champRes] = await Promise.all([
          fetchMatches(),
          fetchMyPredictions(),
          fetchChampionPrediction(),
        ]);
        setMatches(matchesRes.matches);
        const map: Record<string, Prediction> = {};
        for (const p of predsRes.predictions) {
          map[p.matchId] = p;
        }
        setPredictions(map);
        setChampionPrediction(champRes.championPrediction);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleGeneratePredictions(phase: ProdePhaseId) {
    setGenerating(true);
    setError("");
    try {
      const { predictions: newPreds, championPrediction: newChamp } = await generateProdePredictions(phase);
      setPredictions((prev) => {
        const next = { ...prev };
        for (const p of newPreds) {
          next[p.matchId] = p;
        }
        return next;
      });
      if (newChamp) setChampionPrediction(newChamp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar predicciones");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="page-content">
        <div className="app-loading">
          <div className="spinner" />
          <p>Cargando partidos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <h1>Prode FIFA 2026</h1>
      <p className="page-subtitle">Generá predicciones con IA usando las pautas definidas en el Laboratorio</p>

      {error && <div className="auth-error">{error}</div>}

      {matches.length === 0 && !loading && (
        <div className="prode-seed-hint" role="status">
          <h2 className="prode-seed-hint-title">No hay partidos en la base de datos</h2>
          <p>
            El botón de generar predicciones está deshabilitado hasta que existan partidos cargados. En
            producción (Railway) eso se hace ejecutando <strong>una vez</strong> el seed de Prisma contra la
            misma base que usa el backend.
          </p>
          <p className="prode-seed-steps">
            <strong>Desde tu PC</strong> (PowerShell), con la <code>DATABASE_URL</code> que copiás del
            servicio PostgreSQL en Railway:
          </p>
          <pre className="prode-seed-code">
            {`cd server
$env:DATABASE_URL="postgresql://..."   # pegá la URL completa
npx prisma db seed`}
          </pre>
          <p className="prode-seed-note">
            Cuando termine sin error, <strong>recargá esta página</strong>. Deberías ver el listado de partidos
            y el botón se habilitará.
          </p>
        </div>
      )}

      <div className="prode-grid">
        {currentPhase ? (
          <div className="prode-actions prode-actions-full">
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleGeneratePredictions(currentPhase.phase)}
              disabled={generating || matches.length === 0}
              title={
                matches.length === 0
                  ? "Primero hay que cargar los partidos en la base (ejecutar prisma db seed con DATABASE_URL de producción)."
                  : undefined
              }
            >
              {generating ? "Generando…" : `Generar predicciones para ${currentPhase.label}`}
            </button>
            <p className="prode-deadline">
              Podés generar predicciones hasta 1 hora antes del primer partido de esta fase. Tiempo restante:{" "}
              <strong>{formatTimeLeft(currentPhase.deadline)}</strong>
            </p>
            <p className="prode-phase-hint">{PHASE_GENERATE_HINT[currentPhase.phase]}</p>
          </div>
        ) : (
          <div className="prode-actions prode-actions-full">
            <p className="prode-deadline prode-deadline-passed">
              Ya no se pueden cargar predicciones. Todas las fases han cerrado.
            </p>
          </div>
        )}

        {matches
          .sort((a, b) => {
            const ia = STAGE_ORDER.indexOf(a.stage);
            const ib = STAGE_ORDER.indexOf(b.stage);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            if (ia !== ib) return ia - ib;
            return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
          })
          .map((m) => {
            const pred = predictions[m.id];
            return <MatchCard key={m.id} match={m} prediction={pred} />;
          })}

        {championPrediction && (
          <>
            <div className="prode-champion-card prode-actions-full prode-champion-card-gold">
              <h3 className="prode-champion-title"><span className="prode-emoji">🏆</span> Campeón</h3>
              <div className="prode-champion-team">
                <span className="prode-flag">{getFlag(championPrediction.champion)}</span> {championPrediction.champion}
              </div>
            </div>
            <div className="prode-champion-card prode-actions-full prode-champion-card-silver">
              <h3 className="prode-champion-title"><span className="prode-emoji">🥈</span> Subcampeón</h3>
              <div className="prode-champion-team">
                <span className="prode-flag">{getFlag(championPrediction.runnerUp)}</span> {championPrediction.runnerUp}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, prediction }: { match: Match; prediction?: Prediction }) {
  const date = new Date(match.kickoffAt).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="prode-card">
      <div className="prode-card-header">
        <span className="prode-stage">{STAGE_LABELS[match.stage] ?? match.stage}</span>
        <span className="prode-date">{date}</span>
      </div>
      <div className="prode-teams">
        <span><span className="prode-flag">{getFlag(match.teamA)}</span> {match.teamA}</span>
        <span className="prode-vs">vs</span>
        <span><span className="prode-flag">{getFlag(match.teamB)}</span> {match.teamB}</span>
      </div>
      <div className="prode-form prode-form-readonly">
        <span className="prode-score">
          {prediction ? `${prediction.scoreA} - ${prediction.scoreB}` : "—"}
        </span>
      </div>
    </div>
  );
}
