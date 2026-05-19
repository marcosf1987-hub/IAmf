export type CompetitionDiscipline = "football" | "f1";

/** Query `?discipline=football|f1` en rutas de ligas/resultados. */
export function parseDisciplineQuery(raw: unknown): CompetitionDiscipline | undefined {
  if (raw === "football" || raw === "f1") return raw;
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    if (t === "football" || t === "f1") return t;
  }
  return undefined;
}
