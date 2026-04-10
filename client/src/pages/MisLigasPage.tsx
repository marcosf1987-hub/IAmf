import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type {
  CompetitionDetailResponse,
  CompetitionQuota,
  MineCompetitionsResponse,
  MyCompetitionSummary,
  ResultsDashboard,
} from "../lib/api";
import {
  createCompetition,
  fetchCompetitionDetail,
  fetchMyCompetitions,
  fetchResultsDashboard,
  inviteToCompetition,
  joinCompetitionByCode,
  leaveCompetition,
  patchCompetition,
  removeCompetitionMember,
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

function quotaHint(q: CompetitionQuota): string {
  if (q.scope === "user") {
    return `${q.createdByMe} / ${q.maxCreatedByMe ?? "—"} ligas creadas`;
  }
  if (q.maxCompany == null) return `Empresa: ${q.companyTotal ?? 0} competencias`;
  return `Empresa: ${q.companyTotal ?? 0} / ${q.maxCompany}`;
}

function maxMembersBounds(q: CompetitionQuota): { min: number; max: number } {
  if (q.scope === "user") return { min: 2, max: 10 };
  return { min: 2, max: 500 };
}

function AvatarMini({ label }: { label: string }) {
  const t = label.trim() || "?";
  const initials = t.length <= 2 ? t.toUpperCase() : (t[0] + (t[t.length - 1] ?? "")).toUpperCase();
  return (
    <span className="ligas-avatar-mini" title={label}>
      {initials}
    </span>
  );
}

export default function MisLigasPage() {
  const { id } = useParams<{ id: string }>();
  if (id) {
    return <CompetitionDetailSection competitionId={id} />;
  }
  return <LigasCommunityHome />;
}

function LigasCommunityHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<MineCompetitionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinMsg, setJoinMsg] = useState("");
  const navigate = useNavigate();

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

  useEffect(() => {
    const j = searchParams.get("join")?.trim();
    if (j) {
      setJoinCode(j);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setJoinMsg("");
    const raw = joinCode.trim();
    if (raw.length < 4) {
      setJoinMsg("Pegá el código que te compartieron.");
      return;
    }
    setJoinBusy(true);
    try {
      const r = await joinCompetitionByCode(raw);
      const cid = r.competitionId;
      if ("alreadyMember" in r && r.alreadyMember) {
        setJoinMsg("Ya participás de esa liga.");
        navigate(`/app/ligas/${cid}`);
        return;
      }
      await load();
      navigate(`/app/ligas/${cid}`);
    } catch (err) {
      setJoinMsg(err instanceof Error ? err.message : "No se pudo unir");
    } finally {
      setJoinBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="page-content">
        <div className="app-loading">
          <div className="spinner" />
          <p>Cargando…</p>
        </div>
      </div>
    );
  }

  const q = data?.quota;
  const competitions = data?.competitions ?? [];
  const createAllowed = q ? canCreateMore(q) : false;

  return (
    <div className="page-content ligas-page ligas-community">
      <header className="ligas-hero">
        <h1>Ligas &amp; Comunidad</h1>
        <p className="ligas-lead">
          Mismas predicciones para todos; en cada liga competís solo con tu grupo. Invitá con código o creá la tuya.
        </p>
      </header>

      {error && <div className="auth-error">{error}</div>}

      <section className="ligas-global-actions" aria-label="Acciones globales">
        <div className="ligas-action-buttons">
          <button
            type="button"
            className="btn-primary ligas-btn-primary"
            disabled={!createAllowed}
            onClick={() => setModalOpen(true)}
          >
            Crear nueva liga
          </button>
          {q && <span className="ligas-quota-pill">{quotaHint(q)}</span>}
        </div>
        {!createAllowed && q && (
          <p className="ligas-hint-muted">
            {q.scope === "user"
              ? "Llegaste al máximo de ligas que podés crear."
              : "Tu empresa alcanzó el cupo de competencias."}
          </p>
        )}

        <form className="ligas-join-form" onSubmit={handleJoin}>
          <label className="ligas-join-label">
            <span className="ligas-join-title">Unirse con código</span>
            <span className="ligas-join-desc">Pegá el código alfanumérico (ej. MUNDIAL-IA-A1B2C3) que te pasó un amigo.</span>
          </label>
          <div className="ligas-join-row">
            <input
              type="text"
              className="ligas-join-input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="MUNDIAL-IA-…"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn-secondary" disabled={joinBusy}>
              {joinBusy ? "Uniendo…" : "Unirme"}
            </button>
          </div>
          {joinMsg && <p className="ligas-join-msg">{joinMsg}</p>}
        </form>
      </section>

      <section className="ligas-active-section" aria-labelledby="ligas-activas-heading">
        <h2 id="ligas-activas-heading" className="ligas-section-title">
          Mis ligas activas
        </h2>
        {competitions.length === 0 ? (
          <p className="ligas-empty">Todavía no estás en ninguna liga.</p>
        ) : (
          <div className="ligas-cards-grid">
            {competitions.map((c) => (
              <LigaCard key={c.id} row={c} onLeft={load} />
            ))}
          </div>
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

function LigaCard({ row, onLeft }: { row: MyCompetitionSummary; onLeft: () => void }) {
  const navigate = useNavigate();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { card } = row;
  const pos =
    card.myRank != null && card.totalParticipants > 0
      ? `Estás ${card.myRank}º de ${card.totalParticipants} participantes`
      : "Sin posición aún (faltan resultados o predicciones)";

  const top = card.topThree;
  const fillers = [0, 1, 2].map((i) => top[i] ?? null);

  async function handleLeave() {
    setLeaving(true);
    try {
      await leaveCompetition(row.id);
      setConfirmLeave(false);
      onLeft();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo salir");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <article className="liga-card">
      <div className="liga-card-visual">
        {row.coverImageUrl ? (
          <img src={row.coverImageUrl} alt="" className="liga-card-cover" />
        ) : (
          <div className="liga-card-cover-fallback" aria-hidden>
            {row.emoji || "⚽"}
          </div>
        )}
      </div>
      <div className="liga-card-body">
        <h3 className="liga-card-title">{row.name}</h3>
        {row.description && <p className="liga-card-rules">{row.description}</p>}
        <p className="liga-card-position">{pos}</p>
        <div className="liga-card-podium" aria-label="Top 3">
          {fillers.map((p, i) =>
            p ? (
              <AvatarMini key={`${p.userId}-${i}`} label={p.displayLabel} />
            ) : (
              <span key={`empty-${i}`} className="liga-card-podium-empty">
                —
              </span>
            )
          )}
        </div>
        <div className="liga-card-actions">
          <button type="button" className="btn-primary btn-sm" onClick={() => navigate(`/app/ligas/${row.id}`)}>
            Ver tabla
          </button>
          {!confirmLeave ? (
            <button type="button" className="liga-card-leave" onClick={() => setConfirmLeave(true)} title="Abandonar liga">
              Abandonar
            </button>
          ) : (
            <span className="liga-card-leave-confirm">
              <button type="button" className="btn-sm btn-primary" disabled={leaving} onClick={handleLeave}>
                Confirmar
              </button>
              <button type="button" className="btn-sm btn-secondary" onClick={() => setConfirmLeave(false)}>
                Cancelar
              </button>
            </span>
          )}
        </div>
        {confirmLeave && (
          <p className="liga-card-leave-warning" role="alert">
            ¿Seguro que querés darte de baja? Perderás tu progreso en este grupo (la posición en esta liga).
          </p>
        )}
      </div>
    </article>
  );
}

const EMPTY_DATA: ResultsDashboard = {
  totalHits: 0,
  totalWithResult: 0,
  precision: 0,
  leaderboard: [],
  myRank: null,
  totalParticipants: 0,
  rankChange: 0,
  pointsOverTime: [],
  competitionLeaderboards: [],
};

function CompetitionDetailSection({ competitionId }: { competitionId: string }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "config" ? "config" : "ranking";
  const { user } = useAuth();
  const [detail, setDetail] = useState<CompetitionDetailResponse | null>(null);
  const [dash, setDash] = useState<ResultsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const [d, r] = await Promise.all([
          fetchCompetitionDetail(competitionId),
          fetchResultsDashboard().catch(() => EMPTY_DATA),
        ]);
        if (!cancelled) {
          setDetail(d);
          setDash(r);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
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
    if (
      !window.confirm(
        "¿Salir de esta liga? Si sos el último miembro, la liga se elimina. Tu progreso en el grupo dejará de mostrarse."
      )
    ) {
      return;
    }
    setLeaving(true);
    try {
      await leaveCompetition(competitionId);
      navigate("/app/ligas", { replace: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
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
        <p className="ligas-form-error">{error || "No encontrado"}</p>
        <Link to="/app/ligas" className="ligas-back-link">
          ← Ligas &amp; Comunidad
        </Link>
      </div>
    );
  }

  const { competition, members, myRole } = detail;
  const isAdmin = myRole === "competition_admin";
  const block = dash?.competitionLeaderboards.find((b) => b.id === competitionId);

  function setTab(next: "ranking" | "config") {
    setSearchParams(next === "ranking" ? {} : { tab: "config" }, { replace: true });
  }

  return (
    <div className="page-content ligas-page ligas-detail-page">
      <nav className="ligas-breadcrumb">
        <Link to="/app/ligas">Ligas &amp; Comunidad</Link>
        <span aria-hidden> / </span>
        <span>{competition.name}</span>
      </nav>

      <header className="ligas-detail-header">
        {competition.coverImageUrl ? (
          <img src={competition.coverImageUrl} alt="" className="liga-detail-cover" />
        ) : (
          <div className="liga-detail-emoji" aria-hidden>
            {competition.emoji || "⚽"}
          </div>
        )}
        <div>
          <h1>{competition.name}</h1>
          {competition.description && <p className="liga-detail-desc">{competition.description}</p>}
          <p className="liga-detail-meta">
            {competition.memberCount} / {competition.maxMembers} miembros
            {isAdmin ? " · Administrás esta liga" : ""}
          </p>
        </div>
      </header>

      <div className="ligas-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ranking"}
          className={tab === "ranking" ? "ligas-tab-active" : ""}
          onClick={() => setTab("ranking")}
        >
          Ranking
        </button>
        {isAdmin && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "config"}
            className={tab === "config" ? "ligas-tab-active" : ""}
            onClick={() => setTab("config")}
          >
            Configuración
          </button>
        )}
      </div>

      {tab === "ranking" && (
        <section className="ligas-tab-panel" aria-label="Ranking">
          <p className="ligas-tab-lead">
            Mismas predicciones que en el global; acá el puntaje es solo entre miembros de esta liga.
          </p>
          {block && block.leaderboard.length > 0 ? (
            <div className="ligas-table-wrap">
              <table className="ligas-table">
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Participante</th>
                    <th>Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {block.leaderboard.map((row) => (
                    <tr key={row.userId} className={user?.id === row.userId ? "ligas-row-me" : ""}>
                      <td>{row.rank}</td>
                      <td>{row.alias}</td>
                      <td>{row.hits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ligas-empty">Aún no hay datos de ranking para esta liga.</p>
          )}
          <Link to="/app/resultados" className="ligas-link-results">
            Ver también en Mis resultados (todas las ligas)
          </Link>
        </section>
      )}

      {tab === "config" && isAdmin && (
        <AdminLigaConfig
          competitionId={competitionId}
          initial={competition}
          members={members}
          currentUserId={user?.id ?? ""}
          onPatched={(c) =>
            setDetail((prev) =>
              prev
                ? {
                    ...prev,
                    competition: {
                      ...prev.competition,
                      ...c,
                    },
                  }
                : prev
            )
          }
          onMemberRemoved={() => {
            fetchCompetitionDetail(competitionId).then(setDetail).catch(() => {});
          }}
        />
      )}

      <footer className="ligas-detail-footer">
        <button type="button" className="btn-text-danger" disabled={leaving} onClick={handleLeave}>
          {leaving ? "Saliendo…" : "Abandonar liga"}
        </button>
      </footer>
    </div>
  );
}

function AdminLigaConfig({
  competitionId,
  initial,
  members,
  currentUserId,
  onPatched,
  onMemberRemoved,
}: {
  competitionId: string;
  initial: CompetitionDetailResponse["competition"];
  members: CompetitionDetailResponse["members"];
  currentUserId: string;
  onPatched: (c: Partial<CompetitionDetailResponse["competition"]>) => void;
  onMemberRemoved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [emoji, setEmoji] = useState(initial.emoji ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(initial.coverImageUrl ?? "");
  const [maxMembers, setMaxMembers] = useState(initial.maxMembers);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const inviteCode = initial.inviteCode ?? "";

  useEffect(() => {
    setName(initial.name);
    setDescription(initial.description ?? "");
    setEmoji(initial.emoji ?? "");
    setCoverImageUrl(initial.coverImageUrl ?? "");
    setMaxMembers(initial.maxMembers);
  }, [initial]);

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/app/ligas?join=${encodeURIComponent(inviteCode)}`
      : "";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
    } catch {
      alert(inviteCode);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      alert(inviteLink);
    }
  }

  async function savePersonalization(e: FormEvent) {
    e.preventDefault();
    setSaveErr("");
    setSaving(true);
    try {
      const { competition } = await patchCompetition(competitionId, {
        name: name.trim(),
        description: description.trim() || null,
        emoji: emoji.trim() || null,
        coverImageUrl: coverImageUrl.trim() || null,
        maxMembers,
      });
      onPatched(competition);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(uid: string) {
    if (!window.confirm("¿Quitar a esta persona de la liga?")) return;
    setRemoving(uid);
    try {
      await removeCompetitionMember(competitionId, uid);
      onMemberRemoved();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="ligas-admin" aria-label="Configuración de liga">
      <div className="ligas-admin-block">
        <h3 className="ligas-admin-title">Código de invitación</h3>
        <p className="ligas-admin-desc">Compartí el código o el enlace por Slack, Teams o WhatsApp.</p>
        <div className="ligas-invite-code-row">
          <code className="ligas-invite-code">{inviteCode || "—"}</code>
          <button type="button" className="btn-secondary btn-sm" onClick={copyCode}>
            Copiar código
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={copyLink}>
            Copiar link de invitación
          </button>
        </div>
      </div>

      <form className="ligas-admin-block" onSubmit={savePersonalization}>
        <h3 className="ligas-admin-title">Personalización</h3>
        <label className="ligas-field">
          <span>Nombre de la liga</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </label>
        <label className="ligas-field">
          <span>Reglas o contexto (visible para todos)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder='Ej. "Solo para el equipo de Ventas"'
          />
        </label>
        <label className="ligas-field">
          <span>Emoji identificador</span>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={16} placeholder="⚽" />
        </label>
        <label className="ligas-field">
          <span>URL de imagen (opcional, enlace público)</span>
          <input
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            maxLength={2000}
            placeholder="https://…"
          />
        </label>
        <label className="ligas-field">
          <span>Cupo máximo de miembros</span>
          <input
            type="number"
            min={Math.max(2, members.length)}
            max={500}
            value={maxMembers}
            onChange={(e) => setMaxMembers(Number(e.target.value))}
          />
        </label>
        {saveErr && <p className="ligas-form-error">{saveErr}</p>}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>

      <div className="ligas-admin-block">
        <h3 className="ligas-admin-title">Miembros</h3>
        <ul className="ligas-admin-members">
          {members.map((m) => (
            <li key={m.userId} className="ligas-admin-member">
              <div>
                <strong>{m.fullName || m.email}</strong>
                <span className="ligas-admin-member-meta">
                  {m.email} · {m.role === "competition_admin" ? "Admin" : "Miembro"}
                </span>
              </div>
              {m.userId !== currentUserId && (
                <button
                  type="button"
                  className="btn-text-danger btn-sm"
                  disabled={removing === m.userId}
                  onClick={() => removeMember(m.userId)}
                >
                  {removing === m.userId ? "…" : "Eliminar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
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
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("⚽");
  const [coverImageUrl, setCoverImageUrl] = useState("");
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
      setFormError(`El cupo debe estar entre ${bounds.min} y ${bounds.max}.`);
      return;
    }

    setSubmitting(true);
    try {
      const { competition } = await createCompetition({
        name: trimmed,
        maxMembers,
        description: description.trim() || null,
        emoji: emoji.trim() || null,
        coverImageUrl: coverImageUrl.trim() || null,
      });
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
        alert(
          `Liga creada. Algunas invitaciones por email fallaron:\n${failures.slice(0, 8).join("\n")}${failures.length > 8 ? "\n…" : ""}`
        );
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
        className="ligas-modal ligas-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ligas-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="ligas-modal-title" className="ligas-modal-title">
          Crear nueva liga
        </h2>
        <p className="ligas-modal-lead">
          Vas a ser el administrador. Podés compartir el código de invitación desde la configuración de la liga.
        </p>
        <form onSubmit={handleSubmit} className="ligas-modal-form">
          <label className="ligas-field">
            <span>Nombre</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Ej. "Los Analistas del 3er Piso"'
              maxLength={120}
              required
              autoComplete="off"
            />
          </label>
          <label className="ligas-field">
            <span>Reglas o contexto (opcional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ej. Solo para el equipo de Ventas"
            />
          </label>
          <div className="ligas-modal-row">
            <label className="ligas-field">
              <span>Emoji</span>
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={16} />
            </label>
            <label className="ligas-field ligas-field-grow">
              <span>URL imagen cabecera (opcional)</span>
              <input
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://…"
                maxLength={2000}
              />
            </label>
          </div>
          <label className="ligas-field">
            <span>Cupo máximo ({bounds.min}–{bounds.max})</span>
            <input
              type="number"
              min={bounds.min}
              max={bounds.max}
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value))}
            />
          </label>
          <label className="ligas-field">
            <span>Invitar por email (opcional)</span>
            <textarea
              value={emailsRaw}
              onChange={(e) => setEmailsRaw(e.target.value)}
              placeholder={"varios@correo.com, uno por línea"}
              rows={4}
              className="ligas-emails-textarea"
            />
          </label>
          {formError && <p className="ligas-form-error">{formError}</p>}
          <div className="ligas-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Creando…" : "Crear liga"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
