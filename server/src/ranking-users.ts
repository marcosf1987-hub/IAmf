import type { Prisma } from "@prisma/client";

/** Usuarios que deben figurar en tablas de ranking (activos y no ocultos por super admin). */
export function rankingVisibleUserWhere(extra?: Prisma.UserWhereInput): Prisma.UserWhereInput {
  return {
    status: "active",
    hiddenFromRankings: false,
    ...extra,
  };
}
