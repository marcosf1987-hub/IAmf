import type { PrismaClient } from "@prisma/client";
import { buildOrgSeatSnapshot } from "./org-seat";

export async function buildMeResponse(prisma: PrismaClient, userId: string) {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      companyId: true,
      createdAt: true,
      company: { select: { id: true, name: true, slug: true, seatLimit: true } },
    },
  });
  if (!row) return null;
  const billingBase = process.env.BILLING_CHECKOUT_BASE_URL?.trim();
  const usage = await buildOrgSeatSnapshot(
    prisma,
    row.companyId,
    billingBase && billingBase.length > 0 ? billingBase : null
  );
  const { company, ...user } = row;
  return { user, company, usage };
}
