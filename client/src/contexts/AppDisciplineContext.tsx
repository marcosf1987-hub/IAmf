import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type AppDiscipline = "football" | "f1";

const STORAGE_DISCIPLINE = "promptplay_discipline";
const STORAGE_PICKER_DAY = "promptplay_last_context_picker_day";

export function getTodayPickerKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function hasShownContextPickerToday(): boolean {
  return localStorage.getItem(STORAGE_PICKER_DAY) === getTodayPickerKey();
}

export function markContextPickerShownToday(): void {
  localStorage.setItem(STORAGE_PICKER_DAY, getTodayPickerKey());
}

function readStoredDiscipline(): AppDiscipline {
  return localStorage.getItem(STORAGE_DISCIPLINE) === "f1" ? "f1" : "football";
}

function writeDiscipline(d: AppDiscipline): void {
  localStorage.setItem(STORAGE_DISCIPLINE, d);
}

function applyDisciplineTheme(d: AppDiscipline): void {
  document.documentElement.dataset.appDiscipline = d;
}

type AppDisciplineContextValue = {
  discipline: AppDiscipline;
  /** Persiste y aplica tema. Si `navigateToHub`, va a `/app` o `/app/f1`. */
  setDiscipline: (d: AppDiscipline, options?: { navigateToHub?: boolean }) => void;
};

const AppDisciplineContext = createContext<AppDisciplineContextValue | null>(null);

export function AppDisciplineProvider({ children }: { children: ReactNode }) {
  const [discipline, setDisciplineState] = useState<AppDiscipline>(readStoredDiscipline);
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    applyDisciplineTheme(discipline);
  }, [discipline]);

  /**
   * Rutas bajo `/app/f1` (incl. `/app/f1/ligas`) fuerzan F1. Otras `/app/*` (p. ej. `/app/ligas`, `/app/prode`)
   * fuerzan fútbol. En `/app` o `/app/` no pisamos la preferencia guardada.
   */
  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith("/app/contexto")) return;
    if (p.startsWith("/app/f1")) {
      setDisciplineState((prev) => {
        if (prev !== "f1") {
          writeDiscipline("f1");
          return "f1";
        }
        return prev;
      });
      return;
    }
    if (p === "/app" || p === "/app/") return;
    if (p.startsWith("/app")) {
      setDisciplineState((prev) => {
        if (prev !== "football") {
          writeDiscipline("football");
          return "football";
        }
        return prev;
      });
    }
  }, [location.pathname]);

  const setDiscipline = useCallback(
    (d: AppDiscipline, options?: { navigateToHub?: boolean }) => {
      writeDiscipline(d);
      setDisciplineState(d);
      applyDisciplineTheme(d);
      if (options?.navigateToHub === true) {
        navigate(d === "f1" ? "/app/f1" : "/app", { replace: false });
      }
    },
    [navigate]
  );

  const value = useMemo(() => ({ discipline, setDiscipline }), [discipline, setDiscipline]);

  return <AppDisciplineContext.Provider value={value}>{children}</AppDisciplineContext.Provider>;
}

export function useAppDiscipline(): AppDisciplineContextValue {
  const ctx = useContext(AppDisciplineContext);
  if (!ctx) throw new Error("useAppDiscipline debe usarse dentro de AppDisciplineProvider");
  return ctx;
}
