import type { PrismaClient } from "@prisma/client";
import { MATCHES_SEED } from "./matches-seed-data";
import {
  areSameGroupMembers,
  isGroupFixturePair,
  needsNameFromApi,
} from "./football-data";

const KNOCKOUT_SEED_BY_KICKOFF = new Map(
  MATCHES_SEED.filter((m) => m.stage !== "group").map((m) => [m.kickoffAt.toISOString(), m])
);

export type RepairKnockoutResult = {
  repaired: number;
  scoresCleared: number;
  details: string[];
};

function isCorruptedKnockoutRow(row: { teamA: string; teamB: string }): boolean {
  if (needsNameFromApi(row.teamA) && needsNameFromApi(row.teamB)) return false;
  if (isGroupFixturePair(row.teamA, row.teamB)) return true;
  if (areSameGroupMembers(row.teamA, row.teamB)) return true;
  return false;
}

/** Restaura slots de eliminatoria que recibieron equipos de fase de grupos por error de sync. */
export async function repairCorruptedKnockoutMatches(
  prisma: PrismaClient
): Promise<RepairKnockoutResult> {
  const knockouts = await prisma.match.findMany({
    where: { stage: { not: "group" } },
    select: {
      id: true,
      teamA: true,
      teamB: true,
      kickoffAt: true,
      resultScoreA: true,
      resultScoreB: true,
    },
  });

  let repaired = 0;
  let scoresCleared = 0;
  const details: string[] = [];

  for (const row of knockouts) {
    const seed = KNOCKOUT_SEED_BY_KICKOFF.get(row.kickoffAt.toISOString());

    const orphanScores =
      needsNameFromApi(row.teamA) &&
      needsNameFromApi(row.teamB) &&
      (row.resultScoreA != null || row.resultScoreB != null);

    if (orphanScores && seed) {
      await prisma.match.update({
        where: { id: row.id },
        data: { resultScoreA: null, resultScoreB: null },
      });
      scoresCleared++;
      details.push(`Marcador huérfano en ${seed.teamA} vs ${seed.teamB}`);
      continue;
    }

    if (!seed || !isCorruptedKnockoutRow(row)) continue;

    await prisma.match.update({
      where: { id: row.id },
      data: {
        teamA: seed.teamA,
        teamB: seed.teamB,
        resultScoreA: null,
        resultScoreB: null,
      },
    });
    repaired++;
    details.push(`${row.teamA} vs ${row.teamB} → ${seed.teamA} vs ${seed.teamB}`);
  }

  return { repaired, scoresCleared, details };
}
