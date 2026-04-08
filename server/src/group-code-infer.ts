import type { MatchStage } from "@prisma/client";
import { MatchStage as MS } from "@prisma/client";
import { MATCHES_SEED } from "./matches-seed-data";
import { canonicalTeamNameForFixture } from "./team-name-fixture";

/** Partido de fase de grupos del fixture oficial (equipos + hora). */
function findGroupFixtureLetter(
  teamA: string,
  teamB: string,
  kickoffAt: Date
): string | null {
  const a = canonicalTeamNameForFixture(teamA);
  const b = canonicalTeamNameForFixture(teamB);
  const ms = kickoffAt.getTime();
  for (const row of MATCHES_SEED) {
    if (row.stage !== "group") continue;
    if (!("groupCode" in row) || !row.groupCode) continue;
    if (
      canonicalTeamNameForFixture(row.teamA) !== a ||
      canonicalTeamNameForFixture(row.teamB) !== b
    )
      continue;
    if (Math.abs(row.kickoffAt.getTime() - ms) <= 60_000) return row.groupCode;
  }
  return null;
}

/**
 * Si el partido coincide con el fixture de grupos del Mundial 2026:
 * - rellena groupCode si en BD es null;
 * - corrige stage a `group` si la BD guardó otro valor por error.
 */
export function enrichMatchRowWithInferredGroupCode<
  T extends {
    stage: MatchStage | string;
    groupCode: string | null;
    teamA: string;
    teamB: string;
    kickoffAt: Date;
  },
>(m: T): T {
  const letter = findGroupFixtureLetter(m.teamA, m.teamB, m.kickoffAt);
  if (!letter) return m;

  let out = { ...m };
  if (String(out.stage) !== "group") {
    out = { ...out, stage: MS.group };
  }
  if (out.groupCode == null || String(out.groupCode).trim() === "") {
    out = { ...out, groupCode: letter };
  }
  return out;
}
