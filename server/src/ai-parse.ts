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

/**
 * Extrae un objeto JSON de la respuesta (acepta bloque ```json opcional).
 */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(s.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Parsea JSON con predicciones por id de partido: { "uuid": { "scoreA": 1, "scoreB": 0 } } o "1-0" como string.
 */
export function parseAiBatchScoresJson(
  text: string,
  expectedIds: Set<string>
): Map<string, { scoreA: number; scoreB: number }> {
  const obj = extractJsonObject(text);
  const out = new Map<string, { scoreA: number; scoreB: number }>();
  if (!obj) return out;

  for (const id of expectedIds) {
    const v = obj[id];
    if (v == null) continue;
    if (typeof v === "string") {
      const p = parseAiScore(v);
      if (p) out.set(id, p);
      continue;
    }
    if (typeof v === "object" && v !== null && "scoreA" in v && "scoreB" in v) {
      const o = v as { scoreA: unknown; scoreB: unknown };
      const scoreA = Math.min(20, Math.max(0, Number(o.scoreA)));
      const scoreB = Math.min(20, Math.max(0, Number(o.scoreB)));
      if (Number.isFinite(scoreA) && Number.isFinite(scoreB)) out.set(id, { scoreA, scoreB });
    }
  }
  return out;
}
