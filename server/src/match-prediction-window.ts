/** Margen antes del pitazo inicial: misma regla que F1 (1 h). */
export const PREDICTION_LOCK_MS_BEFORE_KICKOFF = 60 * 60 * 1000;

export function getPredictionLockAt(kickoffAt: Date | string): Date {
  const k = typeof kickoffAt === "string" ? new Date(kickoffAt) : kickoffAt;
  return new Date(k.getTime() - PREDICTION_LOCK_MS_BEFORE_KICKOFF);
}

/** `true` si aún se puede crear o cambiar una predicción para ese partido. */
export function isMatchPredictionOpen(kickoffAt: Date | string, now: Date = new Date()): boolean {
  return now.getTime() < getPredictionLockAt(kickoffAt).getTime();
}

export function filterOpenMatches<T extends { kickoffAt: Date | string }>(
  matches: T[],
  now: Date = new Date()
): T[] {
  return matches.filter((m) => isMatchPredictionOpen(m.kickoffAt, now));
}
