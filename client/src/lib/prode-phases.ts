/**
 * Fases de predicción del Prode con deadlines (1h antes del primer partido de cada fase).
 */
import i18n from "../i18n";

export const PRODE_PHASES = {
  groups: {
    id: "groups" as const,
    stages: ["group"],
    deadline: new Date("2026-06-11T18:00:00Z"),
  },
  roundOf32: {
    id: "roundOf32" as const,
    stages: ["roundOf32"],
    deadline: new Date("2026-06-28T02:00:00Z"),
  },
  knockout: {
    id: "knockout" as const,
    stages: ["roundOf16", "quarterFinal", "semiFinal", "thirdPlace", "final"],
    deadline: new Date("2026-07-04T22:00:00Z"),
  },
} as const;

export type ProdePhaseId = keyof typeof PRODE_PHASES;

const PHASE_ORDER: ProdePhaseId[] = ["groups", "roundOf32", "knockout"];

export function getPhaseLabel(id: ProdePhaseId): string {
  return i18n.t(`prode:phases.${id}`);
}

export function getCurrentPhase(): { phase: ProdePhaseId; deadline: Date; label: string } | null {
  const now = new Date();
  for (const id of PHASE_ORDER) {
    const p = PRODE_PHASES[id];
    if (now < p.deadline) {
      return { phase: id, deadline: p.deadline, label: getPhaseLabel(id) };
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
