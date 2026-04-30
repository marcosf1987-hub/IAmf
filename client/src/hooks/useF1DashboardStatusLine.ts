import { useEffect, useState } from "react";
import { buildF1DashboardStatusLine } from "../lib/f1-dashboard-status";
import { fetchF1Guidelines, fetchF1MyPredictions, fetchPublicF1Races } from "../lib/api";

export function useF1DashboardStatusLine(enabled: boolean): string {
  const [line, setLine] = useState("");

  useEffect(() => {
    if (!enabled) {
      setLine("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const year = new Date().getUTCFullYear();
        const [preds, races, gl] = await Promise.all([
          fetchF1MyPredictions(),
          fetchPublicF1Races(year, 12),
          fetchF1Guidelines(),
        ]);
        if (cancelled) return;
        const list = preds.predictions;
        const n = list.filter((p) => p.placements.some((x) => x != null)).length;
        const hasG = Object.values(gl.bySessionKey ?? {}).some((t) => typeof t === "string" && t.trim().length > 0);
        const next = races.races[0] ?? null;
        setLine(buildF1DashboardStatusLine(hasG, list, n, next));
      } catch {
        if (!cancelled) setLine("No se pudo cargar el estado F1.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return line;
}
