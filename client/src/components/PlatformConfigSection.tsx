import AiConfigTab from "./AiConfigTab";
import type { AiConfig, CompanyCompetitionScope, FootballDataSyncStatus } from "../lib/api";
import { scopeLabel } from "../lib/company-competition-scope";

type AiSavePayload = {
  provider?: "openai" | "custom" | "gemini" | "grok" | "groq" | "ollama";
  model?: string;
  baseUrl?: string | null;
  apiKey?: string;
};

const SCOPE_OPTIONS: {
  value: CompanyCompetitionScope;
  title: string;
  description: string;
}[] = [
  {
    value: "all",
    title: "Todas",
    description: "Mundial y F1 disponibles para la empresa.",
  },
  {
    value: "football",
    title: "Solo Mundial",
    description: "Fútbol / Prode FIFA únicamente.",
  },
  {
    value: "f1",
    title: "Solo F1",
    description: "Predicciones de Fórmula 1 únicamente.",
  },
];

type Props = {
  loading: boolean;
  aiConfig: AiConfig | null;
  onSaveAi: (data: AiSavePayload) => Promise<void>;
  defaultScope: CompanyCompetitionScope;
  defaultScopeDraft: CompanyCompetitionScope;
  onDefaultScopeChange: (scope: CompanyCompetitionScope) => void;
  onSaveDefaultScope: (e: React.FormEvent) => void;
  savingDefaultScope: boolean;
  matchSyncStatus: FootballDataSyncStatus | null;
  onGoToOperations?: () => void;
};

export default function PlatformConfigSection({
  loading,
  aiConfig,
  onSaveAi,
  defaultScope,
  defaultScopeDraft,
  onDefaultScopeChange,
  onSaveDefaultScope,
  savingDefaultScope,
  matchSyncStatus,
  onGoToOperations,
}: Props) {
  return (
    <div className="platform-config-page">
      <p className="page-subtitle platform-config-lead">
        Ajustes globales del pool público y políticas que heredan las empresas B2B nuevas. Para cupos y
        competiciones de cada empresa, usá la pestaña <strong>Empresas</strong>.
      </p>

      <div className="platform-config-grid">
        <article className="platform-config-card" id="ia-pool-publico">
          <header className="platform-config-card-head">
            <h3>IA del pool público</h3>
            <p>
              Usuarios en <code className="platform-slug-code">platform-internal</code> (registro público y
              Google). Las empresas B2B configuran su IA en su propio panel admin.
            </p>
          </header>
          {loading ? (
            <p className="placeholder-text">Cargando…</p>
          ) : (
            <AiConfigTab
              embedded
              config={aiConfig}
              title="IA del pool público"
              lead=""
              successMessage="Configuración de IA del pool guardada."
              onSave={onSaveAi}
            />
          )}
        </article>

        <article className="platform-config-card">
          <header className="platform-config-card-head">
            <h3>Competiciones por defecto</h3>
            <p>
              Solo afecta empresas B2B que crees a partir de ahora. Valor actual:{" "}
              <strong>{scopeLabel(defaultScope)}</strong>.
            </p>
          </header>
          <form onSubmit={onSaveDefaultScope} className="platform-scope-form">
            <div className="platform-scope-options" role="radiogroup" aria-label="Competiciones por defecto">
              {SCOPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`platform-scope-option${defaultScopeDraft === opt.value ? " platform-scope-option--selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="defaultCompetitionScope"
                    value={opt.value}
                    checked={defaultScopeDraft === opt.value}
                    onChange={() => onDefaultScopeChange(opt.value)}
                  />
                  <span className="platform-scope-option-title">{opt.title}</span>
                  <span className="platform-scope-option-desc">{opt.description}</span>
                </label>
              ))}
            </div>
            <button type="submit" className="btn-primary" disabled={savingDefaultScope}>
              {savingDefaultScope ? "Guardando…" : "Guardar política"}
            </button>
          </form>
        </article>

        <article className="platform-config-card platform-config-card--wide">
          <header className="platform-config-card-head">
            <h3>Integraciones externas</h3>
            <p>
              Variables de entorno del backend en Railway. La sincronización manual está en la pestaña{" "}
              <strong>Operaciones</strong>.
            </p>
          </header>
          {matchSyncStatus ? (
            <div className="platform-overview-cards platform-config-integration-cards">
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">football-data.org</div>
                <div className="platform-overview-card-value">
                  {matchSyncStatus.apiKeyConfigured ? "Conectada" : "Sin API key"}
                </div>
                <div className="platform-overview-card-sub">
                  <code className="platform-slug-code">FOOTBALL_DATA_API_KEY</code>
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">Auto-sync</div>
                <div className="platform-overview-card-value">
                  {matchSyncStatus.autoSyncEnabled
                    ? `Cada ${matchSyncStatus.autoSyncIntervalMs / 60_000} min`
                    : "Desactivado"}
                </div>
              </div>
              <div className="platform-overview-card">
                <div className="platform-overview-card-label">Partidos con resultado</div>
                <div className="platform-overview-card-value">
                  {matchSyncStatus.matchesWithResult}/{matchSyncStatus.totalMatches}
                </div>
              </div>
            </div>
          ) : (
            <p className="placeholder-text">No se pudo cargar el estado de integraciones.</p>
          )}
          {onGoToOperations ? (
            <button type="button" className="btn-secondary btn-sm platform-config-go-ops" onClick={onGoToOperations}>
              Ir a sincronizar resultados →
            </button>
          ) : null}
        </article>
      </div>
    </div>
  );
}
