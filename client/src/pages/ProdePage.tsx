import { useEffect, useMemo, useState } from "react";
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

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

function sortByKickoff(a: Match, b: Match) {
  return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
}

type ProdeSection = { id: string; title: string; matches: Match[] };

function buildProdeSections(matches: Match[]): ProdeSection[] {
  const groupMatches = matches.filter((m) => m.stage === "group");
  const knockout = matches.filter((m) => m.stage !== "group");

  const withCode = groupMatches.filter((m) => m.groupCode);
  const withoutCode = groupMatches.filter((m) => !m.groupCode);

  const byGroup = new Map<string, Match[]>();
  for (const m of withCode) {
    const c = m.groupCode!;
    if (!byGroup.has(c)) byGroup.set(c, []);
    byGroup.get(c)!.push(m);
  }
  for (const arr of byGroup.values()) arr.sort(sortByKickoff);

  const sections: ProdeSection[] = [];

  for (const letter of GROUP_LETTERS) {
    const arr = byGroup.get(letter);
    if (arr?.length) {
      sections.push({ id: `group-${letter}`, title: `Grupo ${letter}`, matches: arr });
    }
  }

  if (withoutCode.length) {
    withoutCode.sort(sortByKickoff);
    sections.push({
      id: "group-unknown",
      title: "Fase de grupos (sin zona)",
      matches: withoutCode,
    });
  }

  const byStage = new Map<string, Match[]>();
  for (const m of knockout) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage)!.push(m);
  }
  for (const arr of byStage.values()) arr.sort(sortByKickoff);

  const knockoutOrder = STAGE_ORDER.filter((s) => s !== "group");
  for (const st of knockoutOrder) {
    const arr = byStage.get(st);
    if (arr?.length) {
      sections.push({ id: `stage-${st}`, title: STAGE_LABELS[st] ?? st, matches: arr });
    }
  }

  return sections;
}

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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const sections = useMemo(() => buildProdeSections(matches), [matches]);

  const currentPhase = getCurrentPhase();

  useEffect(() => {
    const next: Record<string, boolean> = {};
    sections.forEach((s, i) => {
      next[s.id] = i === 0;
    });
    setOpenSections(next);
  }, [sections]);

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function expandAllSections() {
    const next: Record<string, boolean> = {};
    sections.forEach((s) => {
      next[s.id] = true;
    });
    setOpenSections(next);
  }

  function collapseAllSections() {
    const next: Record<string, boolean> = {};
    sections.forEach((s) => {
      next[s.id] = false;
    });
    setOpenSections(next);
  }

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

        {sections.length > 0 && (
          <div
            className="prode-accordion-toolbar prode-actions-full"
            role="toolbar"
            aria-label="Desplegar o colapsar todas las secciones"
          >
            <button type="button" className="btn-secondary btn-sm" onClick={expandAllSections}>
              Desplegar todo
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={collapseAllSections}>
              Colapsar todo
            </button>
          </div>
        )}

        {sections.map((section) => {
          const isOpen = openSections[section.id] ?? false;
          return (
            <section key={section.id} className="prode-accordion prode-actions-full">
              <button
                type="button"
                className="prode-accordion-trigger"
                aria-expanded={isOpen}
                aria-controls={`prode-panel-${section.id}`}
                id={`prode-trigger-${section.id}`}
                onClick={() => toggleSection(section.id)}
              >
                <span className="prode-accordion-title">{section.title}</span>
                <span className="prode-accordion-meta">
                  {section.matches.length} partido{section.matches.length === 1 ? "" : "s"}
                </span>
                <span className="prode-accordion-chevron" aria-hidden>
                  {isOpen ? "▼" : "▶"}
                </span>
              </button>
              {isOpen && (
                <div
                  className="prode-accordion-panel"
                  id={`prode-panel-${section.id}`}
                  role="region"
                  aria-labelledby={`prode-trigger-${section.id}`}
                >
                  <div className="prode-match-grid">
                    {section.matches.map((m) => {
                      const pred = predictions[m.id];
                      return <MatchCard key={m.id} match={m} prediction={pred} />;
                    })}
                  </div>
                </div>
              )}
            </section>
          );
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
        <span className="prode-stage">
          {match.stage === "group" && match.groupCode
            ? `Grupo ${match.groupCode}`
            : STAGE_LABELS[match.stage] ?? match.stage}
        </span>
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
