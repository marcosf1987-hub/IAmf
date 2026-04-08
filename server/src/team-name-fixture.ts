/**
 * Nombre canónico para emparejar partidos con MATCHES_SEED (inferencia de groupCode).
 * Unifica variantes del mismo seleccionado (API, datos viejos, etc.).
 */
export function canonicalTeamNameForFixture(name: string): string {
  const t = name.trim();
  if (t === "Bosnia and Herzegovina" || t === "Bosnia-Herzegovina") return "Bosnia";
  return t;
}
