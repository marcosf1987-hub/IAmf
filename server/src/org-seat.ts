import type { PrismaClient } from "@prisma/client";

const PLATFORM_SLUG = "platform-internal";

export function isPlatformCompanySlug(slug: string): boolean {
  return slug === PLATFORM_SLUG;
}

/** Usuarios que consumen cupo: admin de org + empleados activos (no super_admin de plataforma). */
export async function countActiveSeatUsers(prisma: PrismaClient, companyId: string): Promise<number> {
  return prisma.user.count({
    where: {
      companyId,
      status: "active",
      role: { in: ["org_admin", "member"] },
    },
  });
}

export async function countPendingInvites(prisma: PrismaClient, companyId: string): Promise<number> {
  const now = new Date();
  return prisma.invitation.count({
    where: {
      companyId,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
  });
}

export type OrgSeatSnapshot = {
  seatLimit: number;
  activeUsers: number;
  invitationsPending: number;
  invitationsAccepted: number;
  invitationsTotal: number;
  seatsRemaining: number;
  billingCheckoutUrl: string | null;
};

export async function buildOrgSeatSnapshot(
  prisma: PrismaClient,
  companyId: string,
  billingCheckoutBase: string | null
): Promise<OrgSeatSnapshot | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { slug: true, seatLimit: true },
  });
  if (!company) return null;

  if (isPlatformCompanySlug(company.slug)) {
    return {
      seatLimit: company.seatLimit,
      activeUsers: await countActiveSeatUsers(prisma, companyId),
      invitationsPending: 0,
      invitationsAccepted: 0,
      invitationsTotal: 0,
      seatsRemaining: 99999,
      billingCheckoutUrl: null,
    };
  }

  const [activeUsers, invitationsPending, invitationsAccepted, invitationsTotal] = await Promise.all([
    countActiveSeatUsers(prisma, companyId),
    countPendingInvites(prisma, companyId),
    prisma.invitation.count({ where: { companyId, acceptedAt: { not: null } } }),
    prisma.invitation.count({ where: { companyId } }),
  ]);

  const rawRemaining = company.seatLimit - activeUsers - invitationsPending;
  const seatsRemaining = Math.max(0, rawRemaining);

  const billingCheckoutUrl =
    billingCheckoutBase && billingCheckoutBase.length > 0
      ? `${billingCheckoutBase.replace(/\/+$/, "")}?seats=${company.seatLimit}&companyId=${encodeURIComponent(companyId)}`
      : null;

  return {
    seatLimit: company.seatLimit,
    activeUsers,
    invitationsPending,
    invitationsAccepted,
    invitationsTotal,
    seatsRemaining,
    billingCheckoutUrl,
  };
}
