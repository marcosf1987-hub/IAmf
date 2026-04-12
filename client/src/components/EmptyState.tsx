import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  /** Un solo CTA principal (botón o enlace) */
  action?: ReactNode;
};

/**
 * Patrón transversal para estados vacíos: título + texto opcional + una acción principal.
 */
export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="empty-state" role="status">
      <h3 className="empty-state-title">{title}</h3>
      {description ? <p className="empty-state-desc">{description}</p> : null}
      {action ? <div className="empty-state-actions">{action}</div> : null}
    </div>
  );
}
