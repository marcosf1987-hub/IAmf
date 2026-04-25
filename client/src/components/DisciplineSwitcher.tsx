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
          {discipline === "f1" ? <IconF1Wheel /> : <IconFootball />}
        </span>
        <span className="discipline-switcher-label">{label}</span>
        <Chevron open={open} />
      </button>
      {open ? (
        <ul className="discipline-switcher-menu" role="listbox">
          <li role="option" aria-selected={discipline === "football"}>
            <button type="button" className="discipline-switcher-option" onClick={() => pick("football")}>
              <IconFootball />
              <span>Mundial 2026</span>
            </button>
          </li>
          <li role="option" aria-selected={discipline === "f1"}>
            <button type="button" className="discipline-switcher-option" onClick={() => pick("f1")}>
              <IconF1Wheel />
              <span>Fórmula 1</span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function IconFootball() {
  return (
    <svg className="discipline-switcher-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 5.5l2.2 2.2M16.3 16.3l2.2 2.2M5.5 18.5l2.2-2.2M16.3 7.7l2.2-2.2" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconF1Wheel() {
  return (
    <svg className="discipline-switcher-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="2.5" strokeWidth="1.5" />
      <path
        d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}
