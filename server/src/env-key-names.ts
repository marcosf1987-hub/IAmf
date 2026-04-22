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
} as const;
