import type { F1PredictionEntry, F1RaceSummary } from "./api";

export function f1RaceHeadline(r: F1RaceSummary): string {
  const circuit = r.circuitShortName?.trim();
  const country = r.countryName?.trim();
  if (circuit && country) return `${circuit} · ${country}`;
  return circuit || country || `Ronda ${r.roundOrder}`;
}

export function buildF1DashboardStatusLine(
  hasGuidelines: boolean,
  predictions: F1PredictionEntry[],
  filled: number,
  nextRace: F1RaceSummary | null
): string {
  const total = predictions.length;
  if (!hasGuidelines) {
    return "Tu guía F1 por carrera aún está vacía. Configurala en el Laboratorio.";
  }
  if (total === 0) {
    return "Sin carreras en el calendario visible; cuando se sincronice el calendario, cargá tu top 10 antes de cada salida.";
  }
  if (filled === 0) {
    const tail = nextRace ? ` Próximo GP: ${f1RaceHeadline(nextRace)}.` : "";
    return `Tenés pautas F1 listas, pero todavía no cargaste el top 10 en ninguna carrera.${tail}`;
  }
  if (filled < total) {
    return `Top 10 cargado en ${filled} de ${total} carreras del calendario. Revisá predicciones pendientes antes de cada cierre.`;
  }
  return "Predicciones F1 al día para todas las carreras del calendario mostrado.";
}
