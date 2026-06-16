import type { PrismaClient } from "@prisma/client";

export async function recordUserSession(
  prisma: PrismaClient,
  userId: string,
  meta?: { ip?: string; userAgent?: string | null }
): Promise<void> {
  await prisma.loginEvent.create({
    data: {
      userId,
      ip: meta?.ip,
      userAgent: meta?.userAgent ?? null,
    },
  });
}
