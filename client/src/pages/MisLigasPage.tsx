import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type {
  CompetitionDetailResponse,
  CompetitionQuota,
  MineCompetitionsResponse,
  MyCompetitionSummary,
} from "../lib/api";
import {
  createCompetition,
  fetchCompetitionDetail,
  fetchMyCompetitions,
  inviteToCompetition,
  leaveCompetition,
} from "../lib/api";

function parseEmails(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function canCreateMore(q: CompetitionQuota): boolean {
  if (q.scope === "user") {
    return q.maxCreatedByMe != null && q.createdByMe < q.maxCreatedByMe;
  }
  if (q.maxCompany == null) return true;
  return (q.companyTotal ?? 0) < q.maxCompany;
}

function quotaLabel(q: CompetitionQuota): string {
  if (q.scope === "user") {
    return `${q.createdByMe} de ${q.maxCreatedByMe ?? "—"} ligas creadas`;
  }
  if (q.maxCompany == null) {
    return `Competencias en la empresa: ${q.companyTotal ?? 0} (sin tope configurado)`;
  }
  return `Competencias en la empresa: ${q.companyTotal ?? 0} de ${q.maxCompany}`;
}

function maxMembersBounds(q: CompetitionQuota): { min: number; max: number } {
  if (q.scope === "user") return { min: 2, max: 10 };
  return { min: 2, max: 500 };
}

export default function MisLigasPage() {
  const { id } = useParams<{ id: string }>();
  if (id) {
    return <CompetitionDetailSection competitionId={id} />;
  }
  return <MisLigasListSection />;
}

function MisLigasListSection() {
  const [data, setData] = useState<MineCompetitionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchMyCompetitions();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las ligas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="page-content">
        <div className="app-loading">
          <div className="spinner" />
          <p>Cargando ligas…</p>
        </div>
      </div>
    );
  }

  const q = data?.quota;
  const competitions = data?.competitions ?? [];
  const createAllowed = q ? canCreateMore(q) : false;

  return (
    <div className="page-content ligas-page">
      <h1>Mis ligas</h1>
      <p className="ligas-lead">
        Creá ligas informales con amigos o colegas: todos usan las mismas predicciones del prode; el ranking se calcula solo entre los miembros de cada liga.
      </p>

      {error && <div className="auth-error">{error}</div>}

      <section className="ligas-section" aria-labelledby="ligas-crear-heading">
        <h2 id="ligas-crear-heading" className="ligas-section-title">
          Nueva liga
        </h2>
        <div className="ligas-create-row">
          <button
            type="button"
            className="btn-primary"
            disabled={!createAllowed}
            onClick={() => setModalOpen(true)}
          >
            Crear una nueva liga
          </button>
          {q && (
            <span className="ligas-quota" title="Ligas que vos creaste / cupo disponible">
              {quotaLabel(q)}
            </span>
          )}
        </div>
        {!createAllowed && q && (
          <p className="ligas-hint-muted">
            {q.scope === "user"
              ? "Alcanzaste el máximo de ligas que podés crear en la cuenta gratuita."
              : "Tu empresa alcanzó el máximo de competencias permitido. Contactá al administrador."}
          </p>
        )}
      </section>

      <section className="ligas-section" aria-labelledby="ligas-lista-heading">
        <h2 id="ligas-lista-heading" className="ligas-section-title">
          Ligas en las que participás
        </h2>
        {competitions.length === 0 ? (
          <p className="ligas-empty">Todavía no estás en ninguna liga. Creá una arriba o pedile a alguien que te invite.</p>
        ) : (
          <ul className="ligas-list">
            {competitions.map((c) => (
              <LigaRow key={c.id} row={c} onLeft={load} />
            ))}
          </ul>
        )}
      </section>

      {modalOpen && q && (
        <CreateLigaModal
          quota={q}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function LigaRow({ row, onLeft }: { row: MyCompetitionSummary; onLeft: () => void }) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  async function handleLeave() {
    setLeaving(true);
    try {
      await leaveCompetition(row.id);
      setConfirmLeave(false);
      onLeft();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo salir de la liga");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <li className="ligas-list-item">
      <button
        type="button"
        className="ligas-list-main"
        onClick={() => navigate(`/app/ligas/${row.id}`)}
      >
        <span className="ligas-list-name">{row.name}</span>
        <span className="ligas-list-meta">
          {row.memberCount}/{row.maxMembers} miembros
          {row.isCreator ? " · Creador" : row.myRole === "competition_admin" ? " · Admin" : ""}
        </span>
      </button>
      <div className="ligas-list-actions">
        {!confirmLeave ? (
          <button
            type="button"
            className="btn-text-danger"
            onClick={() => setConfirmLeave(true)}
          >
            Salir de la liga
          </button>
        ) : (
          <span className="ligas-leave-confirm">
            <button type="button" className="btn-sm btn-primary" disabled={leaving} onClick={handleLeave}>
              Confirmar
            </button>
            <button type="button" className="btn-sm btn-secondary" onClick={() => setConfirmLeave(false)}>
              Cancelar
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

function CreateLigaModal({
  quota,
  onClose,
  onCreated,
}: {
  quota: CompetitionQuota;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [maxMembers, setMaxMembers] = useState(10);
  const [emailsRaw, setEmailsRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const bounds = maxMembersBounds(quota);

  useEffect(() => {
    setMaxMembers((m) => Math.min(Math.max(m, bounds.min), bounds.max));
  }, [bounds.min, bounds.max]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setFormError("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    if (maxMembers < bounds.min || maxMembers > bounds.max) {
      setFormError(`El tamaño de la liga debe estar entre ${bounds.min} y ${bounds.max}.`);
      return;
    }

    setSubmitting(true);
    try {
      const { competition } = await createCompetition({ name: trimmed, maxMembers });
      const emails = parseEmails(emailsRaw);
      const selfEmail = user?.email?.toLowerCase().trim();
      const toInvite = emails.filter((em) => em !== selfEmail);

      const failures: string[] = [];
      for (const email of toInvite) {
        try {
          await inviteToCompetition(competition.id, email);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`${email}: ${msg}`);
        }
      }

      if (failures.length > 0) {
        const msg = `Liga creada. Algunas invitaciones fallaron:\n${failures.slice(0, 8).join("\n")}${failures.length > 8 ? "\n…" : ""}`;
        alert(msg);
      }
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo crear la liga");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ligas-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ligas-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ligas-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="ligas-modal-title" className="ligas-modal-title">
          Crear liga e invitar
        </h2>
        <p className="ligas-modal-lead">
          Solo pueden unirse usuarios que ya tengan cuenta en Promptplay (mismo email con el que se registraron).
        </p>
        <form onSubmit={handleSubmit} className="ligas-modal-form">
          <label className="ligas-field">
            <span>Nombre de la liga</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Oficina Norte"
              maxLength={120}
              required
              autoComplete="off"
            />
          </label>
          <label className="ligas-field">
            <span>Cupo máximo de miembros ({bounds.min}–{bounds.max})</span>
            <input
              type="number"
              min={bounds.min}
              max={bounds.max}
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value))}
            />
          </label>
          <label className="ligas-field">
            <span>Emails a invitar (opcional)</span>
            <textarea
              value={emailsRaw}
              onChange={(e) => setEmailsRaw(e.target.value)}
              placeholder={"uno@correo.com\notro@correo.com"}
              rows={5}
              className="ligas-emails-textarea"
            />
          </label>
          {formError && <p className="ligas-form-error">{formError}</p>}
          <div className="ligas-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Creando…" : "Crear e invitar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CompetitionDetailSection({ competitionId }: { competitionId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [detail, setDetail] = useState<CompetitionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const d = await fetchCompetitionDetail(competitionId);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo cargar la liga");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [competitionId]);

  async function handleLeave() {
    if (!window.confirm("¿Salir de esta liga? Si sos el último miembro, la liga se elimina.")) return;
    setLeaving(true);
    try {
      await leaveCompetition(competitionId);
      navigate("/app/ligas", { replace: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo salir");
    } finally {
      setLeaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-content">
        <div className="app-loading">
          <div className="spinner" />
          <p>Cargando…</p>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="page-content ligas-page">
        <p className="ligas-form-error">{error || "Liga no encontrada"}</p>
        <Link to="/app/ligas" className="ligas-back-link">
          ← Volver a Mis ligas
        </Link>
      </div>
    );
  }

  const { competition, members, myRole } = detail;

  return (
    <div className="page-content ligas-page">
      <nav className="ligas-breadcrumb">
        <Link to="/app/ligas">Mis ligas</Link>
        <span aria-hidden> / </span>
        <span>{competition.name}</span>
      </nav>

      <h1>{competition.name}</h1>
      <p className="ligas-detail-meta">
        {competition.memberCount} de {competition.maxMembers} miembros
        {myRole === "competition_admin" ? " · Sos administrador de la liga" : ""}
      </p>

      <div className="ligas-detail-actions">
        <Link to="/app/resultados" className="btn-primary">
          Ver ranking de esta liga en Mis resultados
        </Link>
        <button type="button" className="btn-text-danger" disabled={leaving} onClick={handleLeave}>
          {leaving ? "Saliendo…" : "Salir de la liga"}
        </button>
      </div>

      <section className="ligas-section" aria-labelledby="ligas-miembros-heading">
        <h2 id="ligas-miembros-heading" className="ligas-section-title">
          Integrantes
        </h2>
        <div className="ligas-table-wrap">
          <table className="ligas-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    {m.fullName || "—"}
                    {user?.id === m.userId ? " (vos)" : ""}
                  </td>
                  <td>{m.email}</td>
                  <td>{m.role === "competition_admin" ? "Admin" : "Miembro"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
