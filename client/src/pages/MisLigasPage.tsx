import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useFlash } from "../contexts/FlashContext";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useIsF1AppShell, useLigasBasePath } from "../hooks/useLigasBasePath";
import type { CompetitionDiscipline } from "../lib/api";
import type {
  CompetitionDetailResponse,
  CompetitionQuota,
  MineCompetitionsResponse,
  MyCompetitionSummary,
  ResultsDashboard,
} from "../lib/api";
import { EmptyState } from "../components/EmptyState";
import { FALLBACK_STADIUM_BG, stadiumBackgroundUrlForLeague } from "../lib/match-venue";
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

function isProtectedUniversalLeague(input: { slug?: string | null; name?: string | null }): boolean {
  const slug = (input.slug ?? "").toLowerCase();
  const name = (input.name ?? "").toLowerCase();
  return (
    slug.includes("universal") ||
    slug.includes("general") ||
    name.includes("liga universal") ||
    name.includes("campeonato general") ||
    name.includes("liga general")
  );
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
  const ligasBase = useLigasBasePath();
  const isF1Shell = useIsF1AppShell();
  const listDiscipline: CompetitionDiscipline = isF1Shell ? "f1" : "football";
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
      const res = await fetchMyCompetitions(listDiscipline);
      setData(res);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [listDiscipline]);

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
        navigate(`${ligasBase}/${cid}`);
        return;
      }
      showFlash("Te uniste a la liga.", "success");
      await load();
      navigate(`${ligasBase}/${cid}`);
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
        <h1>Mis Ligas</h1>
        <p className="ligas-lead">
          Crea tus ligas de amigos, familia o con compañeros de trabajo y compite para ver quién logra mejores
          resultados.
        </p>
      </header>

      {error && <div className="auth-error">{error}</div>}

      <section className="ligas-global-actions" id="ligas-crear" aria-label="Acciones globales">
        <article className="ligas-action-box" aria-labelledby="ligas-crear-title">
          <header className="ligas-action-box-head">
            <h2 id="ligas-crear-title" className="ligas-action-box-title">
              Crear nueva liga
            </h2>
            {q ? <span className="ligas-quota-pill">{quotaHint(q)}</span> : null}
          </header>
          <p className="ligas-action-box-desc">
            Configura las reglas, invita a tus amigos y compite en tu propio grupo cerrado.
          </p>
          <button
            type="button"
            className="btn-primary ligas-btn-primary ligas-action-cta"
            disabled={!createAllowed}
            onClick={() => setModalOpen(true)}
          >
            Configurar liga
          </button>
          {!createAllowed && q && (
            <p className="ligas-hint-muted">
              {q.scope === "user"
                ? "Llegaste al máximo de ligas que podés crear."
                : "Tu empresa alcanzó el cupo de competencias."}
            </p>
          )}
        </article>

        <article className="ligas-action-box" id="ligas-unirse" aria-labelledby="ligas-unirse-title">
          <form className="ligas-join-form" onSubmit={handleJoin} aria-describedby={joinMsg ? "ligas-join-err" : undefined}>
            <label className="ligas-join-label" htmlFor="ligas-join-input">
              <span id="ligas-unirse-title" className="ligas-join-title">
                Unirme a una Liga existente
              </span>
              <span className="ligas-join-desc">
                Pega el código alfanumérico de invitación que te compartieron para poder sumarte a una liga existente.
              </span>
            </label>
            <div className="ligas-join-row">
              <input
                id="ligas-join-input"
                ref={joinInputRef}
                type="text"
                className="ligas-join-input"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="IA-2026"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="btn-secondary ligas-join-submit" disabled={joinBusy} aria-label="Unirme a la liga por código">
                {joinBusy ? "Uniendo…" : "Unirme"}
              </button>
            </div>
            {joinMsg ? (
              <p id="ligas-join-err" className="ligas-join-msg ligas-join-msg--error" role="alert">
                {joinMsg}
              </p>
            ) : null}
          </form>
        </article>
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

