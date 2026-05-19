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

/** Pelota (soccer) y bandera a cuadros: lectura inmediata junto al texto del selector. */
function DisciplineEmoji({ kind }: { kind: "football" | "f1" }) {
  return (
    <span className="discipline-switcher-emoji" aria-hidden>
      {kind === "f1" ? "\u{1F3C1}" : "\u26BD"}
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
          <DisciplineEmoji kind={discipline === "f1" ? "f1" : "football"} />
        </span>
        <span className="discipline-switcher-label">{label}</span>
        <Chevron open={open} />
      </button>
      {open ? (
        <ul className="discipline-switcher-menu" role="listbox">
          <li role="option" aria-selected={discipline === "football"}>
            <button type="button" className="discipline-switcher-option" onClick={() => pick("football")}>
              <DisciplineEmoji kind="football" />
              <span>Mundial 2026</span>
            </button>
          </li>
          <li role="option" aria-selected={discipline === "f1"}>
            <button type="button" className="discipline-switcher-option" onClick={() => pick("f1")}>
              <DisciplineEmoji kind="f1" />
              <span>Fórmula 1</span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
