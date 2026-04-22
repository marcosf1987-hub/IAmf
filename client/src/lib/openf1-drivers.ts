const OPENF1 = "https://api.openf1.org/v1";

type OpenF1Driver = {
  driver_number?: number;
  full_name?: string;
  name_acronym?: string;
};

/**
 * Nombres de pilotos para una sesión (OpenF1). Si el navegador bloquea CORS, devuelve mapa vacío.
 */
export async function fetchOpenF1DriverNames(sessionKey: number): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const url = `${OPENF1}/drivers?session_key=${sessionKey}`;
    const res = await fetch(url);
    if (!res.ok) return map;
    const rows = (await res.json()) as OpenF1Driver[];
    if (!Array.isArray(rows)) return map;
    for (const d of rows) {
      const n = typeof d.driver_number === "number" ? d.driver_number : parseInt(String(d.driver_number), 10);
      if (!Number.isFinite(n)) continue;
      const label =
        typeof d.full_name === "string" && d.full_name.trim()
          ? d.full_name.trim()
          : typeof d.name_acronym === "string" && d.name_acronym.trim()
            ? d.name_acronym.trim()
            : "";
      if (label) map.set(n, label);
    }
  } catch {
    /* CORS u offline */
  }
  return map;
}
