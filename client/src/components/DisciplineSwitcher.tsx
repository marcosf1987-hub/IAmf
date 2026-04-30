import { useEffect, useRef, useState } from "react";
import { useAppDiscipline, type AppDiscipline } from "../contexts/AppDisciplineContext";
import { useEscapeKey } from "../hooks/useEscapeKey";

function Chevron({ open }: { open: boolean }) {
  return (
    <span className="discipline-switcher-chevron" aria-hidden>
      {open ? "▲" : "▼"}
    </span>
  );
}

export default function DisciplineSwitcher() {
  const { discipline, setDiscipline } = useAppDiscipline();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(d: AppDiscipline) {
    setOpen(false);
    if (d === discipline) return;
    setDiscipline(d, { navigateToHub: true });
  }

  const label = discipline === "f1" ? "Fórmula 1" : "Mundial 2026";

  return (
    <div className="discipline-switcher" ref={rootRef}>
      <button
        type="button"
        className="discipline-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Disciplina activa: ${label}. Cambiar`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="discipline-switcher-icon" aria-hidden>
          {discipline === "f1" ? <IconF1Steering /> : <IconFootballClassic />}
        </span>
        <span className="discipline-switcher-label">{label}</span>
        <Chevron open={open} />
      </button>
      {open ? (
        <ul className="discipline-switcher-menu" role="listbox">
          <li role="option" aria-selected={discipline === "football"}>
            <button type="button" className="discipline-switcher-option" onClick={() => pick("football")}>
              <IconFootballClassic />
              <span>Mundial 2026</span>
            </button>
          </li>
          <li role="option" aria-selected={discipline === "f1"}>
            <button type="button" className="discipline-switcher-option" onClick={() => pick("f1")}>
              <IconF1Steering />
              <span>Fórmula 1</span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** Pelota clásica (pentágono + hexágonos) — distinta del volante F1. */
function IconFootballClassic() {
  return (
    <svg className="discipline-switcher-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" strokeWidth="1.6" />
      <path
        d="M12 5.2l1.9 1.4 2.3-.2 1 2.1 2.1.8-.6 2.2.6 2.2-2.1.8-1 2.1-2.3-.2L12 18.8l-1.9-1.4-2.3.2-1-2.1-2.1-.8.6-2.2-.6-2.2 2.1-.8 1-2.1 2.3.2z"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M12 5.2v2.2M7.1 8.6l1.9 1M16.9 8.6l-1.9 1M6.2 13.4h2.2M15.6 13.4h2.2M9 17.4l1.9-1M15 17.4l-1.9-1" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/** Volante con aro grueso y radios — lectura clara a tamaño pequeño. */
function IconF1Steering() {
  return (
    <svg className="discipline-switcher-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <ellipse cx="12" cy="12" rx="9" ry="7.2" strokeWidth="1.75" />
      <ellipse cx="12" cy="12" rx="5.5" ry="4.2" strokeWidth="1.35" />
      <circle cx="12" cy="12" r="1.85" fill="currentColor" stroke="none" />
      <path
        d="M12 4.8v2.2M12 17v2.2M4.8 12h2.2M17 12h2.2M6.6 6.6l1.55 1.55M15.85 15.85l1.55 1.55M6.6 17.4l1.55-1.55M15.85 8.15l1.55-1.55"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
