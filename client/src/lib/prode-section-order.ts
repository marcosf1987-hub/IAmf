import type { Match } from "./api";
import { isMatchPredictionOpen } from "./match-prediction-window";
import { hasOfficialMatchResult } from "./match-result";

/** Orden cronológico de etapas eliminatorias (sin fase de grupos). */
export const KNOCKOUT_STAGE_ORDER = [
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "thirdPlace",
  "final",
] as const;

export type KnockoutStageId = (typeof KNOCKOUT_STAGE_ORDER)[number];

/** Etapa eliminatoria cerrada: todos los partidos con resultado o ya jugados (ventana cerrada). */
export function isKnockoutStageComplete(stageMatches: Match[], now = new Date()): boolean {
  if (stageMatches.length === 0) return false;
  return stageMatches.every((m) => {
    if (hasOfficialMatchResult(m)) return true;
    const kickoff = new Date(m.kickoffAt);
    return kickoff <= now && !isMatchPredictionOpen(m.kickoffAt, now);
  });
}

export function splitKnockoutStages(
  byStage: Map<string, Match[]>,
  stageLabels: Record<string, string>
): { active: ProdeKnockoutSection[]; completed: ProdeKnockoutSection[] } {
  const active: ProdeKnockoutSection[] = [];
  const completed: ProdeKnockoutSection[] = [];

  for (const st of KNOCKOUT_STAGE_ORDER) {
    const arr = byStage.get(st);
    if (!arr?.length) continue;
    const section: ProdeKnockoutSection = {
      id: `stage-${st}`,
      title: stageLabels[st] ?? st,
      matches: arr,
      stage: st,
    };
    if (isKnockoutStageComplete(arr)) {
      completed.push(section);
    } else {
      active.push(section);
    }
  }

  return { active, completed };
}

export type ProdeKnockoutSection = {
  id: string;
  title: string;
  matches: Match[];
  stage: string;
};
