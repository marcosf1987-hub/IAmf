export type CompanyCompetitionScope = "football" | "f1" | "all";

export function scopeAllowsDiscipline(
  scope: CompanyCompetitionScope | undefined,
  discipline: "football" | "f1"
): boolean {
  if (!scope || scope === "all") return true;
  return scope === discipline;
}

export function scopeLabel(scope: CompanyCompetitionScope): string {
  switch (scope) {
    case "football":
      return "Solo Mundial";
    case "f1":
      return "Solo F1";
    default:
      return "Todas las competiciones";
  }
}

export function allowedDisciplines(scope: CompanyCompetitionScope | undefined): Array<"football" | "f1"> {
  if (!scope || scope === "all") return ["football", "f1"];
  return [scope];
}

export const COMPANY_SCOPE_OPTIONS: {
  value: CompanyCompetitionScope;
  title: string;
  description: string;
}[] = [
  {
    value: "all",
    title: "Todas",
    description: "Mundial y F1 disponibles para la empresa.",
  },
  {
    value: "football",
    title: "Solo Mundial",
    description: "Fútbol / Prode FIFA únicamente.",
  },
  {
    value: "f1",
    title: "Solo F1",
    description: "Predicciones de Fórmula 1 únicamente.",
  },
];
