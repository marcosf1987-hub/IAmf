import type { OpenF1DriverEntry } from "./openf1-sync";

/** Firma estable para localizar en `PromptLog` las generaciones F1 (sin depender de acentos en “Fórmula”). */
export const F1_PROMPT_LOG_SIGNATURE =
  "Respondé ÚNICAMENTE con un array JSON de exactamente 10 números enteros";

export function buildF1Top10Prompt(params: {
  pautas: string;
  circuitShortName: string | null;
  countryName: string | null;
  roundOrder: number;
  raceStartAtIso: string;
  drivers: OpenF1DriverEntry[];
}): string {
  const circuit = params.circuitShortName?.trim() || "—";
  const country = params.countryName?.trim() || "—";
  const roster =
    params.drivers.length > 0
      ? params.drivers.map((d) => `- #${d.driverNumber} ${d.label}`).join("\n")
      : "(No se pudo cargar la parrilla desde OpenF1; usá dorsales reales de pilotos inscritos en esta temporada.)";

  return `Eres un analista de Fórmula 1. El usuario definió criterios en el Laboratorio para pronosticar el orden de llegada del Gran Premio.

--- PAUTAS DEL USUARIO (Laboratorio F1) ---
${params.pautas}
---

Carrera: Ronda ${params.roundOrder} · ${circuit} (${country})
Salida a pista (referencia): ${params.raceStartAtIso}

Pilotos disponibles en OpenF1 para esta sesión (si hay listado, tu predicción SOLO puede usar esos dorsales, cada uno una sola vez, en orden P1→P10):
${roster}

${F1_PROMPT_LOG_SIGNATURE}, sin markdown ni texto fuera del JSON. Índice 0 = ganador (P1), índice 1 = P2, … hasta P10.
Ejemplo válido: [1,81,44,4,63,16,55,31,10,22]`;
}

/** Si `allowed` está vacío, solo valida rango 1–99 y sin duplicados. */
export function validateF1Top10AgainstRoster(nums: number[], allowed: Set<number>): boolean {
  if (nums.length !== 10) return false;
  const seen = new Set<number>();
  for (const n of nums) {
    if (!Number.isFinite(n) || n < 1 || n > 99) return false;
    if (allowed.size > 0 && !allowed.has(n)) return false;
    if (seen.has(n)) return false;
    seen.add(n);
  }
  return true;
}
