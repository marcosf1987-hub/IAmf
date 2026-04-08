import type { Match } from "./api";
import { MATCHES_SEED } from "./matches-seed-data";
import { canonicalTeamNameForFixture } from "./team-name-fixture";

function findGroupFixtureLetter(teamA: string, teamB: string, kickoffAt: Date): string | null {
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

/** Misma lógica que el servidor: groupCode + stage=group según fixture oficial. */
export function enrichMatchesWithInferredGroupCodes(matches: Match[]): Match[] {
  return matches.map((m) => {
    const letter = findGroupFixtureLetter(m.teamA, m.teamB, new Date(m.kickoffAt));
    if (!letter) return m;
    let out: Match = { ...m };
    if (String(out.stage).toLowerCase() !== "group") {
      out = { ...out, stage: "group" };
    }
    if (out.groupCode == null || String(out.groupCode).trim() === "") {
      out = { ...out, groupCode: letter };
    }
    return out;
  });
}
