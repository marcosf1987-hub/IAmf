import { NavLink, Outlet } from "react-router-dom";

function subNavClass({ isActive }: { isActive: boolean }): string {
  return `f1-subnav-link${isActive ? " f1-subnav-link--current" : ""}`;
}

export default function F1Layout() {
  return (
    <div className="page-content page-content--f1 f1-section">
      <header className="f1-section-header">
        <h1 className="f1-section-title">Fórmula 1</h1>
        <p className="f1-section-lead">
          Predicciones, laboratorio de prompts por gran premio y resultados. Cambiá de disciplina cuando quieras con
          el selector junto al logo.
        </p>
      </header>
      <nav className="f1-subnav" aria-label="Secciones F1">
        <NavLink to="/app/f1" end className={subNavClass}>
          Inicio F1
        </NavLink>
        <NavLink to="/app/f1/predicciones" className={subNavClass}>
          Predicciones
        </NavLink>
        <NavLink to="/app/f1/laboratorio" className={subNavClass}>
          Laboratorio
        </NavLink>
        <NavLink to="/app/f1/resultados" className={subNavClass}>
          Resultados
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
