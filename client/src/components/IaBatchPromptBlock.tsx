import type { BatchPromptLine } from "../lib/api";

const PAUTAS_MARKER_LEGACY = "TENÉ EN CUENTA ESTAS PAUTAS DEL USUARIO: ";
const PAUTAS_BLOCK_START = "--- PAUTAS DEL USUARIO (toda esta etapa) ---\n";

/** Pautas embebidas en prompts del Prode / Mundial. */
export function extractMundialGuidelinesFromPrompt(promptText: string): string | null {
  const newIdx = promptText.indexOf(PAUTAS_BLOCK_START);
  if (newIdx !== -1) {
    const after = promptText.slice(newIdx + PAUTAS_BLOCK_START.length);
    const end = after.indexOf("\n---\n");
    const raw = end >= 0 ? after.slice(0, end) : after;
    const t = raw.trim();
    return t.length > 0 ? t : null;
  }
  const idx = promptText.indexOf(PAUTAS_MARKER_LEGACY);
  if (idx === -1) return null;
  const after = promptText.slice(idx + PAUTAS_MARKER_LEGACY.length);
  const end = after.indexOf("\n\nResponde");
  const raw = end >= 0 ? after.slice(0, end) : after;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

const F1_PAUTAS_BLOCK = "--- PAUTAS DEL USUARIO (Laboratorio F1) ---\n";

/** Pautas embebidas en prompts de predicción top-10 F1. */
export function extractF1GuidelinesFromPrompt(promptText: string): string | null {
  const i = promptText.indexOf(F1_PAUTAS_BLOCK);
  if (i === -1) return null;
  const after = promptText.slice(i + F1_PAUTAS_BLOCK.length);
  const j = after.indexOf("\n---\n");
  const raw = j >= 0 ? after.slice(0, j) : after;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

export type IaBatchPromptBlockProps = {
  lines?: BatchPromptLine[];
  /** Por defecto extractor Mundial (Prode). */
  extractGuidelines?: (promptText: string) => string | null;
  /** Sustituye la leyenda del bloque de prompt completo. */
  fullPromptDetailLabel?: string;
  /** Texto de respuesta del modelo (p. ej. una sola llamada F1). */
  responseText?: string | null;
};

export function IaBatchPromptBlock({
  lines,
  extractGuidelines,
  fullPromptDetailLabel,
  responseText,
}: IaBatchPromptBlockProps) {
  if (!lines?.length) {
    return (
      <div className="ia-batch-prompt-block ia-batch-prompt-block--empty">
        <p className="ia-batch-prompt-note">
          No hay texto de prompt guardado para este lote (generaciones anteriores a esta función, o migración{" "}
          <code>batchId</code> en PromptLog sin aplicar).
        </p>
      </div>
    );
  }

  const resolveGuidelines = extractGuidelines ?? extractMundialGuidelinesFromPrompt;
  const sample = lines[0];
  const guidelines = resolveGuidelines(sample.promptText);
  const isChampionOnlySample = sample.promptText.includes("campeón y subcampeón");
  const fullLabel =
    fullPromptDetailLabel ??
    (isChampionOnlySample
      ? "Texto completo — campeón/subcampeón"
      : "Texto completo — primer partido del lote (cada partido repite la misma lógica y pautas)");

  const showResponse = typeof responseText === "string" && responseText.length > 0;

  return (
    <div className="ia-batch-prompt-block">
      <h4 className="ia-batch-prompt-subtitle">Prompt enviado a la IA</h4>
      {guidelines != null ? (
        <>
          <p className="ia-batch-prompt-label">Pautas del Laboratorio (en esa ejecución)</p>
          <pre className="ia-batch-prompt-pre">{guidelines}</pre>
        </>
      ) : null}
      <p className="ia-batch-prompt-label">{fullLabel}</p>
      <pre className="ia-batch-prompt-pre ia-batch-prompt-pre--full">{sample.promptText}</pre>
      {lines.length > 1 && (
        <details className="ia-batch-prompt-details">
          <summary>Ver los {lines.length} prompts de este lote</summary>
          <ol className="ia-batch-prompt-all">
            {lines.map((l, i) => (
              <li key={`${l.createdAt}-${i}`}>
                <pre className="ia-batch-prompt-pre">{l.promptText}</pre>
              </li>
            ))}
          </ol>
        </details>
      )}
      {showResponse ? (
        <>
          <p className="ia-batch-prompt-label">Respuesta de la IA</p>
          <pre className="ia-batch-prompt-pre ia-batch-prompt-pre--full">{responseText}</pre>
        </>
      ) : null}
    </div>
  );
}
