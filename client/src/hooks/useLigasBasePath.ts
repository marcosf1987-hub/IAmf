import { useLocation } from "react-router-dom";

/**
 * Ligas usan el mismo API; la URL bajo `/app/f1/ligas` mantiene la disciplina F1
 * (ver `AppDisciplineContext` y `LigasFootballEntry`).
 */
export function useLigasBasePath(): string {
  const { pathname } = useLocation();
  return pathname.startsWith("/app/f1") ? "/app/f1/ligas" : "/app/ligas";
}

export function useIsF1AppShell(): boolean {
  return useLocation().pathname.startsWith("/app/f1");
}
