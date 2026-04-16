/**
 * One-off: usuarios `member` (y `super_admin` si hubiera) que quedaron en la empresa `demo`
 * (p. ej. OAuth antes del cambio a platform-internal) se mueven a `platform-internal`
 * y entran en la liga universal.
 *
 * Solo mueve `member`. No mueve `org_admin` de demo (p. ej. admin@demo.com del seed).
 *
 * Uso (desde carpeta server, con DATABASE_URL en .env):
 *   npx tsx scripts/migrate-demo-users-to-public-pool.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ensureUniversalLeagueMembership } from "../src/universal-league";

async function main() {
  const prisma = new PrismaClient();
  try {
    const [demo, platform] = await Promise.all([
      prisma.company.findUnique({ where: { slug: "demo" }, select: { id: true } }),
      prisma.company.findUnique({ where: { slug: "platform-internal" }, select: { id: true } }),
    ]);
    if (!platform) {
      // eslint-disable-next-line no-console
      console.error("No existe company slug platform-internal. Ejecutá prisma db seed.");
      process.exit(1);
    }
    if (!demo) {
      // eslint-disable-next-line no-console
      console.log("No hay empresa demo; nada que migrar.");
      return;
    }
    if (demo.id === platform.id) {
      // eslint-disable-next-line no-console
      console.log("demo y platform-internal son la misma fila; nada que migrar.");
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        companyId: demo.id,
        role: "member",
        status: "active",
      },
      select: { id: true, email: true, role: true },
    });

    if (users.length === 0) {
      // eslint-disable-next-line no-console
      console.log("No hay usuarios member en demo para migrar.");
      return;
    }

    let ok = 0;
    for (const u of users) {
      await prisma.user.update({
        where: { id: u.id },
        data: { companyId: platform.id },
      });
      try {
        await ensureUniversalLeagueMembership(prisma, u.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`Liga universal falló para ${u.email}:`, e);
      }
      ok += 1;
      // eslint-disable-next-line no-console
      console.log(`Migrado: ${u.email} (${u.role})`);
    }

    // eslint-disable-next-line no-console
    console.log(`Listo. ${ok} usuario(s) movidos a platform-internal.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
