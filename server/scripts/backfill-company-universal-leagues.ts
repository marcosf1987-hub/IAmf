/**
 * Crea ligas universales faltantes en empresas B2B existentes y sincroniza miembros activos.
 *
 * Uso (desde carpeta server, con DATABASE_URL en .env):
 *   npx tsx scripts/backfill-company-universal-leagues.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { backfillAllCompanyUniversalLeagues } from "../src/universal-league";

async function main() {
  const prisma = new PrismaClient();
  try {
    const r = await backfillAllCompanyUniversalLeagues(prisma);
    // eslint-disable-next-line no-console
    console.log(`Listo. ${r.companies} empresa(s), ${r.users} usuario(s) sincronizados.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
