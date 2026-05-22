import i18n from "../i18n";
import type { F1PredictionEntry, F1RaceSummary } from "./api";

export function f1RaceHeadline(r: F1RaceSummary): string {
  const circuit = r.circuitShortName?.trim();
  const country = r.countryName?.trim();
  if (circuit && country) return `${circuit} · ${country}`;
  return circuit || country || `R${r.roundOrder}`;
}

export function buildF1DashboardStatusLine(
  hasGuidelines: boolean,
  predictions: F1PredictionEntry[],
  filled: number,
  nextRace: F1RaceSummary | null
): string {
  const total = predictions.length;
  if (!hasGuidelines) {
    return i18n.t("f1:status.noGuidelines");
  }
  if (total === 0) {
    return i18n.t("f1:status.noRaces");
  }
  if (filled === 0) {
    const next = nextRace
      ? i18n.t("f1:status.nextGp", { name: f1RaceHeadline(nextRace) })
      : "";
    return i18n.t("f1:status.noPredictions", { next });
  }
  if (filled < total) {
    return i18n.t("f1:status.partial", { filled, total });
  }
  return i18n.t("f1:status.complete");
}
