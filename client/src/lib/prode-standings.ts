import type { Match, Prediction } from "./api";

export type GroupStandingRow = {
  team: string;
  pj: number;
  g: number;
  e: number;
  p: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
};

/**
 * Tabla tipo Mundial a partir de los partidos del grupo y las predicciones guardadas.
 * Solo cuenta partidos con predicción. 3 pts victoria, 1 empate, 0 derrota.
 */
export function computeGroupStandings(
  matches: Match[],
  predictions: Record<string, Prediction | undefined>
): GroupStandingRow[] {
  const byTeam = new Map<string, GroupStandingRow>();

  function row(team: string): GroupStandingRow {
    let r = byTeam.get(team);
    if (!r) {
      r = { team, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
      byTeam.set(team, r);
    }
    return r;
  }

  for (const m of matches) {
    row(m.teamA);
    row(m.teamB);
  }

  for (const m of matches) {
    const pred = predictions[m.id];
    if (!pred) continue;

    const a = row(m.teamA);
    const b = row(m.teamB);
    a.pj += 1;
    b.pj += 1;
    a.gf += pred.scoreA;
    a.gc += pred.scoreB;
    b.gf += pred.scoreB;
    b.gc += pred.scoreA;

    if (pred.scoreA > pred.scoreB) {
      a.g += 1;
      b.p += 1;
      a.pts += 3;
    } else if (pred.scoreA < pred.scoreB) {
      b.g += 1;
      a.p += 1;
      b.pts += 3;
    } else {
      a.e += 1;
      b.e += 1;
      a.pts += 1;
      b.pts += 1;
    }
  }

  for (const r of byTeam.values()) {
    r.dg = r.gf - r.gc;
  }

  const list = Array.from(byTeam.values());
  list.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.dg !== x.dg) return y.dg - x.dg;
    return y.gf - x.gf;
  });

  return list;
}

export type ThirdPlaceCandidate = {
  team: string;
  groupLabel: string;
  pts: number;
  dg: number;
  gf: number;
};

/** Mejores terceros: el 3.º de cada grupo (según tabla), para visualización tipo simulador. */
export function computeBestThirds(
  groups: { label: string; matches: Match[] }[],
  predictions: Record<string, Prediction | undefined>
): ThirdPlaceCandidate[] {
  const thirds: ThirdPlaceCandidate[] = [];
  for (const g of groups) {
    const table = computeGroupStandings(g.matches, predictions);
    if (table.length < 3) continue;
    const third = table[2];
    thirds.push({
      team: third.team,
      groupLabel: g.label,
      pts: third.pts,
      dg: third.dg,
      gf: third.gf,
    });
  }
  thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg !== a.dg) return b.dg - a.dg;
    return b.gf - a.gf;
  });
  return thirds;
}
