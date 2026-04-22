import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/password";
import { MATCHES_SEED } from "../src/matches-seed-data";
import { ensureUniversalLeagueMembership } from "../src/universal-league";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "DemoCompany", slug: "demo", seatLimit: 100 },
  });

  const platformCompany = await prisma.company.upsert({
    where: { slug: "platform-internal" },
    update: {},
    create: { name: "Plataforma", slug: "platform-internal", seatLimit: 99999 },
  });

  await prisma.companyConfig.upsert({
    where: { companyId: platformCompany.id },
    update: { anonymizationEnabled: false },
    create: { companyId: platformCompany.id, anonymizationEnabled: false },
  });

  const email = "admin@demo.com";
  const passwordHash = await hashPassword("Admin1234");

  await prisma.user.upsert({
    where: { email },
    update: {
      role: UserRole.org_admin,
      status: UserStatus.active,
      companyId: company.id,
    },
    create: {
      email,
      passwordHash,
      fullName: "Admin Demo",
      role: UserRole.org_admin,
      status: UserStatus.active,
      companyId: company.id,
    },
  });

  const superEmail = process.env.PLATFORM_SUPER_ADMIN_EMAIL?.trim();
  if (superEmail) {
    const superPass = process.env.PLATFORM_SUPER_ADMIN_PASSWORD?.trim() || "ChangeMe123!";
    const superHash = await hashPassword(superPass);
    await prisma.user.upsert({
      where: { email: superEmail },
      update: {
        role: UserRole.super_admin,
        status: UserStatus.active,
        companyId: platformCompany.id,
      },
      create: {
        email: superEmail,
        passwordHash: superHash,
        fullName: "Super administrador",
        role: UserRole.super_admin,
        status: UserStatus.active,
        companyId: platformCompany.id,
      },
    });
    const superUser = await prisma.user.findUnique({
      where: { email: superEmail },
      select: { id: true, companyId: true },
    });
    if (superUser?.companyId === platformCompany.id) {
      await ensureUniversalLeagueMembership(prisma, superUser.id);
    }
  }

  const replaceMatches = process.env.REPLACE_MATCHES === "true";
  const matchCount = await prisma.match.count();

  if (matchCount === 0 || replaceMatches) {
    if (replaceMatches) {
      await prisma.match.deleteMany({});
    }
    await prisma.match.createMany({ data: MATCHES_SEED });
  }

  // Actualizar groupCode en partidos ya guardados (BD vieja sin letra de grupo, p. ej. solo Grupo D faltante).
  for (const m of MATCHES_SEED) {
    if (m.stage !== "group") continue;
    if (!("groupCode" in m) || !m.groupCode) continue;
    await prisma.match.updateMany({
      where: {
        stage: "group",
        teamA: m.teamA,
        teamB: m.teamB,
        kickoffAt: m.kickoffAt,
      },
      data: { groupCode: m.groupCode },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    // eslint-disable-next-line no-console
    console.log("Seed complete");
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
