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

/** Imágenes de estadio/cancha (Unsplash); una por slide según hash del id. */
const STADIUM_BACKGROUNDS: string[] = [
  "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1600&q=65",
  "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1600&q=65",
  "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=65",
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1600&q=65",
  "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1600&q=65",
  "https://images.unsplash.com/photo-1459865264687-5959a615ff32?auto=format&fit=crop&w=1600&q=65",
  "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1600&q=65",
  "https://images.unsplash.com/photo-1522778525557-b980b08d51ef?auto=format&fit=crop&w=1600&q=65",
];

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
