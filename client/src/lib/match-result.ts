import type { Match } from "./api";

export function hasOfficialMatchResult(match: Pick<Match, "resultScoreA" | "resultScoreB">): boolean {
  return match.resultScoreA != null && match.resultScoreB != null;
}

export function formatMatchScore(scoreA: number, scoreB: number): string {
  return `${scoreA} - ${scoreB}`;
}
