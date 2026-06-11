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
  const match = trimmed.match(/(\d{1,2})\s*[-–:a]\s*(\d{1,2})/);
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

export type BatchMatchRef = { id: string; teamA: string; teamB: string };

function normalizeTeamToken(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function teamsMatchPair(lineOrKey: string, teamA: string, teamB: string): boolean {
  const hay = normalizeTeamToken(lineOrKey);
  const a = normalizeTeamToken(teamA);
  const b = normalizeTeamToken(teamB);
  return hay.includes(a) && hay.includes(b);
}

function findMatchByTeams(matches: BatchMatchRef[], teamA: string, teamB: string): BatchMatchRef | null {
  const a = normalizeTeamToken(teamA);
  const b = normalizeTeamToken(teamB);
  for (const m of matches) {
    const ma = normalizeTeamToken(m.teamA);
    const mb = normalizeTeamToken(m.teamB);
    if ((ma === a && mb === b) || (ma === b && mb === a)) return m;
  }
  return null;
}

function scoreFromUnknownValue(v: unknown): { scoreA: number; scoreB: number } | null {
  if (typeof v === "string") return parseAiScore(v);
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if ("scoreA" in o && "scoreB" in o) {
      const scoreA = Math.min(20, Math.max(0, Number(o.scoreA)));
      const scoreB = Math.min(20, Math.max(0, Number(o.scoreB)));
      if (Number.isFinite(scoreA) && Number.isFinite(scoreB)) return { scoreA, scoreB };
    }
    const home = o.home ?? o.homeScore ?? o.golesLocal ?? o.golesA;
    const away = o.away ?? o.awayScore ?? o.golesVisitante ?? o.golesB;
    if (home != null && away != null) {
      const scoreA = Math.min(20, Math.max(0, Number(home)));
      const scoreB = Math.min(20, Math.max(0, Number(away)));
      if (Number.isFinite(scoreA) && Number.isFinite(scoreB)) return { scoreA, scoreB };
    }
    const scoreStr = o.score ?? o.result ?? o.marcador ?? o.resultado;
    if (typeof scoreStr === "string") return parseAiScore(scoreStr);
  }
  return null;
}

function stripMarkdownFences(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1]!.trim();
  return raw.trim();
}

/**
 * Extrae un objeto JSON de la respuesta (acepta bloque ```json en cualquier parte del texto).
 */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const s = stripMarkdownFences(raw);

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

const NEST_KEYS = new Set([
  "predictions",
  "partidos",
  "matches",
  "resultados",
  "predicciones",
  "data",
  "scores",
  "respuesta",
  "results",
]);

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

function parseArrayRows(
  parsed: unknown,
  matches: BatchMatchRef[],
  out: Map<string, { scoreA: number; scoreB: number }>,
  resolveExpectedId: (raw: string) => string | null
): void {
  if (!Array.isArray(parsed)) return;
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const midRaw = r.matchId ?? r.match_id ?? r.id;
    let canonicalId: string | null = null;
    if (typeof midRaw === "string") canonicalId = resolveExpectedId(midRaw);

    if (!canonicalId) {
      const teamA = r.teamA ?? r.home ?? r.local ?? r.equipoLocal;
      const teamB = r.teamB ?? r.away ?? r.visitante ?? r.equipoVisitante;
      if (typeof teamA === "string" && typeof teamB === "string") {
        const m = findMatchByTeams(matches, teamA, teamB);
        if (m) canonicalId = m.id;
      }
    }

    if (!canonicalId || out.has(canonicalId)) continue;
    let p = scoreFromUnknownValue(r);
    if (!p) p = scoreFromUnknownValue({ scoreA: r.scoreA, scoreB: r.scoreB });
    if (!p && typeof r.result === "string") p = parseAiScore(r.result);
    if (p) out.set(canonicalId, p);
  }
}

function applyHeuristicFlatKeys(
  flat: Record<string, unknown>,
  matches: BatchMatchRef[],
  out: Map<string, { scoreA: number; scoreB: number }>
): void {
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    if (out.has(m.id)) continue;
    const idx = String(i + 1);
    const p =
      scoreFromUnknownValue(flat[idx]) ??
      scoreFromUnknownValue(flat[`match${idx}`]) ??
      scoreFromUnknownValue(flat[`partido${idx}`]);
    if (p) out.set(m.id, p);
  }

  for (const [key, value] of Object.entries(flat)) {
    if (NEST_KEYS.has(key)) continue;
    if (/^\d+$/.test(key)) continue;
    for (const m of matches) {
      if (out.has(m.id)) continue;
      if (!teamsMatchPair(key, m.teamA, m.teamB)) continue;
      const p = scoreFromUnknownValue(value);
      if (p) out.set(m.id, p);
    }
  }
}

