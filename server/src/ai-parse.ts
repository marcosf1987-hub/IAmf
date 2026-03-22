/**
 * Parsea la respuesta de la IA para extraer campeón y subcampeón.
 * Acepta formatos como "Argentina - Brasil", "Campeón: Argentina, Subcampeón: Brasil", etc.
 */
export function parseAiChampionRunnerUp(text: string): { champion: string; runnerUp: string } | null {
  const trimmed = text.trim();
  // Formato "Campeón: X, Subcampeón: Y" o "Champion: X, Runner-up: Y"
  const labeled = trimmed.match(
    /(?:campe[oó]n|champion|ganador|winner)\s*[:\-]\s*([^,\n]+?)(?:\s*[,;]\s*|\s+(?:subcampe[oó]n|runner[- ]?up|segundo|second)\s*[:\-]\s*)([^\n]+)/i
  );
  if (labeled) {
    const champion = labeled[1].trim().replace(/\s+/g, " ");
    const runnerUp = labeled[2].trim().replace(/\s+/g, " ");
    if (champion.length >= 2 && runnerUp.length >= 2) return { champion, runnerUp };
  }
  // Formato "X - Y" o "X vs Y" (primer equipo = campeón, segundo = subcampeón)
  const dash = trimmed.match(/([A-Za-zÀ-ÿ\s]{2,50})\s*[-–vs]\s*([A-Za-zÀ-ÿ\s]{2,50})/);
  if (dash) {
    const champion = dash[1].trim().replace(/\s+/g, " ");
    const runnerUp = dash[2].trim().replace(/\s+/g, " ");
    if (champion.length >= 2 && runnerUp.length >= 2) return { champion, runnerUp };
  }
  // Dos líneas o dos nombres separados
  const lines = trimmed.split(/[\n,;]/).map((s) => s.replace(/^[^:]*:\s*/, "").trim()).filter((s) => s.length >= 2);
  if (lines.length >= 2) return { champion: lines[0], runnerUp: lines[1] };
  return null;
}

/**
 * Parsea la respuesta de la IA para extraer un resultado de partido (X-Y).
 */
export function parseAiScore(text: string): { scoreA: number; scoreB: number } | null {
  const trimmed = text.trim();
  const match = trimmed.match(/(\d{1,2})\s*[-–a]\s*(\d{1,2})/);
  if (match) {
    const a = Math.min(20, Math.max(0, parseInt(match[1], 10)));
    const b = Math.min(20, Math.max(0, parseInt(match[2], 10)));
    return { scoreA: a, scoreB: b };
  }
  const twoNums = trimmed.match(/\b(\d{1,2})\b.*?\b(\d{1,2})\b/);
  if (twoNums) {
    const a = Math.min(20, Math.max(0, parseInt(twoNums[1], 10)));
    const b = Math.min(20, Math.max(0, parseInt(twoNums[2], 10)));
    return { scoreA: a, scoreB: b };
  }
  return null;
}
