import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { Match, Prediction, ChampionPrediction } from "../lib/api";
import { getFlag, getFlagImageUrl } from "../lib/flags";
import type { ProdeGuidelinesByPhase } from "../lib/api";
import { useFlash } from "../contexts/FlashContext";
import {
  fetchMatches,
  fetchMyPredictions,
  fetchChampionPrediction,
  fetchProdeGuidelines,
  formatApiError,
  formatProdeAiError,
  generateProdePredictions,
} from "../lib/api";
import { getCurrentPhase, getPhaseLabel, formatTimeLeft, type ProdePhaseId } from "../lib/prode-phases";
import { isMatchPredictionOpen } from "../lib/match-prediction-window";
import { formatMatchScore, hasOfficialMatchResult } from "../lib/match-result";
import {
  buildBracketSlotContext,
  resolveMatchDisplayTeams,
} from "../lib/bracket-slot-resolve";
import {
  computeBestThirdsOfficialOnly,
  computeGroupStandingsOfficialOnly,
  type ThirdPlaceCandidate,
} from "../lib/prode-standings";
import { enrichMatchesWithInferredGroupCodes } from "../lib/match-group-infer";
import { formatDateTime } from "../lib/intl-format";
import {
  splitKnockoutStages,
  type ProdeKnockoutSection,
} from "../lib/prode-section-order";

function useStageLabels(): Record<string, string> {
  const { t } = useTranslation("prode");
  return useMemo(
    () => ({
      group: t("stages.group"),
      roundOf32: t("stages.roundOf32"),
      roundOf16: t("stages.roundOf16"),
      quarterFinal: t("stages.quarterFinal"),
      semiFinal: t("stages.semiFinal"),
      thirdPlace: t("stages.thirdPlace"),
      final: t("stages.final"),
    }),
    [t]
  );
}


const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

function sortByKickoff(a: Match, b: Match) {
  return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
}

type ProdeSection = { id: string; title: string; matches: Match[] };

type ProdeSectionsLayout = {
  groupSections: ProdeSection[];
  activeKnockoutSections: ProdeKnockoutSection[];
  completedKnockoutSections: ProdeKnockoutSection[];
};

function normalizeGroupCode(raw: string): string {
  const t = raw.trim();
  if (t.length === 1) return t.toUpperCase();
  return t;
}

/** Clave para `groupCode` en la API (debe coincidir con el filtro del servidor). */
function apiGroupCodeForSection(section: ProdeSection): string {
  if (section.id === "group-unknown") return "ungrouped";
  const raw = section.matches[0]?.groupCode?.trim();
  if (raw) return raw.length === 1 ? raw.toUpperCase() : raw;
  const title = section.title.replace(/^Grupo\s+/i, "").trim();
  if (title) return title.length === 1 ? title.toUpperCase() : title;
  return "ungrouped";
}

function isGroupStage(m: Match): boolean {
  return String(m.stage).toLowerCase() === "group";
}

function buildProdeSectionsLayout(
  matches: Match[],
  stageLabels: Record<string, string>,
  groupUnknownTitle: string,
  groupTitle: (code: string) => string
): ProdeSectionsLayout {
  const groupMatches = matches.filter(isGroupStage);
  const knockout = matches.filter((m) => !isGroupStage(m));

  const withCode = groupMatches.filter((m) => m.groupCode);
  const withoutCode = groupMatches.filter((m) => !m.groupCode);

  const byGroup = new Map<string, Match[]>();
  for (const m of withCode) {
    const c = normalizeGroupCode(m.groupCode!);
    if (!byGroup.has(c)) byGroup.set(c, []);
    byGroup.get(c)!.push(m);
  }
  for (const arr of byGroup.values()) arr.sort(sortByKickoff);

  const sections: ProdeSection[] = [];
  const usedCodes = new Set<string>();

  for (const letter of GROUP_LETTERS) {
    const arr = byGroup.get(letter);
    if (arr?.length) {
      sections.push({ id: `group-${letter}`, title: groupTitle(letter), matches: arr });
      usedCodes.add(letter);
    }
  }

  const extraCodes = Array.from(byGroup.keys())
    .filter((k) => !usedCodes.has(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const code of extraCodes) {
    const arr = byGroup.get(code);
    if (arr?.length) {
      const safeId = code.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
      sections.push({
        id: `group-extra-${safeId || "x"}`,
        title: groupTitle(code),
        matches: arr,
      });
    }
  }

  if (withoutCode.length) {
    withoutCode.sort(sortByKickoff);
    sections.push({
      id: "group-unknown",
      title: groupUnknownTitle,
      matches: withoutCode,
    });
  }

  const byStage = new Map<string, Match[]>();
  for (const m of knockout) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage)!.push(m);
  }
  for (const arr of byStage.values()) arr.sort(sortByKickoff);

  const { active: activeKnockoutSections, completed: completedKnockoutSections } = splitKnockoutStages(
    byStage,
    stageLabels
  );

  return {
    groupSections: sections,
    activeKnockoutSections,
    completedKnockoutSections,
  };
}

