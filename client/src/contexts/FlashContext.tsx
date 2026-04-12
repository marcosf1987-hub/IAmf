import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Variant = "error" | "success" | "info";

type FlashState = { message: string; variant: Variant; id: number } | null;

const FlashContext = createContext<{
  showFlash: (message: string, variant?: Variant) => void;
  hideFlash: () => void;
} | null>(null);

const AUTO_MS = 6500;

export function FlashProvider({ children }: { children: ReactNode }) {
  const [flash, setFlash] = useState<FlashState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideFlash = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setFlash(null);
  }, []);

  const showFlash = useCallback(
    (message: string, variant: Variant = "info") => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const id = Date.now();
      setFlash({ message, variant, id });
      timerRef.current = setTimeout(() => {
        setFlash((f) => (f?.id === id ? null : f));
        timerRef.current = null;
      }, AUTO_MS);
    },
    []
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <FlashContext.Provider value={{ showFlash, hideFlash }}>
      {children}
      {flash && (
        <div
          className={`flash-banner flash-banner--${flash.variant}`}
          role="status"
          aria-live="polite"
        >
          <p className="flash-banner-text">{flash.message}</p>
          <button type="button" className="flash-banner-close" onClick={hideFlash} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}
    </FlashContext.Provider>
  );
}

export function useFlash(): { showFlash: (message: string, variant?: Variant) => void; hideFlash: () => void } {
  const ctx = useContext(FlashContext);
  if (!ctx) {
    throw new Error("useFlash debe usarse dentro de FlashProvider");
  }
  return ctx;
}
