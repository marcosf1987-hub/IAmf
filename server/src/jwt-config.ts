/** Duración del access JWT en segundos (alineado con `JWT_EXPIRES_IN` y cookies de sesión). */
export function jwtAccessTokenMaxAgeSeconds(): number {
  const raw = process.env.JWT_EXPIRES_IN?.trim();
  if (!raw) return 7 * 24 * 60 * 60;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const days = /^(\d+)d$/i.exec(raw);
  if (days) return parseInt(days[1], 10) * 24 * 60 * 60;
  return 7 * 24 * 60 * 60;
}
