import { useEffect, useState } from "react";
import { formatApiError } from "../lib/api";

export type AiProvider = "openai" | "custom" | "gemini" | "grok" | "groq" | "ollama";

const PROVIDER_MODEL_OPTIONS: Record<AiProvider, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
  grok: [
    { value: "grok-2-1212", label: "Grok 2 1212" },
    { value: "grok-2", label: "Grok 2" },
    { value: "grok-beta", label: "Grok Beta" },
  ],
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    { value: "gemma2-9b-it", label: "Gemma 2 9B" },
  ],
  ollama: [
    { value: "llama2", label: "Llama 2" },
    { value: "llama3", label: "Llama 3" },
    { value: "mistral", label: "Mistral" },
    { value: "gemma", label: "Gemma" },
    { value: "phi", label: "Phi" },
    { value: "codellama", label: "Code Llama" },
  ],
  custom: [],
};

export type AiConfigTabProps = {
  config: { provider: string; model: string; baseUrl: string | null; hasApiKey: boolean } | null;
  onSave: (data: {
    provider?: AiProvider;
    model?: string;
    baseUrl?: string | null;
    apiKey?: string;
  }) => Promise<void>;
  /** Texto bajo el título */
  lead?: string;
  /** Título de sección */
  title?: string;
  /** Mensaje de éxito al guardar */
  successMessage?: string;
  /** Sin wrapper admin-section ni h2 (para cards embebidas) */
  embedded?: boolean;
};

export default function AiConfigTab({
  config,
  onSave,
  lead = "Elige el proveedor y configura la API key para que el chat funcione con esta IA.",
  title = "Configuración de IA",
  successMessage = "Configuración guardada. El chat usará esta IA.",
  embedded = false,
}: AiConfigTabProps) {
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (config) {
      setProvider((config.provider as AiProvider) || "openai");
      const opts = PROVIDER_MODEL_OPTIONS[config.provider as AiProvider];
      const valid = opts?.some((o) => o.value === config.model);
      setModel(config.model && valid ? config.model : opts?.[0]?.value ?? config.model ?? "gpt-4o-mini");
      setBaseUrl(config.baseUrl || "");
    }
  }, [config]);

  useEffect(() => {
    if (provider !== "custom") {
      const opts = PROVIDER_MODEL_OPTIONS[provider];
      const valid = opts?.some((o) => o.value === model);
      if (!valid && opts.length > 0) setModel(opts[0].value);
    }
  }, [provider]);

  function getDefaultModel() {
    const opts = PROVIDER_MODEL_OPTIONS[provider];
    return opts?.[0]?.value ?? "gpt-4o-mini";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    setSubmitting(true);
    try {
      await onSave({
        provider,
        model: model.trim() || getDefaultModel(),
        baseUrl:
          provider === "custom"
            ? baseUrl.trim() || null
            : provider === "ollama"
              ? baseUrl.trim() || "http://localhost:11434/v1"
              : null,
        apiKey: apiKey.trim() || undefined,
      });
      setApiKey("");
      setOk(successMessage);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const formBody = (
    <>
      {err && <div className="auth-error">{err}</div>}
      {ok && <div className="auth-success">{ok}</div>}
      {config ? (
        <div className="platform-config-status-chips" aria-label="Configuración activa">
          <span className="platform-config-chip">{config.provider}</span>
          <span className="platform-config-chip">{config.model}</span>
          <span className={`platform-config-chip ${config.hasApiKey ? "platform-config-chip--ok" : "platform-config-chip--warn"}`}>
            API key {config.hasApiKey ? "✓" : "pendiente"}
          </span>
        </div>
      ) : null}
      <form onSubmit={(e) => void handleSubmit(e)} className="admin-form platform-config-form">
        <label>
          <span>Proveedor</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
            <option value="ollama">Ollama (local, gratis)</option>
            <option value="groq">Groq (gratis, Llama/Mixtral)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="gemini">Google Gemini</option>
            <option value="grok">xAI Grok</option>
            <option value="custom">API compatible (OpenAI)</option>
          </select>
        </label>
        {(provider === "custom" || provider === "ollama") && (
          <label>
            <span>URL base</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={provider === "ollama" ? "http://localhost:11434/v1" : "https://api.ejemplo.com/v1"}
            />
          </label>
        )}
        <label>
          <span>Modelo</span>
          {provider === "custom" ? (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
            />
          ) : (
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {(() => {
                const opts = PROVIDER_MODEL_OPTIONS[provider];
                const hasCurrent = opts.some((o) => o.value === model);
                return (
                  <>
                    {!hasCurrent && model && <option value={model}>{model}</option>}
                    {opts.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </>
                );
              })()}
            </select>
          )}
        </label>
        {provider !== "ollama" && (
          <label>
            <span>API Key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                config?.hasApiKey
                  ? "•••••••• (dejar vacío para mantener)"
                  : provider === "gemini"
                    ? "Google AI Studio"
                    : provider === "grok"
                      ? "console.x.ai"
                      : provider === "groq"
                        ? "console.groq.com"
                        : "sk-..."
              }
              autoComplete="off"
            />
            {provider === "gemini" && (
              <small className="form-hint">Obtén la clave en Google AI Studio (aistudio.google.com)</small>
            )}
            {provider === "grok" && <small className="form-hint">Obtén la clave en console.x.ai</small>}
            {provider === "groq" && (
              <small className="form-hint">Obtén la clave gratis en console.groq.com (tier gratuito)</small>
            )}
          </label>
        )}
        {provider === "ollama" && (
          <p className="form-hint" style={{ marginTop: 0 }}>
            Sin API key. Instala Ollama (ollama.com), ejecuta <code>ollama run llama2</code> y usa el chat.
          </p>
        )}
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Guardando…" : "Guardar"}
        </button>
      </form>
      {config?.hasApiKey && !embedded ? (
        <p className="page-subtitle" style={{ marginTop: "1rem" }}>
          Configuración activa. El chat usa el modelo {config.model}.
        </p>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="platform-config-embedded">{formBody}</div>;
  }

  return (
    <div className="admin-section">
      <h2>{title}</h2>
      {lead ? <p className="page-subtitle">{lead}</p> : null}
      {formBody}
    </div>
  );
}
