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

function scoreFromUnknownValue(v: unknown): { scoreA: number; scoreB: number } | null {
  if (typeof v === "string") return parseAiScore(v);
  if (typeof v === "object" && v !== null && "scoreA" in v && "scoreB" in v) {
    const o = v as { scoreA: unknown; scoreB: unknown };
    const scoreA = Math.min(20, Math.max(0, Number(o.scoreA)));
    const scoreB = Math.min(20, Math.max(0, Number(o.scoreB)));
    if (Number.isFinite(scoreA) && Number.isFinite(scoreB)) return { scoreA, scoreB };
  }
  return null;
}

/**
 * Extrae un objeto JSON de la respuesta (acepta bloque ```json opcional).
 */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) s = fence[1]!.trim();

  const tryObj = (str: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(str) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* siguiente */
    }
    return null;
  };

  const direct = tryObj(s);
  if (direct) return direct;

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return tryObj(s.slice(start, end + 1));
}

const NEST_KEYS = [
  "predictions",
  "partidos",
  "matches",
  "resultados",
  "predicciones",
  "data",
  "scores",
  "respuesta",
  "results",
];

function flattenBatchRecord(obj: Record<string, unknown>): Record<string, unknown> {
  let out: Record<string, unknown> = { ...obj };
  for (const nk of NEST_KEYS) {
    const inner = obj[nk];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      out = { ...out, ...(inner as Record<string, unknown>) };
    }
  }
  return out;
}

function lookupScoreInFlat(flat: Record<string, unknown>, id: string): { scoreA: number; scoreB: number } | null {
  let v: unknown = flat[id];
  if (v == null) {
    const low = id.toLowerCase();
    for (const k of Object.keys(flat)) {
      if (k.toLowerCase() === low) {
        v = flat[k];
        break;
      }
    }
  }
  return scoreFromUnknownValue(v);
}

/**
 * Parsea JSON con predicciones por id de partido: objeto plano, anidado bajo "predictions", o array de filas.
 */
export function parseAiBatchScoresJson(
  text: string,
  expectedIds: Set<string>
): Map<string, { scoreA: number; scoreB: number }> {
  const out = new Map<string, { scoreA: number; scoreB: number }>();
  const trimmed = text.trim();

  function resolveExpectedId(raw: string): string | null {
    if (expectedIds.has(raw)) return raw;
    const low = raw.toLowerCase();
    for (const id of expectedIds) {
      if (id.toLowerCase() === low) return id;
    }
    return null;
  }

  // Formato array: [ { "matchId"|"id", scoreA, scoreB } ]
  try {
    let s = trimmed;
    const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
    if (fence) s = fence[1]!.trim();
    const parsed = JSON.parse(s) as unknown;
    if (Array.isArray(parsed)) {
      for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const midRaw = r.matchId ?? r.match_id ?? r.id;
        if (typeof midRaw !== "string") continue;
        const canonicalId = resolveExpectedId(midRaw);
        if (!canonicalId || out.has(canonicalId)) continue;
        let p = scoreFromUnknownValue({ scoreA: r.scoreA, scoreB: r.scoreB });
        if (!p && typeof r.result === "string") p = parseAiScore(r.result);
        if (p) out.set(canonicalId, p);
      }
    }
  } catch {
    /* seguir con objeto */
  }

  const obj = extractJsonObject(text);
  if (!obj) return out;

  const flat = flattenBatchRecord(obj);
  for (const id of expectedIds) {
    if (out.has(id)) continue;
    const p = lookupScoreInFlat(flat, id);
    if (p) out.set(id, p);
  }

  return out;
}