function parsePlaintextBatchLines(
  text: string,
  matches: BatchMatchRef[],
  out: Map<string, { scoreA: number; scoreB: number }>
): void {
  const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines) {
    const score = parseAiScore(line);
    if (!score) continue;
    for (const m of matches) {
      if (out.has(m.id)) continue;
      if (teamsMatchPair(line, m.teamA, m.teamB)) {
        out.set(m.id, score);
        break;
      }
    }
  }
}

/**
 * Parsea JSON con predicciones por id de partido: objeto plano, anidado, array, claves por índice/equipos, o texto multilínea.
 */
export function parseAiBatchScoresJson(
  text: string,
  expectedIds: Set<string>,
  matches: BatchMatchRef[] = []
): Map<string, { scoreA: number; scoreB: number }> {
  const out = new Map<string, { scoreA: number; scoreB: number }>();
  const trimmed = text.trim();
  const orderedMatches =
    matches.length > 0
      ? matches.filter((m) => expectedIds.has(m.id))
      : [...expectedIds].map((id) => ({ id, teamA: "", teamB: "" }));

  function resolveExpectedId(raw: string): string | null {
    if (expectedIds.has(raw)) return raw;
    const low = raw.toLowerCase();
    for (const id of expectedIds) {
      if (id.toLowerCase() === low) return id;
    }
    return null;
  }

  try {
    const s = stripMarkdownFences(trimmed);
    const parsed = JSON.parse(s) as unknown;
    if (Array.isArray(parsed)) {
      parseArrayRows(parsed, orderedMatches, out, resolveExpectedId);
    }
  } catch {
    /* seguir con objeto o heurísticas */
  }

  const obj = extractJsonObject(text);
  if (obj) {
    const flat = flattenBatchRecord(obj);
    for (const id of expectedIds) {
      if (out.has(id)) continue;
      const p = lookupScoreInFlat(flat, id);
      if (p) out.set(id, p);
    }
    if (orderedMatches.some((m) => m.teamA)) {
      applyHeuristicFlatKeys(flat, orderedMatches, out);
    }

    for (const nk of NEST_KEYS) {
      const inner = obj[nk];
      if (Array.isArray(inner)) {
        parseArrayRows(inner, orderedMatches, out, resolveExpectedId);
      }
    }
  }

  const looksLikeStructuredJson = /^\s*[\[{]/.test(trimmed);
  if (
    orderedMatches.some((m) => m.teamA) &&
    out.size < expectedIds.size &&
    !looksLikeStructuredJson
  ) {
    parsePlaintextBatchLines(trimmed, orderedMatches, out);
  }

  return out;
}

/**
 * Extrae un top 10 ordenado (P1..P10) de dorsales de la respuesta de la IA.
 * Acepta array JSON, objeto con "placements"/"top10", o claves P1..P10.
 */
export function parseAiF1Top10Placements(text: string): number[] | null {
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) s = fence[1]!.trim();

  const fromArray = (arr: unknown): number[] | null => {
    if (!Array.isArray(arr) || arr.length < 10) return null;
    const nums: number[] = [];
    for (let i = 0; i < 10; i++) {
      const v = arr[i];
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      if (!Number.isFinite(n) || n < 1 || n > 99) return null;
      nums.push(n);
    }
    return nums;
  };

  try {
    const parsed = JSON.parse(s) as unknown;
    if (Array.isArray(parsed)) {
      const a = fromArray(parsed);
      if (a) return a;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      const inner = o.placements ?? o.top10 ?? o.prediction ?? o.predicciones;
      if (Array.isArray(inner)) {
        const a = fromArray(inner);
        if (a) return a;
      }
      const keys = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"];
      const nums: number[] = [];
      for (const k of keys) {
        const v = o[k] ?? o[k.toLowerCase()];
        const n = typeof v === "number" ? v : parseInt(String(v), 10);
        if (!Number.isFinite(n) || n < 1 || n > 99) return null;
        nums.push(n);
      }
      if (nums.length === 10) return nums;
    }
  } catch {
    /* siguiente */
  }

  const bracket = s.match(/\[\s*[\d,\s]+\s*\]/);
  if (bracket) {
    try {
      const parsed = JSON.parse(bracket[0]) as unknown;
      if (Array.isArray(parsed)) return fromArray(parsed);
    } catch {
      /* */
    }
  }
  return null;
}
