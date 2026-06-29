import type { Match } from "./api";
import { hasOfficialMatchResult } from "./match-result";

/** Slots 1A, 2B, 3D… (solo football-data.org debe rellenarlos en BD; no inferir localmente). */
export function isGroupPositionSlot(name: string): boolean {
  return /^[123][A-L]$/.test(name.trim());
}

export function isKnockoutFeederSlot(name: string): boolean {
  const t = name.trim();
  return /^R32-\d+$/.test(t) || /^R16-\d+$/.test(t) || /^QF-\d+$/.test(t) || /^SF-[1-4]$/.test(t);
}

export function isBracketSlotPlaceholder(name: string): boolean {
  const t = name.trim();
  if (t === "TBD") return true;
  return isGroupPositionSlot(t) || isKnockoutFeederSlot(t);
}

function isRealTeamLabel(name: string): boolean {
  const t = name.trim();
  if (!t || t === "TBD") return false;
  return !isGroupPositionSlot(t) && !isKnockoutFeederSlot(t);
}

function sortByKickoff(a: Match, b: Match): number {
  return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
}

function winnerFromOfficial(match: Match, teamA: string, teamB: string): string | null {
  if (!hasOfficialMatchResult(match)) return null;
  if (!isRealTeamLabel(teamA) || !isRealTeamLabel(teamB)) return null;
  const a = match.resultScoreA!;
  const b = match.resultScoreB!;
  if (a > b) return teamA;
  if (b > a) return teamB;
  return null;
}

function assignKnockoutFeederSlots(
  stageMatches: Match[],
  prefix: "R32" | "R16" | "QF" | "SF",
  slots: Map<string, string>
): void {
  const sorted = [...stageMatches].sort(sortByKickoff);
  sorted.forEach((m, i) => {
    const key = `${prefix}-${i + 1}`;
    const winner = winnerFromOfficial(m, m.teamA, m.teamB);
    if (winner) slots.set(key, winner);
  });
}

export type BracketSlotContext = {
  slotMap: Map<string, string>;
};

/**
 * Solo propaga ganadores entre rondas (R32-1, R16-1…) cuando los equipos en BD ya son reales
 * (vía sync football-data.org). No infiere 1A/3D desde tablas locales (8 mejores terceros).
 */
export function buildBracketSlotContext(allMatches: Match[]): BracketSlotContext {
  const slotMap = new Map<string, string>();
  const byStage = (stage: string) => allMatches.filter((m) => m.stage === stage);

  assignKnockoutFeederSlots(byStage("roundOf32"), "R32", slotMap);
  assignKnockoutFeederSlots(byStage("roundOf16"), "R16", slotMap);
  assignKnockoutFeederSlots(byStage("quarterFinal"), "QF", slotMap);
  assignKnockoutFeederSlots(byStage("semiFinal"), "SF", slotMap);

  return { slotMap };
}

export function resolveDisplayTeamName(raw: string, ctx: BracketSlotContext): string {
  const t = raw.trim();
  if (!isKnockoutFeederSlot(t)) return raw;
  return ctx.slotMap.get(t) ?? raw;
}

export function resolveMatchDisplayTeams(
  match: Pick<Match, "teamA" | "teamB">,
  ctx: BracketSlotContext
): { teamA: string; teamB: string } {
  return {
    teamA: resolveDisplayTeamName(match.teamA, ctx),
    teamB: resolveDisplayTeamName(match.teamB, ctx),
  };
}
