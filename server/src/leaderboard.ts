import crypto from "crypto";

export function anonymizeUserId(userId: string, companyId: string): string {
  const hash = crypto.createHash("sha256").update(`${userId}-${companyId}`).digest("hex");
  const num = parseInt(hash.slice(0, 8), 16) % 10000;
  return `Empleado #${num.toString().padStart(4, "0")}`;
}

export function isExactHit(
  scoreA: number,
  scoreB: number,
  resultA: number | null,
  resultB: number | null
): boolean {
  if (resultA == null || resultB == null) return false;
  return scoreA === resultA && scoreB === resultB;
}
