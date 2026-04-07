import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/password";

const prisma = new PrismaClient();

/**
 * Partidos oficiales FIFA World Cup 2026 (Canadá/México/USA)
 * Fuente: https://www.fifa.com/es/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures
 * Horarios en UTC (ET+4 en junio)
 */
const MATCHES_SEED = [
  // Group A
  { stage: "group" as const, groupCode: "A", teamA: "Mexico", teamB: "South Africa", kickoffAt: new Date("2026-06-11T19:00:00Z") },
  { stage: "group" as const, groupCode: "A", teamA: "South Korea", teamB: "TBD", kickoffAt: new Date("2026-06-12T02:00:00Z") },
  { stage: "group" as const, groupCode: "A", teamA: "TBD", teamB: "South Africa", kickoffAt: new Date("2026-06-18T16:00:00Z") },
  { stage: "group" as const, groupCode: "A", teamA: "Mexico", teamB: "South Korea", kickoffAt: new Date("2026-06-19T01:00:00Z") },
  { stage: "group" as const, groupCode: "A", teamA: "TBD", teamB: "Mexico", kickoffAt: new Date("2026-06-25T01:00:00Z") },
  { stage: "group" as const, groupCode: "A", teamA: "South Africa", teamB: "South Korea", kickoffAt: new Date("2026-06-25T01:00:00Z") },
  // Group B
  { stage: "group" as const, groupCode: "B", teamA: "Canada", teamB: "TBD", kickoffAt: new Date("2026-06-12T19:00:00Z") },
  { stage: "group" as const, groupCode: "B", teamA: "Qatar", teamB: "Switzerland", kickoffAt: new Date("2026-06-13T19:00:00Z") },
  { stage: "group" as const, groupCode: "B", teamA: "TBD", teamB: "Switzerland", kickoffAt: new Date("2026-06-18T19:00:00Z") },
  { stage: "group" as const, groupCode: "B", teamA: "Canada", teamB: "Qatar", kickoffAt: new Date("2026-06-18T22:00:00Z") },
  { stage: "group" as const, groupCode: "B", teamA: "Switzerland", teamB: "Canada", kickoffAt: new Date("2026-06-24T19:00:00Z") },
  { stage: "group" as const, groupCode: "B", teamA: "TBD", teamB: "Qatar", kickoffAt: new Date("2026-06-24T19:00:00Z") },
  // Group C
  { stage: "group" as const, groupCode: "C", teamA: "Brazil", teamB: "Morocco", kickoffAt: new Date("2026-06-13T22:00:00Z") },
  { stage: "group" as const, groupCode: "C", teamA: "Haiti", teamB: "Scotland", kickoffAt: new Date("2026-06-14T01:00:00Z") },
  { stage: "group" as const, groupCode: "C", teamA: "Scotland", teamB: "Morocco", kickoffAt: new Date("2026-06-19T22:00:00Z") },
  { stage: "group" as const, groupCode: "C", teamA: "Brazil", teamB: "Haiti", kickoffAt: new Date("2026-06-20T01:00:00Z") },
  { stage: "group" as const, groupCode: "C", teamA: "Scotland", teamB: "Brazil", kickoffAt: new Date("2026-06-24T22:00:00Z") },
  { stage: "group" as const, groupCode: "C", teamA: "Morocco", teamB: "Haiti", kickoffAt: new Date("2026-06-24T22:00:00Z") },
  // Group D
  { stage: "group" as const, groupCode: "D", teamA: "United States", teamB: "Paraguay", kickoffAt: new Date("2026-06-13T01:00:00Z") },
  { stage: "group" as const, groupCode: "D", teamA: "Australia", teamB: "TBD", kickoffAt: new Date("2026-06-13T04:00:00Z") },
  { stage: "group" as const, groupCode: "D", teamA: "United States", teamB: "Australia", kickoffAt: new Date("2026-06-19T19:00:00Z") },
  { stage: "group" as const, groupCode: "D", teamA: "TBD", teamB: "Paraguay", kickoffAt: new Date("2026-06-20T04:00:00Z") },
  { stage: "group" as const, groupCode: "D", teamA: "TBD", teamB: "United States", kickoffAt: new Date("2026-06-26T02:00:00Z") },
  { stage: "group" as const, groupCode: "D", teamA: "Paraguay", teamB: "Australia", kickoffAt: new Date("2026-06-26T02:00:00Z") },
  // Group E
  { stage: "group" as const, groupCode: "E", teamA: "Germany", teamB: "Curacao", kickoffAt: new Date("2026-06-14T17:00:00Z") },
  { stage: "group" as const, groupCode: "E", teamA: "Ivory Coast", teamB: "Ecuador", kickoffAt: new Date("2026-06-14T23:00:00Z") },
  { stage: "group" as const, groupCode: "E", teamA: "Germany", teamB: "Ivory Coast", kickoffAt: new Date("2026-06-20T20:00:00Z") },
  { stage: "group" as const, groupCode: "E", teamA: "Ecuador", teamB: "Curacao", kickoffAt: new Date("2026-06-21T00:00:00Z") },
  { stage: "group" as const, groupCode: "E", teamA: "Ecuador", teamB: "Germany", kickoffAt: new Date("2026-06-25T20:00:00Z") },
  { stage: "group" as const, groupCode: "E", teamA: "Curacao", teamB: "Ivory Coast", kickoffAt: new Date("2026-06-25T20:00:00Z") },
  // Group F
  { stage: "group" as const, groupCode: "F", teamA: "Netherlands", teamB: "Japan", kickoffAt: new Date("2026-06-14T20:00:00Z") },
  { stage: "group" as const, groupCode: "F", teamA: "TBD", teamB: "Tunisia", kickoffAt: new Date("2026-06-15T02:00:00Z") },
  { stage: "group" as const, groupCode: "F", teamA: "Netherlands", teamB: "TBD", kickoffAt: new Date("2026-06-20T17:00:00Z") },
  { stage: "group" as const, groupCode: "F", teamA: "Tunisia", teamB: "Japan", kickoffAt: new Date("2026-06-21T04:00:00Z") },
  { stage: "group" as const, groupCode: "F", teamA: "Tunisia", teamB: "Netherlands", kickoffAt: new Date("2026-06-25T23:00:00Z") },
  { stage: "group" as const, groupCode: "F", teamA: "Japan", teamB: "TBD", kickoffAt: new Date("2026-06-25T23:00:00Z") },
  // Group G
  { stage: "group" as const, groupCode: "G", teamA: "Belgium", teamB: "Egypt", kickoffAt: new Date("2026-06-15T19:00:00Z") },
  { stage: "group" as const, groupCode: "G", teamA: "Iran", teamB: "New Zealand", kickoffAt: new Date("2026-06-16T01:00:00Z") },
  { stage: "group" as const, groupCode: "G", teamA: "Belgium", teamB: "Iran", kickoffAt: new Date("2026-06-21T19:00:00Z") },
  { stage: "group" as const, groupCode: "G", teamA: "New Zealand", teamB: "Egypt", kickoffAt: new Date("2026-06-22T01:00:00Z") },
  { stage: "group" as const, groupCode: "G", teamA: "New Zealand", teamB: "Belgium", kickoffAt: new Date("2026-06-27T03:00:00Z") },
  { stage: "group" as const, groupCode: "G", teamA: "Egypt", teamB: "Iran", kickoffAt: new Date("2026-06-27T03:00:00Z") },
  // Group H
  { stage: "group" as const, groupCode: "H", teamA: "Spain", teamB: "Cape Verde", kickoffAt: new Date("2026-06-15T16:00:00Z") },
  { stage: "group" as const, groupCode: "H", teamA: "Saudi Arabia", teamB: "Uruguay", kickoffAt: new Date("2026-06-15T22:00:00Z") },
  { stage: "group" as const, groupCode: "H", teamA: "Spain", teamB: "Saudi Arabia", kickoffAt: new Date("2026-06-21T16:00:00Z") },
  { stage: "group" as const, groupCode: "H", teamA: "Uruguay", teamB: "Cape Verde", kickoffAt: new Date("2026-06-21T22:00:00Z") },
  { stage: "group" as const, groupCode: "H", teamA: "Uruguay", teamB: "Spain", kickoffAt: new Date("2026-06-27T00:00:00Z") },
  { stage: "group" as const, groupCode: "H", teamA: "Cape Verde", teamB: "Saudi Arabia", kickoffAt: new Date("2026-06-27T00:00:00Z") },
  // Group I
  { stage: "group" as const, groupCode: "I", teamA: "France", teamB: "Senegal", kickoffAt: new Date("2026-06-16T19:00:00Z") },
  { stage: "group" as const, groupCode: "I", teamA: "TBD", teamB: "Norway", kickoffAt: new Date("2026-06-16T22:00:00Z") },
  { stage: "group" as const, groupCode: "I", teamA: "France", teamB: "TBD", kickoffAt: new Date("2026-06-22T21:00:00Z") },
  { stage: "group" as const, groupCode: "I", teamA: "Norway", teamB: "Senegal", kickoffAt: new Date("2026-06-23T00:00:00Z") },
  { stage: "group" as const, groupCode: "I", teamA: "Norway", teamB: "France", kickoffAt: new Date("2026-06-26T19:00:00Z") },
  { stage: "group" as const, groupCode: "I", teamA: "Senegal", teamB: "TBD", kickoffAt: new Date("2026-06-26T19:00:00Z") },
  // Group J
  { stage: "group" as const, groupCode: "J", teamA: "Argentina", teamB: "Algeria", kickoffAt: new Date("2026-06-17T01:00:00Z") },
  { stage: "group" as const, groupCode: "J", teamA: "Austria", teamB: "Jordan", kickoffAt: new Date("2026-06-17T04:00:00Z") },
  { stage: "group" as const, groupCode: "J", teamA: "Argentina", teamB: "Austria", kickoffAt: new Date("2026-06-22T17:00:00Z") },
  { stage: "group" as const, groupCode: "J", teamA: "Jordan", teamB: "Algeria", kickoffAt: new Date("2026-06-23T03:00:00Z") },
  { stage: "group" as const, groupCode: "J", teamA: "Jordan", teamB: "Argentina", kickoffAt: new Date("2026-06-28T02:00:00Z") },
  { stage: "group" as const, groupCode: "J", teamA: "Algeria", teamB: "Austria", kickoffAt: new Date("2026-06-28T02:00:00Z") },
  // Group K
  { stage: "group" as const, groupCode: "K", teamA: "Portugal", teamB: "TBD", kickoffAt: new Date("2026-06-17T17:00:00Z") },
  { stage: "group" as const, groupCode: "K", teamA: "Uzbekistan", teamB: "Colombia", kickoffAt: new Date("2026-06-18T02:00:00Z") },
  { stage: "group" as const, groupCode: "K", teamA: "Portugal", teamB: "Uzbekistan", kickoffAt: new Date("2026-06-23T17:00:00Z") },
  { stage: "group" as const, groupCode: "K", teamA: "Colombia", teamB: "TBD", kickoffAt: new Date("2026-06-24T02:00:00Z") },
  { stage: "group" as const, groupCode: "K", teamA: "Colombia", teamB: "Portugal", kickoffAt: new Date("2026-06-27T23:30:00Z") },
  { stage: "group" as const, groupCode: "K", teamA: "TBD", teamB: "Uzbekistan", kickoffAt: new Date("2026-06-27T23:30:00Z") },
  // Group L
  { stage: "group" as const, groupCode: "L", teamA: "England", teamB: "Croatia", kickoffAt: new Date("2026-06-17T20:00:00Z") },
  { stage: "group" as const, groupCode: "L", teamA: "Ghana", teamB: "Panama", kickoffAt: new Date("2026-06-17T23:00:00Z") },
  { stage: "group" as const, groupCode: "L", teamA: "England", teamB: "Ghana", kickoffAt: new Date("2026-06-23T20:00:00Z") },
  { stage: "group" as const, groupCode: "L", teamA: "Panama", teamB: "Croatia", kickoffAt: new Date("2026-06-23T23:00:00Z") },
  { stage: "group" as const, groupCode: "L", teamA: "Panama", teamB: "England", kickoffAt: new Date("2026-06-27T21:00:00Z") },
  { stage: "group" as const, groupCode: "L", teamA: "Croatia", teamB: "Ghana", kickoffAt: new Date("2026-06-27T21:00:00Z") },
  // Round of 32 (placeholders: 1A=1º grupo A, 2B=2º grupo B, 3C=mejor 3º grupo C, etc.)
  { stage: "roundOf32" as const, teamA: "1A", teamB: "2B", kickoffAt: new Date("2026-06-28T19:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1C", teamB: "3D", kickoffAt: new Date("2026-06-28T23:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1E", teamB: "3F", kickoffAt: new Date("2026-06-29T19:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1G", teamB: "2H", kickoffAt: new Date("2026-06-29T23:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1B", teamB: "2A", kickoffAt: new Date("2026-06-30T19:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1D", teamB: "3E", kickoffAt: new Date("2026-06-30T23:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1F", teamB: "2G", kickoffAt: new Date("2026-07-01T19:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1H", teamB: "3A", kickoffAt: new Date("2026-07-01T23:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1I", teamB: "2J", kickoffAt: new Date("2026-07-02T19:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1K", teamB: "3L", kickoffAt: new Date("2026-06-28T03:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1J", teamB: "2I", kickoffAt: new Date("2026-07-02T23:00:00Z") },
  { stage: "roundOf32" as const, teamA: "1L", teamB: "3B", kickoffAt: new Date("2026-07-03T03:00:00Z") },
  { stage: "roundOf32" as const, teamA: "2C", teamB: "3G", kickoffAt: new Date("2026-07-03T19:00:00Z") },
  { stage: "roundOf32" as const, teamA: "2E", teamB: "3H", kickoffAt: new Date("2026-07-03T23:00:00Z") },
  { stage: "roundOf32" as const, teamA: "2K", teamB: "3I", kickoffAt: new Date("2026-07-04T03:00:00Z") },
  { stage: "roundOf32" as const, teamA: "2L", teamB: "3J", kickoffAt: new Date("2026-07-04T19:00:00Z") },
  // Round of 16
  { stage: "roundOf16" as const, teamA: "R32-1", teamB: "R32-2", kickoffAt: new Date("2026-07-04T23:00:00Z") },
  { stage: "roundOf16" as const, teamA: "R32-3", teamB: "R32-4", kickoffAt: new Date("2026-07-05T19:00:00Z") },
  { stage: "roundOf16" as const, teamA: "R32-5", teamB: "R32-6", kickoffAt: new Date("2026-07-05T23:00:00Z") },
  { stage: "roundOf16" as const, teamA: "R32-7", teamB: "R32-8", kickoffAt: new Date("2026-07-06T19:00:00Z") },
  { stage: "roundOf16" as const, teamA: "R32-9", teamB: "R32-10", kickoffAt: new Date("2026-07-06T23:00:00Z") },
  { stage: "roundOf16" as const, teamA: "R32-11", teamB: "R32-12", kickoffAt: new Date("2026-07-07T19:00:00Z") },
  { stage: "roundOf16" as const, teamA: "R32-13", teamB: "R32-14", kickoffAt: new Date("2026-07-07T23:00:00Z") },
  { stage: "roundOf16" as const, teamA: "R32-15", teamB: "R32-16", kickoffAt: new Date("2026-07-08T19:00:00Z") },
  // Quarter finals
  { stage: "quarterFinal" as const, teamA: "R16-1", teamB: "R16-2", kickoffAt: new Date("2026-07-09T19:00:00Z") },
  { stage: "quarterFinal" as const, teamA: "R16-3", teamB: "R16-4", kickoffAt: new Date("2026-07-09T23:00:00Z") },
  { stage: "quarterFinal" as const, teamA: "R16-5", teamB: "R16-6", kickoffAt: new Date("2026-07-10T19:00:00Z") },
  { stage: "quarterFinal" as const, teamA: "R16-7", teamB: "R16-8", kickoffAt: new Date("2026-07-10T23:00:00Z") },
  // Semi finals
  { stage: "semiFinal" as const, teamA: "QF-1", teamB: "QF-2", kickoffAt: new Date("2026-07-14T19:00:00Z") },
  { stage: "semiFinal" as const, teamA: "QF-3", teamB: "QF-4", kickoffAt: new Date("2026-07-15T19:00:00Z") },
  // Third place
  { stage: "thirdPlace" as const, teamA: "SF-3", teamB: "SF-4", kickoffAt: new Date("2026-07-18T19:00:00Z") },
  // Final
  { stage: "final" as const, teamA: "SF-1", teamB: "SF-2", kickoffAt: new Date("2026-07-19T19:00:00Z") },
];

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
