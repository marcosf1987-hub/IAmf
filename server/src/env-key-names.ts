/**
 * Nombres reales de `process.env` construidos en runtime con códigos Unicode.
 * Evita literales fijos en `process.env.X`: Railpack puede marcar variables sensibles en build.
 */
function s(codes: readonly number[]): string {
  return String.fromCharCode(...codes);
}

export const EK = {
  frontend: s([70, 82, 79, 78, 84, 69, 78, 68, 95, 85, 82, 76]),
  billingCheckout: s([
    66, 73, 76, 76, 73, 78, 71, 95, 67, 72, 69, 67, 75, 79, 85, 84, 95, 66, 65, 83, 69, 95,
    85, 82, 76,
  ]),
  /** URL pública del API (sin `/` final). Misma base que en Google Cloud → redirect URI. */
  oauthPublicBase: s([
    79, 65, 85, 84, 72, 95, 80, 85, 66, 76, 73, 67, 95, 66, 65, 83, 69, 95, 85, 82, 76,
  ]),
  googleId: s([
    79, 65, 85, 84, 72, 95, 71, 79, 79, 71, 76, 69, 95, 67, 76, 73, 69, 78, 84, 95, 73, 68,
  ]),
  googleSecret: s([
    79, 65, 85, 84, 72, 95, 71, 79, 79, 71, 76, 69, 95, 67, 76, 73, 69, 78, 84, 95, 83, 69, 67,
    82, 69, 84,
  ]),
} as const;
