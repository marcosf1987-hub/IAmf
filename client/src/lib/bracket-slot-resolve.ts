import type { Match } from "./api";
import { hasOfficialMatchResult } from "./match-result";
import { computeGroupStandingsOfficialOnly } from "./prode-standings";

const GROUP_LETTERS = "ABCDEFGHIJKL";

/** Slots 1A, 2B, 3D… del fixture de eliminatorias. */
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

function sortByKickoff(a: Match, b: Match): number {
  return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
}

/** 1A/2A/3A… desde tablas de grupos con solo resultados oficiales. */
export function buildGroupPositionSlotMap(groupMatches: Match[]): Map<string, string> {
  const byGroup = new Map<string, Match[]>();
  for (const m of groupMatches) {
    const code = m.groupCode?.trim().toUpperCase();
    if (!code || code.length !== 1 || !GROUP_LETTERS.includes(code)) continue;
    if (!byGroup.has(code)) byGroup.set(code, []);
    byGroup.get(code)!.push(m);
  }

  const slots = new Map<string, string>();
  for (const letter of GROUP_LETTERS) {
    const matches = byGroup.get(letter);
    if (!matches?.length) continue;
    const table = computeGroupStandingsOfficialOnly(matches);
    if (table[0]) slots.set(`1${letter}`, table[0].team);
    if (table[1]) slots.set(`2${letter}`, table[1].team);
    if (table[2]) slots.set(`3${letter}`, table[2].team);
  }
  return slots;
}

function winnerFromOfficial(
  match: Match,
  teamA: string,
  teamB: string
): string | null {
  if (!hasOfficialMatchResult(match)) return null;
  const a = match.resultScoreA!;
  const b = match.resultScoreB!;
  if (a > b) return teamA;
  if (b > a) return teamB;
  return null;
}

function assignKnockoutFeederSlots(
  stageMatches: Match[],
  prefix: "R32" | "R16" | "QF" | "SF",
  slots: Map<string, string>,
  resolveLabel: (raw: string) => string
): void {
  const sorted = [...stageMatches].sort(sortByKickoff);
  sorted.forEach((m, i) => {
    const key = `${prefix}-${i + 1}`;
    const teamA = resolveLabel(m.teamA);
    const teamB = resolveLabel(m.teamB);
    const winner = winnerFromOfficial(m, teamA, teamB);
    if (winner) slots.set(key, winner);
  });
}

export type BracketSlotContext = {
  slotMap: Map<string, string>;
};

/**
 * Mapa completo: posiciones de grupo + ganadores R32/R16/QF/SF (solo con resultado oficial).
 * Los nombres ya reales en BD (sync API) no se sobrescriben al resolver.
 */
export function buildBracketSlotContext(allMatches: Match[]): BracketSlotContext {
  const groupMatches = allMatches.filter((m) => String(m.stage).toLowerCase() === "group");
  const slotMap = buildGroupPositionSlotMap(groupMatches);

  const resolveLabel = (raw: string): string => {
    const t = raw.trim();
    if (!isBracketSlotPlaceholder(t)) return raw;
    return slotMap.get(t) ?? raw;
  };

  const byStage = (stage: string) => allMatches.filter((m) => m.stage === stage);

  assignKnockoutFeederSlots(byStage("roundOf32"), "R32", slotMap, resolveLabel);
  const resolveAfterR32 = (raw: string): string => resolveLabel(raw);
  assignKnockoutFeederSlots(byStage("roundOf16"), "R16", slotMap, resolveAfterR32);
  const resolveAfterR16 = (raw: string): string => resolveLabel(raw);
  assignKnockoutFeederSlots(byStage("quarterFinal"), "QF", slotMap, resolveAfterR16);
  const resolveAfterQf = (raw: string): string => resolveLabel(raw);
  assignKnockoutFeederSlots(byStage("semiFinal"), "SF", slotMap, resolveAfterQf);

  return { slotMap };
}

export function resolveDisplayTeamName(raw: string, ctx: BracketSlotContext): string {
  const t = raw.trim();
  if (!isBracketSlotPlaceholder(t)) return raw;
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
