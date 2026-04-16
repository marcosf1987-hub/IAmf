import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useFlash } from "../contexts/FlashContext";
import { useEscapeKey } from "../hooks/useEscapeKey";
import type {
  CompetitionDetailResponse,
  CompetitionQuota,
  MineCompetitionsResponse,
  MyCompetitionSummary,
  ResultsDashboard,
} from "../lib/api";
import { EmptyState } from "../components/EmptyState";
import {
  createCompetition,
  fetchCompetitionDetail,
  fetchMyCompetitions,
  fetchResultsDashboard,
  formatApiError,
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

function AvatarMini({ label, place }: { label: string; place?: 1 | 2 | 3 }) {
  const t = label.trim() || "?";
  const initials = t.length <= 2 ? t.toUpperCase() : (t[0] + (t[t.length - 1] ?? "")).toUpperCase();
  const placeCls = place ? ` ligas-avatar-mini--p${place}` : "";
  return (
    <span className={`ligas-avatar-mini${placeCls}`} title={label}>
      {initials}
    </span>
  );
}

function RankDelta({ change }: { change: number }) {
  if (change > 0) return <span className="ligas-rank-delta ligas-rank-delta--up" aria-label={`Subió ${change} puestos`}>↑{change}</span>;
  if (change < 0) return <span className="ligas-rank-delta ligas-rank-delta--down" aria-label={`Bajó ${Math.abs(change)} puestos`}>↓{Math.abs(change)}</span>;
  return <span className="ligas-rank-delta ligas-rank-delta--same">—</span>;
}

function LeaveLeagueModal({
  open,
  leagueName,
  onClose,
  onConfirm,
  loading,
  variant,
}: {
  open: boolean;
  leagueName: string;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  variant: "card" | "detail";
}) {
  const titleId = useId();
  useEscapeKey(open, onClose);
  if (!open) return null;
  const desc =
    variant === "detail"
      ? "Si sos el último miembro, la liga se elimina. Tu posición en este grupo dejará de mostrarse."
      : "Vas a dejar de aparecer en el ranking de esta liga. Podés volver a unirte solo con una nueva invitación o código.";
  return (
    <div className="ligas-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ligas-modal ligas-modal--confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="ligas-modal-title">
          ¿Salir de «{leagueName}»?
        </h2>
        <p className="ligas-modal-lead">{desc}</p>
        <div className="ligas-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={loading}>
            {loading ? "Saliendo…" : "Sí, salir de la liga"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LigasHomeSkeleton() {
  return (
    <div className="page-content ligas-page ligas-community ligas-home-skeleton" aria-busy="true" aria-label="Cargando ligas">
      <div className="ligas-skeleton-hero">
        <div className="skeleton skeleton-line ligas-sk-title" />
        <div className="skeleton skeleton-line ligas-sk-lead" />
      </div>
      <div className="ligas-global-actions ligas-global-actions--skeleton">
        <div className="skeleton skeleton-block ligas-sk-actions" />
      </div>
      <div className="ligas-cards-grid">
        {[1, 2, 3].map((k) => (
          <div key={k} className="liga-card liga-card--skeleton">
            <div className="skeleton skeleton-block liga-card-sk-visual" />
            <div className="liga-card-body">
              <div className="skeleton skeleton-line ligas-sk-line" />
              <div className="skeleton skeleton-line ligas-sk-line-short" />
              <div className="liga-card-sk-podium">
                <span className="skeleton skeleton-block ligas-sk-av" />
                <span className="skeleton skeleton-block ligas-sk-av" />
                <span className="skeleton skeleton-block ligas-sk-av" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LigasDetailSkeleton() {
  return (
    <div className="page-content ligas-page ligas-detail-page ligas-detail-skeleton" aria-busy="true" aria-label="Cargando liga">
      <div className="skeleton skeleton-line ligas-sk-crumb" />
      <div className="ligas-detail-header">
        <div className="skeleton skeleton-block ligas-sk-cover" />
        <div className="ligas-sk-head-text">
          <div className="skeleton skeleton-line ligas-sk-h1" />
          <div className="skeleton skeleton-line ligas-sk-meta" />
        </div>
      </div>
      <div className="ligas-tabs ligas-tabs--skeleton">
        <div className="skeleton skeleton-line ligas-sk-tab" />
        <div className="skeleton skeleton-line ligas-sk-tab" />
      </div>
      <div className="skeleton skeleton-block ligas-sk-panel" />
    </div>
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
  const { showFlash } = useFlash();
  const joinInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<MineCompetitionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinMsg, setJoinMsg] = useState("");
  const navigate = useNavigate();

  function focusJoinCode() {
    document.getElementById("ligas-unirse")?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => joinInputRef.current?.focus(), 300);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchMyCompetitions();
      setData(res);
    } catch (e) {
      setError(formatApiError(e));
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
        showFlash("Ya participás de esa liga. Te llevamos al detalle.", "info");
        navigate(`/app/ligas/${cid}`);
        return;
      }
      showFlash("Te uniste a la liga.", "success");
      await load();
      navigate(`/app/ligas/${cid}`);
    } catch (err) {
      setJoinMsg(formatApiError(err));
    } finally {
      setJoinBusy(false);
    }
  }

  if (loading && !data) {
    return <LigasHomeSkeleton />;
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

        <div className="ligas-join-card" id="ligas-unirse">
          <form className="ligas-join-form" onSubmit={handleJoin} aria-describedby={joinMsg ? "ligas-join-err" : undefined}>
            <label className="ligas-join-label" htmlFor="ligas-join-input">
              <span className="ligas-join-title">Unirse con código</span>
              <span className="ligas-join-desc">Pegá el código alfanumérico (ej. MUNDIAL-IA-A1B2C3) que te pasó un amigo.</span>
            </label>
            <div className="ligas-join-row">
              <input
                id="ligas-join-input"
                ref={joinInputRef}
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
            {joinMsg ? (
              <p id="ligas-join-err" className="ligas-join-msg ligas-join-msg--error" role="alert">
                {joinMsg}
              </p>
            ) : null}
          </form>
        </div>
      </section>

      <section className="ligas-active-section" aria-labelledby="ligas-activas-heading">
        <h2 id="ligas-activas-heading" className="ligas-section-title">
          Mis ligas activas
        </h2>
        {competitions.length === 0 ? (
          <EmptyState
            title="Todavía no estás en ninguna liga"
            description="Creá una para invitar a tu grupo o unite con el código que te compartieron."
            action={
              <>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setModalOpen(true)}
                  disabled={!createAllowed}
                  title={!createAllowed && q ? "Llegaste al máximo de ligas que podés crear." : undefined}
                >
                  Crear mi primera liga
                </button>
                <button type="button" className="btn-secondary" onClick={focusJoinCode}>
                  Tengo un código
                </button>
              </>
            }
          />
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
  const { showFlash } = useFlash();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { card } = row;

  const top = card.topThree;
  const fillers = [0, 1, 2].map((i) => top[i] ?? null);

  async function handleLeave() {
    setLeaving(true);
    try {
      await leaveCompetition(row.id);
      setLeaveOpen(false);
      onLeft();
    } catch (e) {
      showFlash(formatApiError(e), "error");
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
        <div className="liga-card-rank-row">
          {card.myRank != null && card.totalParticipants > 0 ? (
            <>
              <span
                className="liga-card-rank-badge"
                aria-label={`Tu puesto: ${card.myRank} de ${card.totalParticipants}`}
              >
                <span className="liga-card-rank-num">{card.myRank}</span>
                <span className="liga-card-rank-sep">/</span>
                <span className="liga-card-rank-total">{card.totalParticipants}</span>
              </span>
              <span className="liga-card-rank-label">Tu puesto</span>
            </>
          ) : (
            <span className="liga-card-rank-muted">Sin posición aún (faltan resultados o predicciones)</span>
          )}
        </div>
        <div className="liga-card-podium" aria-label="Top 3">
          {fillers.map((p, i) =>
            p ? (
              <AvatarMini key={`${p.userId}-${i}`} label={p.displayLabel} place={(i + 1) as 1 | 2 | 3} />
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
          <button
            type="button"
            className="liga-card-leave"
            onClick={() => setLeaveOpen(true)}
            title="Abandonar liga"
          >
            Abandonar
          </button>
        </div>
      </div>
      <LeaveLeagueModal
        open={leaveOpen}
        leagueName={row.name}
        onClose={() => !leaving && setLeaveOpen(false)}
        onConfirm={handleLeave}
        loading={leaving}
        variant="card"
      />
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
  const { showFlash } = useFlash();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "config" ? "config" : "ranking";
  const { user } = useAuth();
  const [detail, setDetail] = useState<CompetitionDetailResponse | null>(null);
  const [dash, setDash] = useState<ResultsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

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
        if (!cancelled) setError(formatApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [competitionId]);

  async function confirmLeaveDetail() {
    setLeaving(true);
    try {
      await leaveCompetition(competitionId);
      navigate("/app/ligas", { replace: true });
    } catch (e) {
      showFlash(formatApiError(e), "error");
    } finally {
      setLeaving(false);
      setLeaveOpen(false);
    }
  }

  if (loading) {
    return <LigasDetailSkeleton />;
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
          {block ? (
            <div className="ligas-your-rank-strip" role="region" aria-label="Tu posición en esta liga">
              <div className="ligas-your-rank-main">
                <span className="ligas-your-rank-label">Tu lugar en esta liga</span>
                {block.myRank != null && block.totalParticipants > 0 ? (
                  <p className="ligas-your-rank-value">
                    <strong>#{block.myRank}</strong>
                    <span className="ligas-your-rank-of"> de {block.totalParticipants} participantes</span>
                    <RankDelta change={block.rankChange} />
                  </p>
                ) : (
                  <p className="ligas-your-rank-muted">
                    Aún sin posición: cuando haya resultados en el torneo, tu puesto aparecerá aquí y en la tabla.
                  </p>
                )}
              </div>
            </div>
          ) : null}
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
            <EmptyState
              title="Todavía no hay ranking en esta liga"
              description="Cuando se publiquen resultados de partidos y los miembros tengan predicciones, la tabla se completará automáticamente."
            />
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
        <button type="button" className="btn-text-danger" disabled={leaving} onClick={() => setLeaveOpen(true)}>
          Abandonar liga
        </button>
      </footer>

      <LeaveLeagueModal
        open={leaveOpen}
        leagueName={competition.name}
        onClose={() => !leaving && setLeaveOpen(false)}
        onConfirm={confirmLeaveDetail}
        loading={leaving}
        variant="detail"
      />
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
  const { showFlash } = useFlash();
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
      showFlash("Código copiado al portapapeles", "success");
    } catch {
      showFlash(`No se pudo copiar automáticamente. Código: ${inviteCode}`, "info");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      showFlash("Link de invitación copiado", "success");
    } catch {
      showFlash("No se pudo copiar el link. Copiá la URL desde la barra de direcciones tras abrir la liga.", "info");
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
      setSaveErr(formatApiError(err));
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
      showFlash(formatApiError(err), "error");
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
  const { showFlash } = useFlash();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("⚽");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [maxMembers, setMaxMembers] = useState(10);
  const [emailsRaw, setEmailsRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const bounds = maxMembersBounds(quota);

  useEscapeKey(true, onClose);

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
      const emailInvites: string[] = [];
      for (const em of toInvite) {
        try {
          const r = await inviteToCompetition(competition.id, em);
          if (r.mode === "email_invite") {
            emailInvites.push(em);
            if (!r.emailSent && r.inviteUrl) {
              showFlash(`Invitación a ${em}: copiá el enlace si no hay mail configurado.`, "info");
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`${em}: ${msg}`);
        }
      }

      if (emailInvites.length > 0) {
        showFlash(
          `Liga creada. Se enviaron invitaciones por email (${emailInvites.length}) a quienes aún no tenían cuenta; deberán abrir el enlace del correo.`,
          "info"
        );
      }
      if (failures.length > 0) {
        showFlash(
          `Algunas invitaciones fallaron: ${failures.slice(0, 5).join("; ")}${failures.length > 5 ? "…" : ""}`,
          "info"
        );
      }
      onCreated();
    } catch (err) {
      setFormError(formatApiError(err));
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