const EMPTY_LAB: ProdeGuidelinesByPhase = { groups: "", roundOf32: "", knockout: "" };

function ProdeFlag({ country }: { country: string }) {
  const src = getFlagImageUrl(country);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="prode-flag prode-flag-img"
        width={22}
        height={16}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className="prode-flag prode-flag-emoji" aria-hidden>
      {getFlag(country)}
    </span>
  );
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
  return EMPTY_LAB;
}

function pautasForPhase(phase: ProdePhaseId, lab: ProdeGuidelinesByPhase): string {
  if (phase === "groups") return lab.groups;
  if (phase === "roundOf32") return lab.roundOf32;
  return lab.knockout;
}

function ProdePageSkeleton() {
  return (
    <div className="page-content page-content--prode prode-page prode-page--loading" aria-busy="true" aria-label="Cargando predicciones">
      <div className="skeleton skeleton-line prode-sk-title" />
      <div className="skeleton skeleton-line prode-sk-sub" />
      <div className="prode-sk-grid">
        <div className="skeleton skeleton-block prode-sk-card" />
        <div className="skeleton skeleton-block prode-sk-card" />
        <div className="skeleton skeleton-block prode-sk-card" />
      </div>
    </div>
  );
}

export default function ProdePage() {
  const { t } = useTranslation("prode");
  const stageLabels = useStageLabels();
  const { showFlash } = useFlash();
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
  /** Solo fase de grupos: progreso por tarjeta al llamar a la IA por grupo. */
  const [groupIaStatus, setGroupIaStatus] = useState<Record<string, "idle" | "loading" | "done" | "error">>({});
  const [error, setError] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const { groupSections, activeKnockoutSections, completedKnockoutSections } = useMemo(
    () =>
      buildProdeSectionsLayout(matches, stageLabels, t("groupUnknown"), (code) =>
        t("groupTitle", { code })
      ),
    [matches, stageLabels, t]
  );

  const bracketCtx = useMemo(() => buildBracketSlotContext(matches), [matches]);

  const bestThirds = useMemo(() => {
    const groups = groupSections
      .filter((s) => s.id !== "group-unknown")
      .map((s) => ({ label: s.title, matches: s.matches }));
    return computeBestThirdsOfficialOnly(groups);
  }, [groupSections]);

  /** Refresca el countdown del subtítulo cada minuto. */
  const [clockTick, setClockTick] = useState(0);

  const currentPhase = useMemo(
    () => getCurrentPhase(matches),
    [matches, clockTick]
  );
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const hasLabGuidelinesForCurrentPhase = currentPhase
    ? pautasForPhase(currentPhase.phase, labGuidelines).trim().length > 0
    : false;

  useEffect(() => {
    const next: Record<string, boolean> = {};
    activeKnockoutSections.forEach((s, i) => {
      next[s.id] = i === 0;
    });
    completedKnockoutSections.forEach((s) => {
      next[s.id] = false;
    });
    setOpenSections(next);
  }, [activeKnockoutSections, completedKnockoutSections]);

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
        setMatches(enrichMatchesWithInferredGroupCodes(matchesRes.matches));
        const map: Record<string, Prediction> = {};
        for (const p of predsRes.predictions) {
          map[p.matchId] = p;
        }
        setPredictions(map);
        setChampionPrediction(champRes.championPrediction);
        setLabGuidelines(normalizeGuidelinesResponse(guidelinesRes));
      } catch (err) {
        setError(formatApiError(err));
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
          t("noGuidelinesPhase", { phase: getPhaseLabel(phase) })
        );
        return;
      }
      setGenerating(true);
      setError("");
      try {
        if (phase === "groups" && groupSections.length > 0) {
          const init: Record<string, "idle" | "loading" | "done" | "error"> = {};
          for (const s of groupSections) init[s.id] = "idle";
          setGroupIaStatus(init);
          let anyPred = false;
          for (const section of groupSections) {
            const openMatches = section.matches.filter((m) => isMatchPredictionOpen(m.kickoffAt));
            if (openMatches.length === 0) {
              setGroupIaStatus((prev) => ({ ...prev, [section.id]: "done" }));
              continue;
            }
            setGroupIaStatus((prev) => ({ ...prev, [section.id]: "loading" }));
            try {
              const code = apiGroupCodeForSection(section);
              const { predictions: newPreds, diagnostics } = await generateProdePredictions(phase, {
                groupCode: code,
              });
              setPredictions((prev) => {
                const next = { ...prev };
                for (const p of newPreds) {
                  next[p.matchId] = p;
                }
                return next;
              });
              const expectedOpen = openMatches.length;
              const incomplete =
                newPreds.length === 0 ||
                diagnostics?.status === "partial" ||
                newPreds.length < expectedOpen;
              if (incomplete) {
                setGroupIaStatus((prev) => ({
                  ...prev,
                  [section.id]: newPreds.length > 0 ? "done" : "error",
                }));
                if (newPreds.length === 0) {
                  throw new Error(formatProdeAiError(diagnostics, expectedOpen));
                }
              } else {
                setGroupIaStatus((prev) => ({ ...prev, [section.id]: "done" }));
              }
              if (newPreds.length > 0) anyPred = true;
            } catch (groupErr) {
              setGroupIaStatus((prev) => ({ ...prev, [section.id]: "error" }));
              throw groupErr;
            }
          }
          if (anyPred) showFlash("Predicciones generadas y guardadas correctamente.", "success");
        } else {
          setGroupIaStatus({});
          const { predictions: newPreds, championPrediction: newChamp, diagnostics } =
            await generateProdePredictions(phase);
          setPredictions((prev) => {
            const next = { ...prev };
            for (const p of newPreds) {
              next[p.matchId] = p;
            }
            return next;
          });
          if (newChamp) setChampionPrediction(newChamp);
          if (diagnostics?.status === "partial") {
            showFlash(formatProdeAiError(diagnostics, diagnostics.requested), "info");
          } else if (diagnostics?.status === "parse_failed" || diagnostics?.status === "ai_error") {
            throw new Error(formatProdeAiError(diagnostics, diagnostics.requested));
          } else {
            showFlash("Predicciones generadas y guardadas correctamente.", "success");
          }
        }
      } catch (err) {
        setError(formatApiError(err));
      } finally {
        setGenerating(false);
      }
    },
    [labGuidelines, showFlash, groupSections]
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
        t("noGuidelinesPhaseShort", { phase: getPhaseLabel(currentPhase.phase) })
      );
      return;
    }
    if (matches.length === 0) {
      setError("Los partidos aún no están disponibles. Volvé a intentar más tarde.");
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
    return <ProdePageSkeleton />;
  }

  return (
    <div className="page-content page-content--prode prode-page">
      <header className="prode-page-header">
        <div className="prode-page-header-inner">
          <h1 className="prode-page-title">{t("pageTitle")}</h1>
          <p className="page-subtitle prode-page-subtitle">
            Genera aquí tus predicciones con IA a partir de las pautas generadas en el Laboratorio de Prompts.
            {currentPhase ? (
              <>
                {" "}
                Podés cargar o actualizar predicciones solo en partidos que aún no cerraron (1 hora antes de
                cada pitazo). Próximo cierre en esta fase:{" "}
                <strong>{formatTimeLeft(currentPhase.deadline)}</strong>
              </>
            ) : (
              <> Ya no se pueden cargar predicciones. Todas las fases han cerrado.</>
            )}
          </p>
          {currentPhase && !hasLabGuidelinesForCurrentPhase ? (
            <p className="prode-lab-required" id="prode-lab-required-desc" role="status">
              Aún no puedes generar predicciones porque todavía no has guardado tus pautas. Genéralas en el Laboratorio
              y vuelve luego a esta sección.{" "}
              <Link to="/app/ia" className="prode-lab-required-link">
                Ir al Laboratorio de Prompts
              </Link>
            </p>
          ) : null}
          {currentPhase ? (
            <div className="prode-generate-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleGeneratePredictions(currentPhase.phase)}
                disabled={generating || matches.length === 0 || !hasLabGuidelinesForCurrentPhase}
                aria-describedby={!hasLabGuidelinesForCurrentPhase ? "prode-lab-required-desc" : undefined}
                title={
                  matches.length === 0
                    ? "Los partidos aún no están disponibles."
                    : !hasLabGuidelinesForCurrentPhase
                      ? t("saveGuidelinesBefore", { phase: getPhaseLabel(currentPhase.phase) })
                      : undefined
                }
              >
                {generating ? "Generando…" : `Generar predicciones para ${currentPhase.label}`}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}

      {matches.length === 0 && !loading && (
        <div className="prode-seed-hint" role="status">
          <h2 className="prode-seed-hint-title">Partidos no disponibles</h2>
          <p>
            Todavía no hay partidos cargados para predecir. Estamos preparando el torneo; volvé a
            intentar más tarde o contactá soporte si el problema persiste.
          </p>
        </div>
      )}

      <div className="prode-page-stack">
        {matches.length > 0 && groupSections.length === 0 && (
          <p className="prode-no-groups-hint" role="status">
            No hay partidos de <strong>fase de grupos</strong> disponibles en este momento.
          </p>
        )}

        {activeKnockoutSections.length > 0 && (
          <div className="prode-knockout-region" id="prode-eliminatorias">
            <h2 className="prode-knockout-region-title">Eliminatorias</h2>
            <p className="prode-knockout-region-lead">
              Cruces posteriores a la fase de grupos. Los equipos se cargan desde football-data.org (incluye los
              8 mejores terceros). Si ves códigos tipo 1A o 3D, sincronizá resultados en el panel de plataforma.
            </p>
          </div>
        )}

        {activeKnockoutSections.map((section) => (
          <KnockoutStageAccordion
            key={section.id}
            section={section}
            isOpen={openSections[section.id] ?? false}
            onToggle={() => toggleSection(section.id)}
            predictions={predictions}
            bracketCtx={bracketCtx}
            stageLabels={stageLabels}
          />
        ))}

        {championPrediction && (
          <div id="prode-campeon" className="prode-champion-block">
            <div className="prode-champion-card prode-actions-full prode-champion-card-gold">
              <h3 className="prode-champion-title"><span className="prode-emoji">🏆</span> Campeón</h3>
              <div className="prode-champion-team">
                <ProdeFlag country={championPrediction.champion} /> {championPrediction.champion}
              </div>
            </div>
            <div className="prode-champion-card prode-actions-full prode-champion-card-silver">
              <h3 className="prode-champion-title"><span className="prode-emoji">🥈</span> Subcampeón</h3>
              <div className="prode-champion-team">
                <ProdeFlag country={championPrediction.runnerUp} /> {championPrediction.runnerUp}
              </div>
            </div>
          </div>
        )}

        {groupSections.length > 0 && (
          <section className="prode-groups-stage prode-groups-stage--after-knockout" aria-labelledby="prode-sim-groups-heading">
            <div className="prode-groups-stage-head">
              <h2 id="prode-sim-groups-heading" className="prode-simulator-heading">
                {t("groupStageNav")}
              </h2>
              <p className="prode-groups-stage-lead">
                Tablas según resultados oficiales de la fase de grupos (referencia).
              </p>
            </div>
            <div className="prode-groups-grid">
              {groupSections.map((section) => (
                <GroupSimulatorCard
                  key={section.id}
                  section={section}
                  predictions={predictions}
                  iaStatus={groupIaStatus[section.id]}
                />
              ))}
            </div>
            {bestThirds.length > 0 && <BestThirdsTable candidates={bestThirds} />}
          </section>
        )}

        {completedKnockoutSections.length > 0 && (
          <>
            <div className="prode-knockout-region prode-knockout-region--completed" id="prode-eliminatorias-pasadas">
              <h2 className="prode-knockout-region-title">Eliminatorias — etapas finalizadas</h2>
            </div>
            {completedKnockoutSections.map((section) => (
              <KnockoutStageAccordion
                key={section.id}
                section={section}
                isOpen={openSections[section.id] ?? false}
                onToggle={() => toggleSection(section.id)}
                predictions={predictions}
                bracketCtx={bracketCtx}
                stageLabels={stageLabels}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function KnockoutStageAccordion({
  section,
  isOpen,
  onToggle,
  predictions,
  bracketCtx,
  stageLabels,
}: {
  section: ProdeKnockoutSection;
  isOpen: boolean;
  onToggle: () => void;
  predictions: Record<string, Prediction>;
  bracketCtx: ReturnType<typeof buildBracketSlotContext>;
  stageLabels: Record<string, string>;
}) {
  return (
    <section id={`prode-${section.id}`} className="prode-accordion prode-actions-full">
      <button
        type="button"
        className="prode-accordion-trigger"
        aria-expanded={isOpen}
        aria-controls={`prode-panel-${section.id}`}
        id={`prode-trigger-${section.id}`}
        onClick={onToggle}
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
              const display = resolveMatchDisplayTeams(m, bracketCtx);
              return (
                <MatchCard
                  key={m.id}
                  match={m}
                  displayTeamA={display.teamA}
                  displayTeamB={display.teamB}
                  prediction={pred}
                  stageLabels={stageLabels}
                  locked={!isMatchPredictionOpen(m.kickoffAt)}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function GroupSimulatorCard({
  section,
  predictions,
  iaStatus,
}: {
  section: ProdeSection;
  predictions: Record<string, Prediction>;
  iaStatus?: "idle" | "loading" | "done" | "error";
}) {
  const standings = useMemo(
    () => computeGroupStandingsOfficialOnly(section.matches),
    [section.matches]
  );
  const predictedCount = section.matches.filter((m) => predictions[m.id]).length;

  return (
    <article className="prode-group-card">
      <header className="prode-group-card-head">
        <h3 className="prode-group-card-title">{section.title}</h3>
        <span className="prode-group-card-head-right">
          {iaStatus != null && iaStatus !== "idle" ? (
            <span
              className={`prode-group-ia-badge prode-group-ia-badge--${iaStatus}`}
              title={
                iaStatus === "loading"
                  ? "Generando predicciones con IA para este grupo…"
                  : iaStatus === "done"
                    ? "Predicciones de este grupo generadas"
                    : "Error al generar este grupo"
              }
            >
              {iaStatus === "loading" ? "IA…" : iaStatus === "done" ? "IA ✓" : "IA ✗"}
            </span>
          ) : null}
          <span className="prode-group-card-meta">
            {predictedCount}/{section.matches.length} predichos
          </span>
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
                  <span aria-hidden>
                    <ProdeFlag country={row.team} />
                  </span>
                  <span className="prode-stand-team-name">{row.team}</span>
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
              <GroupMatchRow match={m} prediction={predictions[m.id]} locked={!isMatchPredictionOpen(m.kickoffAt)} />
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function GroupMatchRow({
  match,
  prediction,
  locked,
}: {
  match: Match;
  prediction?: Prediction;
  locked: boolean;
}) {
  const official = hasOfficialMatchResult(match);
  return (
    <div
      className={`prode-group-match-row${locked ? " prode-group-match-row--locked" : ""}${official ? " prode-group-match-row--has-result" : ""}`}
    >
      <span className="prode-group-match-side">
        <ProdeFlag country={match.teamA} />
        <span className="prode-group-match-name">{match.teamA}</span>
      </span>
      <span className="prode-group-match-scores">
        {official ? (
          <>
            <span className="prode-group-score prode-group-score--official">{match.resultScoreA}</span>
            <span className="prode-group-score-sep">-</span>
            <span className="prode-group-score prode-group-score--official">{match.resultScoreB}</span>
          </>
        ) : (
          <>
            <span className="prode-group-score">{prediction ? prediction.scoreA : "—"}</span>
            <span className="prode-group-score-sep">-</span>
            <span className="prode-group-score">{prediction ? prediction.scoreB : "—"}</span>
          </>
        )}
      </span>
      <span className="prode-group-match-side prode-group-match-side--right">
        <span className="prode-group-match-name">{match.teamB}</span>
        <ProdeFlag country={match.teamB} />
      </span>
      {official && prediction ? (
        <span className="prode-match-prediction-hint" title="Tu predicción">
          Pred: {prediction.scoreA}-{prediction.scoreB}
        </span>
      ) : null}
      {locked && !official ? <span className="prode-match-locked-badge">Cerrado</span> : null}
      {official ? <span className="prode-match-result-badge">Final</span> : null}
    </div>
  );
}

function BestThirdsTable({ candidates }: { candidates: ThirdPlaceCandidate[] }) {
  return (
    <div className="prode-best-thirds">
      <h3 className="prode-best-thirds-title">Mejores terceros</h3>
      <p className="prode-best-thirds-hint">
        Terceros de cada grupo según resultados oficiales (los 8 mejores clasifican a 16avos).
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
                  <ProdeFlag country={c.team} /> {c.team}
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

function MatchCard({
  match,
  displayTeamA,
  displayTeamB,
  prediction,
  stageLabels,
  locked,
}: {
  match: Match;
  displayTeamA?: string;
  displayTeamB?: string;
  prediction?: Prediction;
  stageLabels: Record<string, string>;
  locked: boolean;
}) {
  const { t } = useTranslation("prode");
  const official = hasOfficialMatchResult(match);
  const teamA = displayTeamA ?? match.teamA;
  const teamB = displayTeamB ?? match.teamB;
  const date = formatDateTime(match.kickoffAt, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`prode-card${locked ? " prode-card--locked" : ""}${official ? " prode-card--has-result" : ""}`}
    >
      <div className="prode-card-header">
        <span className="prode-stage">
          {match.stage === "group" && match.groupCode
            ? t("groupTitle", { code: match.groupCode })
            : stageLabels[match.stage] ?? match.stage}
        </span>
        <span className="prode-date">
          {date}
          {official ? <span className="prode-match-result-badge"> · Final</span> : null}
          {locked && !official ? <span className="prode-match-locked-badge"> · Cerrado</span> : null}
        </span>
      </div>
      <div className="prode-teams">
        <span>
          <ProdeFlag country={teamA} /> {teamA}
        </span>
        <span className="prode-vs">vs</span>
        <span>
          <ProdeFlag country={teamB} /> {teamB}
        </span>
      </div>
      <div className="prode-form prode-form-readonly">
        {official ? (
          <div className="prode-score-block">
            <span className="prode-score-label">Resultado oficial</span>
            <span className="prode-score prode-score--official">
              {formatMatchScore(match.resultScoreA!, match.resultScoreB!)}
            </span>
          </div>
        ) : null}
        {prediction ? (
          <div className="prode-score-block">
            {official ? <span className="prode-score-label">Tu predicción</span> : null}
            <span className={`prode-score${official ? " prode-score--prediction" : ""}`}>
              {formatMatchScore(prediction.scoreA, prediction.scoreB)}
            </span>
          </div>
        ) : !official ? (
          <span className="prode-score">—</span>
        ) : null}
      </div>
    </div>
  );
}
