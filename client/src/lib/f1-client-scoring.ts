/** Alineado con `server/src/f1-scoring.ts`: 10 / 5 / 5 / 1×… en P4–P10 */
export function scoreF1PlacementsClient(
  predicted: (number | null)[],
  officialTop10: number[]
): number {
  if (officialTop10.length < 10) return 0;
  let pts = 0;
  for (let i = 0; i < 10; i++) {
    const pi = predicted[i] ?? null;
    const oi = officialTop10[i];
    if (pi == null || !oi) continue;
    if (pi !== oi) continue;
    if (i === 0) pts += 10;
    else if (i === 1 || i === 2) pts += 5;
    else pts += 1;
  }
  return pts;
}
