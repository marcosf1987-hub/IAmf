import { useEffect, useId, useRef, useState } from "react";
import { useAppDiscipline, type AppDiscipline } from "../contexts/AppDisciplineContext";
import { useEscapeKey } from "../hooks/useEscapeKey";

function Chevron({ open }: { open: boolean }) {
  return (
    <span className="discipline-switcher-chevron" aria-hidden>
      {open ? "▲" : "▼"}
    </span>
  );
}

/** Pelota fútbol: círculo + pentágono central + costuras (trazo `currentColor`, identidad del header). */
function IconSoccerBall() {
  return (
    <svg className="discipline-switcher-svg" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 7.4l2.85 2.07 1.09 3.43-2.91 1.78h-3.06l-2.91-1.78 1.09-3.43z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M12 7.4v-1.9M14.85 9.47l1.95 1M9.15 9.47l-1.95 1M9.19 14.53l1.9-0.95M14.81 14.53l-1.9-0.95"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Bandera a cuadros + mástil; claros con `currentColor` a menor opacidad (monocromo, tema-safe). */
function IconCheckeredFlag() {
  const clipId = useId().replace(/:/g, "");
  const cols = 5;
  const rows = 3;
  const fx = 6;
  const fy = 5;
  const fw = 14;
  const fh = 10;
  const cw = fw / cols;
  const rh = fh / rows;
  const cells: JSX.Element[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={fx + col * cw}
          y={fy + row * rh}
          width={cw + 0.02}
          height={rh + 0.02}
          fill="currentColor"
          opacity={(row + col) % 2 === 0 ? 1 : 0.28}
        />
      );
    }
  }
  return (
    <svg className="discipline-switcher-svg" viewBox="0 0 24 24" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect x={fx} y={fy} width={fw} height={fh} rx="0.75" />
        </clipPath>
      </defs>
      <path
        d="M 4.25 3.5 L 4.25 20.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <g clipPath={`url(#${clipId})`}>{cells}</g>
      <rect
        x={fx}
        y={fy}
        width={fw}
        height={fh}
        rx="0.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function DisciplineGlyph({ kind }: { kind: "football" | "f1" }) {
  return kind === "f1" ? <IconCheckeredFlag /> : <IconSoccerBall />;
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
          <DisciplineGlyph kind={discipline === "f1" ? "f1" : "football"} />
        </span>
        <span className="discipline-switcher-label">{label}</span>
        <Chevron open={open} />
      </button>
      {open ? (
        <ul className="discipline-switcher-menu" role="listbox">
          <li role="option" aria-selected={discipline === "football"}>
            <button type="button" className="discipline-switcher-option" onClick={() => pick("football")}>
              <DisciplineGlyph kind="football" />
              <span>Mundial 2026</span>
            </button>
          </li>
          <li role="option" aria-selected={discipline === "f1"}>
            <button type="button" className="discipline-switcher-option" onClick={() => pick("f1")}>
              <DisciplineGlyph kind="f1" />
              <span>Fórmula 1</span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
