export type CompetitionDiscipline = "football" | "f1";

export function ligasListPath(discipline: CompetitionDiscipline): string {
  return discipline === "f1" ? "/app/f1/ligas" : "/app/ligas";
}

export function ligaDetailPath(discipline: CompetitionDiscipline, competitionId: string): string {
  return `${ligasListPath(discipline)}/${competitionId}`;
}

export function resultadosPath(discipline: CompetitionDiscipline): string {
  return discipline === "f1" ? "/app/f1/resultados" : "/app/resultados";
}
