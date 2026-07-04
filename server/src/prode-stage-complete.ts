import { isMatchPredictionOpen } from "./match-prediction-window";

type StageMatchRow = {
  kickoffAt: Date;
  resultScoreA: number | null;
  resultScoreB: number | null;
};

/** Etapa cerrada: todos los partidos con resultado oficial o ya jugados (ventana cerrada). */
export function isProdeStageComplete(stageMatches: StageMatchRow[], now = new Date()): boolean {
  if (stageMatches.length === 0) return false;
  return stageMatches.every((m) => {
    if (m.resultScoreA != null && m.resultScoreB != null) return true;
    const kickoff = new Date(m.kickoffAt);
    return kickoff <= now && !isMatchPredictionOpen(m.kickoffAt, now);
  });
}
