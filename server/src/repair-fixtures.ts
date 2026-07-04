import type { PrismaClient } from "@prisma/client";
import { ROUND_OF_16_FIXTURE } from "./matches-seed-data";

export type RepairRoundOf16Result = {
  ok: true;
  updated: number;
  expected: number;
  message: string;
};

/**
 * Alinea filas roundOf16 en BD con el fixture oficial (equipos + kickoff UTC).
 * Empareja cada partido oficial con la fila pendiente cuyo kickoffAt está más cerca
 * (funciona aunque la BD tenga cruces incorrectos por sync previo).
 */
export async function repairRoundOf16Fixtures(prisma: PrismaClient): Promise<RepairRoundOf16Result> {
  const rows = await prisma.match.findMany({
    where: { stage: "roundOf16" },
    select: { id: true, kickoffAt: true },
  });

  const assigned = new Set<string>();
  let updated = 0;

  for (const fix of ROUND_OF_16_FIXTURE) {
    const fixTime = fix.kickoffAt.getTime();
    let best: { id: string; diff: number } | null = null;

    for (const row of rows) {
      if (assigned.has(row.id)) continue;
      const diff = Math.abs(row.kickoffAt.getTime() - fixTime);
      if (!best || diff < best.diff) {
        best = { id: row.id, diff };
      }
    }

    if (!best) continue;

    assigned.add(best.id);
    await prisma.match.update({
      where: { id: best.id },
      data: {
        teamA: fix.teamA,
        teamB: fix.teamB,
        kickoffAt: fix.kickoffAt,
      },
    });
    updated++;
  }

  return {
    ok: true,
    updated,
    expected: ROUND_OF_16_FIXTURE.length,
    message:
      updated === ROUND_OF_16_FIXTURE.length
        ? `Octavos reparados: ${updated} partido(s) con equipos y horarios oficiales.`
        : `Octavos reparados parcialmente: ${updated}/${ROUND_OF_16_FIXTURE.length} (faltan filas en BD).`,
  };
}