function WhatsAppIcon() {
  return (
    <svg className="ligas-whatsapp-icon" viewBox="0 0 24 24" aria-hidden width={16} height={16}>
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

function LigaCard({ row, onLeft }: { row: MyCompetitionSummary; onLeft: () => void }) {
  const navigate = useNavigate();
  const ligasBase = useLigasBasePath();
  const { showFlash } = useFlash();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const stadiumBg = stadiumBackgroundUrlForLeague(row.id);
  const [stadiumBgSrc, setStadiumBgSrc] = useState(stadiumBg);
  const { card } = row;
  const protectedLeague = isProtectedUniversalLeague(row);
  const isAdmin = row.myRole === "competition_admin";

  const top = card.topThree;
  const fillers = [0, 1, 2].map((i) => top[i] ?? null);

  async function handleLeave() {
    if (protectedLeague) {
      showFlash("La liga universal no puede abandonarse desde esta pantalla.", "info");
      setLeaveOpen(false);
      return;
    }
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
      <div className={`liga-card-visual${row.coverImageUrl ? "" : " liga-card-visual--stadium"}`}>
        {row.coverImageUrl ? (
          <img src={row.coverImageUrl} alt="" className="liga-card-cover" />
        ) : (
          <div className="liga-card-visual-bg" aria-hidden>
            <img
              src={stadiumBgSrc}
              alt=""
              className="liga-card-visual-bg-img"
              loading="lazy"
              decoding="async"
              onError={() => setStadiumBgSrc(FALLBACK_STADIUM_BG)}
            />
            <div className="liga-card-visual-bg-blur" />
            <div className="liga-card-visual-bg-scrim" />
          </div>
        )}
        <span className="liga-card-chip">{row.memberCount} integrantes</span>
      </div>
      <div className="liga-card-body">
        <h3 className="liga-card-title">{row.name}</h3>
        {row.description && <p className="liga-card-rules">{row.description}</p>}
        <div className="liga-card-stats-row">
          <div className="liga-card-stat">
            <span className="liga-card-stat-label">Tu posición</span>
            {card.myRank != null && card.totalParticipants > 0 ? (
              <span className="liga-card-stat-value" aria-label={`Tu puesto: ${card.myRank} de ${card.totalParticipants}`}>
                #{card.myRank} <span className="liga-card-stat-divider">/ {card.totalParticipants}</span>
              </span>
            ) : (
              <span className="liga-card-rank-muted">Sin posición aún</span>
            )}
          </div>
          <div className="liga-card-stat">
            <span className="liga-card-stat-label">Participantes</span>
            <span className="liga-card-stat-value">{row.memberCount}</span>
          </div>
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
          <button type="button" className="btn-primary btn-sm" onClick={() => navigate(`${ligasBase}/${row.id}`)}>
            Ver tabla
          </button>
          {!protectedLeague &&
            (isAdmin ? (
              <button
                type="button"
                className="liga-card-leave"
                onClick={() => navigate(`${ligasBase}/${row.id}?tab=config`)}
                title="Configurar liga"
              >
                Configurar
              </button>
            ) : (
              <button
                type="button"
                className="liga-card-leave"
                onClick={() => setLeaveOpen(true)}
                title="Abandonar liga"
              >
                Abandonar
              </button>
            ))}
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
  const ligasBase = useLigasBasePath();
  const isF1Shell = useIsF1AppShell();
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
  const protectedLeague = isProtectedUniversalLeague(detail?.competition ?? {});

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const d = await fetchCompetitionDetail(competitionId);
        const dashDiscipline: CompetitionDiscipline =
          d.competition.discipline === "f1" ? "f1" : "football";
        const r = await fetchResultsDashboard(dashDiscipline).catch(() => EMPTY_DATA);
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
    if (protectedLeague) {
      showFlash("La liga universal no puede abandonarse desde esta pantalla.", "info");
      setLeaveOpen(false);
      return;
    }
    setLeaving(true);
    try {
      await leaveCompetition(competitionId);
      navigate(ligasBase, { replace: true });
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
        <Link to={ligasBase} className="ligas-back-link">
          ← Mis Ligas
        </Link>
      </div>
    );
  }

  const { competition, members, myRole } = detail;
  const isAdmin = myRole === "competition_admin";
  const block = dash?.competitionLeaderboards.find((b) => b.id === competitionId);
  const isF1Liga = competition.discipline === "f1";

  function setTab(next: "ranking" | "config") {
    setSearchParams(next === "ranking" ? {} : { tab: "config" }, { replace: true });
  }

  return (
    <div className="page-content ligas-page ligas-detail-page">
      <nav className="ligas-breadcrumb">
        <Link to={ligasBase}>Mis Ligas</Link>
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
            {isF1Liga
              ? "Puntos F1 según el top 10 oficial (OpenF1) y tus predicciones por carrera; el ranking es sólo entre miembros de esta liga."
              : "Mismas predicciones que en el global; acá el puntaje es solo entre miembros de esta liga."}
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
                    {isF1Liga
                      ? "Aún sin posición: cuando una carrera tenga resultado oficial (top 10) en OpenF1, tu puesto aparecerá aquí y en la tabla."
                      : "Aún sin posición: cuando haya resultados en el torneo, tu puesto aparecerá aquí y en la tabla."}
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
              description={
                isF1Liga
                  ? "Cuando OpenF1 tenga el top 10 de una carrera cerrada y los miembros tengan predicciones F1, la tabla se completará automáticamente."
                  : "Cuando se publiquen resultados de partidos y los miembros tengan predicciones, la tabla se completará automáticamente."
              }
            />
          )}
          <Link to={isF1Shell ? "/app/f1/resultados" : "/app/resultados"} className="ligas-link-results">
            Ver también en Mis resultados (todas las ligas)
          </Link>
        </section>
      )}

      {tab === "config" && isAdmin && (
        <AdminLigaConfig
          competitionId={competitionId}
          ligasListPath={ligasBase}
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
        {protectedLeague ? (
          <p className="ligas-detail-protected-note">Esta es la liga universal y no puede abandonarse.</p>
        ) : (
          <button type="button" className="btn-text-danger" disabled={leaving} onClick={() => setLeaveOpen(true)}>
            Abandonar liga
          </button>
        )}
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
  ligasListPath,
  initial,
  members,
  currentUserId,
  onPatched,
  onMemberRemoved,
}: {
  competitionId: string;
  /** Ruta lista de ligas (`/app/ligas` o `/app/f1/ligas`) para el enlace con código de invitación. */
  ligasListPath: string;
  initial: CompetitionDetailResponse["competition"];
  members: CompetitionDetailResponse["members"];
  currentUserId: string;
  onPatched: (c: Partial<CompetitionDetailResponse["competition"]>) => void;
  onMemberRemoved: () => void;
}) {
  const { showFlash } = useFlash();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const inviteCode = initial.inviteCode ?? "";

  useEffect(() => {
    setName(initial.name);
    setDescription(initial.description ?? "");
  }, [initial]);

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}${ligasListPath}?join=${encodeURIComponent(inviteCode)}`
      : "";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      showFlash("Código copiado al portapapeles", "success");
    } catch {
      showFlash(`No se pudo copiar automáticamente. Código: ${inviteCode}`, "info");
    }
  }

  const whatsappInviteHref = inviteLink
    ? `https://wa.me/?text=${encodeURIComponent(
        `Te invito a sumarte a mi liga de PromptPlay, haz click en el siguiente link ${inviteLink}`
      )}`
    : undefined;

  async function savePersonalization(e: FormEvent) {
    e.preventDefault();
    setSaveErr("");
    setSaving(true);
    try {
      const { competition } = await patchCompetition(competitionId, {
        name: name.trim(),
        description: description.trim() || null,
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
        <p className="ligas-admin-desc">
          Compartí este código o el link de invitación para sumar invitados a la liga.
        </p>
        <div className="ligas-invite-code-row">
          <code className="ligas-invite-code">{inviteCode || "—"}</code>
          <button type="button" className="btn-secondary btn-sm" onClick={copyCode}>
            Copiar código
          </button>
          {whatsappInviteHref ? (
            <a
              href={whatsappInviteHref}
              className="btn-secondary btn-sm ligas-btn-whatsapp"
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon />
              Enviar invitación
            </a>
          ) : null}
        </div>
      </div>

      <form className="ligas-admin-block" onSubmit={savePersonalization}>
        <h3 className="ligas-admin-title">Personalización</h3>
        <label className="ligas-field">
          <span>Nombre de la liga (máx. 25 caracteres)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={25} required />
        </label>
        <label className="ligas-field">
          <span>Descripción (máx. 90 caracteres, visible para todos)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={90}
            placeholder="Ej. Solo para el equipo de Ventas"
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
  const isF1Shell = useIsF1AppShell();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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
    if (trimmed.length > 25) {
      setFormError("El nombre no puede superar 25 caracteres.");
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
        discipline: isF1Shell ? "f1" : "football",
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
          Serás el administrador de esta Liga. Agregale un nombre y descripción e invita a quienes quieras agregando sus mails o
          compartiéndoles el código de la liga.
        </p>
        <form onSubmit={handleSubmit} className="ligas-modal-form">
          <label className="ligas-field">
            <span>Nombre</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Ej. "Los Analistas"'
              maxLength={25}
              required
              autoComplete="off"
            />
          </label>
          <label className="ligas-field">
            <span>Descripción (opcional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={90}
              placeholder="Ej. Solo para el equipo de Ventas"
            />
          </label>
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
