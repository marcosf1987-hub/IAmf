/**
 * Fases de predicción del Prode.
 * La ventana de carga es por partido (cierra 1 h antes de cada pitazo), no al inicio de la fase.
 */
import i18n from "../i18n";
import { getPredictionLockAt, isMatchPredictionOpen } from "./match-prediction-window";

export const PRODE_PHASES = {
  groups: {
    id: "groups" as const,
    stages: ["group"],
    /** Fin de fase (fallback sin fixture): 1 h antes del último partido de grupos. */
    fallbackPhaseEnd: new Date("2026-06-28T01:00:00Z"),
  },
  roundOf32: {
    id: "roundOf32" as const,
    stages: ["roundOf32"],
    fallbackPhaseEnd: new Date("2026-07-04T18:00:00Z"),
  },
  knockout: {
    id: "knockout" as const,
    stages: ["roundOf16", "quarterFinal", "semiFinal", "thirdPlace", "final"],
    fallbackPhaseEnd: new Date("2026-07-19T18:00:00Z"),
  },
} as const;

export type ProdePhaseId = keyof typeof PRODE_PHASES;

const PHASE_ORDER: ProdePhaseId[] = ["groups", "roundOf32", "knockout"];

export type ProdePhaseMatch = { stage: string; kickoffAt: string };

export function getPhaseLabel(id: ProdePhaseId): string {
  return i18n.t(`prode:phases.${id}`);
}

/**
 * Fase activa: la primera (en orden) que aún tiene partidos con ventana de predicción abierta.
 * `deadline` = cierre del próximo partido abierto en esa fase (1 h antes de su pitazo).
 */
export function getCurrentPhase(
  matches?: ProdePhaseMatch[]
): { phase: ProdePhaseId; deadline: Date; label: string } | null {
  const now = new Date();
  const useFixture = Boolean(matches?.length);

  for (const id of PHASE_ORDER) {
    const p = PRODE_PHASES[id];

    if (useFixture) {
      const phaseMatches = matches!.filter((m) => p.stages.some((s) => s === m.stage));
      const openMatches = phaseMatches.filter((m) => isMatchPredictionOpen(m.kickoffAt, now));
      if (openMatches.length === 0) continue;

      let nextLockMs = Infinity;
      for (const m of openMatches) {
        const lockMs = getPredictionLockAt(m.kickoffAt).getTime();
        if (lockMs < nextLockMs) nextLockMs = lockMs;
      }
      return {
        phase: id,
        deadline: new Date(nextLockMs),
        label: getPhaseLabel(id),
      };
    }

    if (now < p.fallbackPhaseEnd) {
      return { phase: id, deadline: p.fallbackPhaseEnd, label: getPhaseLabel(id) };
    }
  }

  return null;
}

export function formatTimeLeft(deadline: Date): string {
  const now = new Date();
  if (now >= deadline) return "0";
  const diff = deadline.getTime() - now.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatTimeLeftLong(deadline: Date): string {
  const now = new Date();
  if (now >= deadline) return "0";
  const diff = deadline.getTime() - now.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days} días ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatDaysLeft(deadline: Date): string {
  const now = new Date();
  if (now >= deadline) return "0";
  const diff = deadline.getTime() - now.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  return String(days);
}
