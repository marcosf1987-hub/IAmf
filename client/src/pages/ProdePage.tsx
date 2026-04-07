import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { Match, Prediction, ChampionPrediction } from "../lib/api";
import { getFlag } from "../lib/flags";
import type { ProdeGuidelinesByPhase } from "../lib/api";
import {
  fetchMatches,
  fetchMyPredictions,
  fetchChampionPrediction,
  fetchProdeGuidelines,
  generateProdePredictions,
} from "../lib/api";
import { getCurrentPhase, formatTimeLeft, type ProdePhaseId } from "../lib/prode-phases";
import { computeBestThirds, computeGroupStandings, type ThirdPlaceCandidate } from "../lib/prode-standings";

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

const PHASE_LAB_NAME: Record<ProdePhaseId, string> = {
  groups: "Fase de grupos",
  roundOf32: "Treintaidosavos (R32)",
  knockout: "Eliminatorias",
};

const EMPTY_LAB: ProdeGuidelinesByPhase = { groups: "", roundOf32: "", knockout: "" };

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
  return EMPTY_LAB;
}

function pautasForPhase(phase: ProdePhaseId, lab: ProdeGuidelinesByPhase): string {
  if (phase === "groups") return lab.groups;
  if (phase === "roundOf32") return lab.roundOf32;
  return lab.knockout;
}

