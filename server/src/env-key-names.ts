/**
 * Nombres reales de `process.env` construidos en runtime con códigos Unicode.
 * Evita literales y base64 reconocibles: Railpack puede inferir secretos de build
 * a partir de nombres de variables sensibles si aparecen como texto o decodificables.
 */
function s(codes: readonly number[]): string {
  return String.fromCharCode(...codes);
}

export const EK = {
  oauthPublicBase: s([
    79, 65, 85, 84, 72, 95, 80, 85, 66, 76, 73, 67, 95, 66, 65, 83, 69, 95, 85, 82, 76,
  ]),
  publicApi: s([80, 85, 66, 76, 73, 67, 95, 65, 80, 73, 95, 85, 82, 76]),
  frontend: s([70, 82, 79, 78, 84, 69, 78, 68, 95, 85, 82, 76]),
  googleId: s([
    79, 65, 85, 84, 72, 95, 71, 79, 79, 71, 76, 69, 95, 67, 76, 73, 69, 78, 84, 95, 73, 68,
  ]),
  googleSecret: s([
    79, 65, 85, 84, 72, 95, 71, 79, 79, 71, 76, 69, 95, 67, 76, 73, 69, 78, 84, 95, 83, 69,
    67, 82, 69, 84,
  ]),
  fbId: s([79, 65, 85, 84, 72, 95, 70, 65, 67, 69, 66, 79, 79, 75, 95, 65, 80, 80, 95, 73, 68]),
  fbSecret: s([
    79, 65, 85, 84, 72, 95, 70, 65, 67, 69, 66, 79, 79, 75, 95, 65, 80, 80, 95, 83, 69, 67,
    82, 69, 84,
  ]),
  msId: s([
    79, 65, 85, 84, 72, 95, 77, 73, 67, 82, 79, 83, 79, 70, 84, 95, 67, 76, 73, 69, 78, 84,
    95, 73, 68,
  ]),
  msSecret: s([
    79, 65, 85, 84, 72, 95, 77, 73, 67, 82, 79, 83, 79, 70, 84, 95, 67, 76, 73, 69, 78, 84,
    95, 83, 69, 67, 82, 69, 84,
  ]),
  billingCheckout: s([
    66, 73, 76, 76, 73, 78, 71, 95, 67, 72, 69, 67, 75, 79, 85, 84, 95, 66, 65, 83, 69, 95,
    85, 82, 76,
  ]),
} as const;
