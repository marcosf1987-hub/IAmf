/** Sedes ilustrativas (no vienen de la BD); reparto estable por id de partido. */

export type VenueInfo = { stadium: string; city: string };

const VENUES: VenueInfo[] = [
  { stadium: "MetLife Stadium", city: "East Rutherford, EE. UU." },
  { stadium: "Estadio Azteca", city: "Ciudad de México, México" },
  { stadium: "Mercedes-Benz Stadium", city: "Atlanta, EE. UU." },
  { stadium: "SoFi Stadium", city: "Los Ángeles, EE. UU." },
  { stadium: "AT&T Stadium", city: "Arlington, EE. UU." },
  { stadium: "BMO Field", city: "Toronto, Canadá" },
  { stadium: "BC Place", city: "Vancouver, Canadá" },
  { stadium: "Hard Rock Stadium", city: "Miami, EE. UU." },
  { stadium: "Levi's Stadium", city: "Santa Clara, EE. UU." },
  { stadium: "Lincoln Financial Field", city: "Filadelfia, EE. UU." },
  { stadium: "Gillette Stadium", city: "Foxborough, EE. UU." },
  { stadium: "NRG Stadium", city: "Houston, EE. UU." },
];

/** Parámetros estándar Unsplash (evita respuestas inconsistentes sin ixlib). */
function soccerPhoto(id: string): string {
  return `https://images.unsplash.com/${id}?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=75`;
}

/**
 * Solo fútbol / estadio / cancha (evitar fotos genéricas o de otros deportes).
 * Varias entradas repiten motivos distintos para que el hash siempre caiga en imagen válida.
 */
const STADIUM_BACKGROUNDS: string[] = [
  soccerPhoto("photo-1574629810360-7efbbe195018"), // estadio, césped
  soccerPhoto("photo-1431324155629-1a6deb1dec8d"), // cancha vista aérea
  soccerPhoto("photo-1522778119026-d647f0596c20"), // estadio / gradas
  soccerPhoto("photo-1579952363873-27f3bade9f55"), // balón en césped
  soccerPhoto("photo-1579952363873-27f3bade9f55"),
  soccerPhoto("photo-1522778119026-d647f0596c20"),
  soccerPhoto("photo-1574629810360-7efbbe195018"),
  soccerPhoto("photo-1431324155629-1a6deb1dec8d"),
];

/** Si falla la carga remota, el componente usa esta URL (misma temática). */
export const FALLBACK_STADIUM_BG = soccerPhoto("photo-1574629810360-7efbbe195018");

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

export function pickVenueForMatch(matchId: string): VenueInfo {
  return VENUES[hashString(matchId) % VENUES.length];
}

export function stadiumBackgroundUrlForMatch(matchId: string): string {
  return STADIUM_BACKGROUNDS[hashString(matchId) % STADIUM_BACKGROUNDS.length];
}

/** Fondo de card de liga sin cover (misma rotación que el carrusel de partidos). */
export function stadiumBackgroundUrlForLeague(leagueId: string): string {
  return stadiumBackgroundUrlForMatch(leagueId);
}