export default function ProdePage() {
  const navigate = useNavigate();
  const location = useLocation();
  /** Evita doble disparo en el mismo render; se resetea cuando la URL deja de tener ?generate=1 (no usar solo location.key: puede ser undefined y bloquear visitas repetidas). */
  const autoGenerateHandledForQuery = useRef(false);

  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [championPrediction, setChampionPrediction] = useState<ChampionPrediction | null>(null);
  const [labGuidelines, setLabGuidelines] = useState<ProdeGuidelinesByPhase>(EMPTY_LAB);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const sections = useMemo(() => buildProdeSections(matches), [matches]);

  const groupSections = useMemo(
    () => sections.filter((s) => s.id.startsWith("group-")),
    [sections]
  );
  const knockoutSections = useMemo(
    () => sections.filter((s) => !s.id.startsWith("group-")),
    [sections]
  );

  const bestThirds = useMemo(() => {
    const groups = groupSections
      .filter((s) => s.id !== "group-unknown")
      .map((s) => ({ label: s.title, matches: s.matches }));
    return computeBestThirds(groups, predictions);
  }, [groupSections, predictions]);

  const currentPhase = getCurrentPhase();

  const hasLabGuidelinesForCurrentPhase = currentPhase
    ? pautasForPhase(currentPhase.phase, labGuidelines).trim().length > 0
    : false;

  useEffect(() => {
    const next: Record<string, boolean> = {};
    knockoutSections.forEach((s, i) => {
      next[s.id] = i === 0;
    });
    setOpenSections(next);
  }, [knockoutSections]);

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  useEffect(() => {
    async function load() {
      try {
        const [matchesRes, predsRes, champRes, guidelinesRes] = await Promise.all([
          fetchMatches(),
          fetchMyPredictions(),
          fetchChampionPrediction(),
          fetchProdeGuidelines().catch(() => ({ guidelines: EMPTY_LAB })),
        ]);
        setMatches(matchesRes.matches);
        const map: Record<string, Prediction> = {};
        for (const p of predsRes.predictions) {
          map[p.matchId] = p;
        }
        setPredictions(map);
        setChampionPrediction(champRes.championPrediction);
        setLabGuidelines(normalizeGuidelinesResponse(guidelinesRes));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== "visible") return;
      fetchProdeGuidelines()
        .then((r) => setLabGuidelines(normalizeGuidelinesResponse(r)))
        .catch(() => {});
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const handleGeneratePredictions = useCallback(
    async (phase: ProdePhaseId) => {
      if (!pautasForPhase(phase, labGuidelines).trim()) {
        setError(
          `No tenés pautas guardadas para ${PHASE_LAB_NAME[phase]} en el Laboratorio. Escribí y guardá ese bloque en el Laboratorio antes de generar predicciones con IA para esta etapa.`
        );
        return;
      }
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
    },
    [labGuidelines]
  );

  useEffect(() => {
    if (loading) return;
    const q = new URLSearchParams(location.search);
    if (q.get("generate") !== "1") {
      autoGenerateHandledForQuery.current = false;
      return;
    }
    if (autoGenerateHandledForQuery.current) return;
    autoGenerateHandledForQuery.current = true;

    navigate("/app/prode", { replace: true });

    if (!currentPhase) {
      setError("No hay una ventana de carga de predicciones abierta en este momento.");
      return;
    }
    if (!pautasForPhase(currentPhase.phase, labGuidelines).trim()) {
      setError(
        `No tenés pautas guardadas para ${PHASE_LAB_NAME[currentPhase.phase]} en el Laboratorio. Escribí y guardá ese bloque antes de generar.`
      );
      return;
    }
    if (matches.length === 0) {
      setError("No hay partidos cargados en la base. Ejecutá el seed antes de generar.");
      return;
    }
    void handleGeneratePredictions(currentPhase.phase);
  }, [
    loading,
    location.search,
    navigate,
    currentPhase,
    labGuidelines,
    matches.length,
    handleGeneratePredictions,
  ]);

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
      <p className="page-subtitle">
        Generá predicciones con IA usando las pautas por etapa que guardás en el Laboratorio (grupos, R32 y
        eliminatorias). Para cada ventana activa hace falta el bloque correspondiente.
      </p>

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
            {!hasLabGuidelinesForCurrentPhase && (
              <p className="prode-lab-required" id="prode-lab-required-desc" role="status">
                Todavía <strong>no guardaste pautas para {PHASE_LAB_NAME[currentPhase.phase]}</strong> en el
                Laboratorio. Sin ese bloque, la IA no puede armar los prompts de esta etapa. Escribí el texto en el
                Laboratorio (elegí la etapa arriba), pulsá <strong>Guardar pautas</strong> y volvé acá.{" "}
                <Link to="/app/ia" className="prode-lab-required-link">
                  Ir al Laboratorio
                </Link>
              </p>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleGeneratePredictions(currentPhase.phase)}
              disabled={generating || matches.length === 0 || !hasLabGuidelinesForCurrentPhase}
              aria-describedby={!hasLabGuidelinesForCurrentPhase ? "prode-lab-required-desc" : undefined}
              title={
                matches.length === 0
                  ? "Primero hay que cargar los partidos en la base (ejecutar prisma db seed con DATABASE_URL de producción)."
                  : !hasLabGuidelinesForCurrentPhase
                    ? `Guardá las pautas de ${PHASE_LAB_NAME[currentPhase.phase]} en el Laboratorio antes de generar.`
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

        {groupSections.length > 0 && (
          <section className="prode-simulator-block prode-actions-full" aria-labelledby="prode-sim-groups-heading">
            <h2 id="prode-sim-groups-heading" className="prode-simulator-heading">
              Fase de grupos
            </h2>
            <p className="prode-simulator-lead">
              Tus predicciones por partido actualizan la tabla de posiciones de cada grupo (3 pts ganar, 1 empate).
              Los dos primeros lugares se destacan como clasificación ilustrativa.
            </p>
            <div className="prode-groups-grid">
              {groupSections.map((section) => (
                <GroupSimulatorCard key={section.id} section={section} predictions={predictions} />
              ))}
            </div>
            {bestThirds.length > 0 && (
              <BestThirdsTable candidates={bestThirds} />
            )}
          </section>
        )}

        {knockoutSections.map((section) => {
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

function GroupSimulatorCard({
  section,
  predictions,
}: {
  section: ProdeSection;
  predictions: Record<string, Prediction>;
}) {
  const standings = useMemo(
    () => computeGroupStandings(section.matches, predictions),
    [section.matches, predictions]
  );
  const predictedCount = section.matches.filter((m) => predictions[m.id]).length;

  return (
    <article className="prode-group-card">
      <header className="prode-group-card-head">
        <h3 className="prode-group-card-title">{section.title}</h3>
        <span className="prode-group-card-meta">
          {predictedCount}/{section.matches.length} predichos
        </span>
      </header>
      <div className="prode-standings-wrap">
        <table className="prode-standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Equipo</th>
              <th>PTS</th>
              <th>PJ</th>
              <th>G</th>
              <th>E</th>
              <th>P</th>
              <th>DG</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, idx) => (
              <tr
                key={row.team}
                className={idx < 2 ? "prode-stand-row prode-stand-row--qual" : "prode-stand-row"}
              >
                <td>{idx + 1}</td>
                <td className="prode-stand-team">
                  <span className="prode-flag">{getFlag(row.team)}</span> {row.team}
                </td>
                <td>{row.pts}</td>
                <td>{row.pj}</td>
                <td>{row.g}</td>
                <td>{row.e}</td>
                <td>{row.p}</td>
                <td>{row.dg > 0 ? `+${row.dg}` : row.dg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="prode-group-matches">
        <h4 className="prode-group-matches-title">Partidos</h4>
        <ul className="prode-group-match-list">
          {section.matches.map((m) => (
            <li key={m.id}>
              <GroupMatchRow match={m} prediction={predictions[m.id]} />
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function GroupMatchRow({ match, prediction }: { match: Match; prediction?: Prediction }) {
  return (
    <div className="prode-group-match-row">
      <span className="prode-group-match-side">
        <span className="prode-flag">{getFlag(match.teamA)}</span>
        <span className="prode-group-match-name">{match.teamA}</span>
      </span>
      <span className="prode-group-match-scores">
        <span className="prode-group-score">{prediction ? prediction.scoreA : "—"}</span>
        <span className="prode-group-score-sep">-</span>
        <span className="prode-group-score">{prediction ? prediction.scoreB : "—"}</span>
      </span>
      <span className="prode-group-match-side prode-group-match-side--right">
        <span className="prode-group-match-name">{match.teamB}</span>
        <span className="prode-flag">{getFlag(match.teamB)}</span>
      </span>
    </div>
  );
}

function BestThirdsTable({ candidates }: { candidates: ThirdPlaceCandidate[] }) {
  return (
    <div className="prode-best-thirds">
      <h3 className="prode-best-thirds-title">Mejores terceros</h3>
      <p className="prode-best-thirds-hint">
        Orden ilustrativo de los equipos que quedan 3.º en su grupo según tus predicciones. El Mundial 2026 usa
        criterios adicionales para los cruces; esto sirve para ver el panorama en tu Prode.
      </p>
      <div className="prode-best-thirds-wrap">
        <table className="prode-best-thirds-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Equipo</th>
              <th>Grupo</th>
              <th>Pts</th>
              <th>DG</th>
              <th>GF</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => (
              <tr key={`${c.team}-${c.groupLabel}`}>
                <td>{i + 1}</td>
                <td>
                  <span className="prode-flag">{getFlag(c.team)}</span> {c.team}
                </td>
                <td>{c.groupLabel}</td>
                <td>{c.pts}</td>
                <td>{c.dg > 0 ? `+${c.dg}` : c.dg}</td>
                <td>{c.gf}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
