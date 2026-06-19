import test from "node:test";
import assert from "node:assert/strict";
import {
  computeProdeBatchOverallStatus,
  finalizeProdeScopeStatus,
  summarizeProdeBatchErrors,
  type ProdeAiScopeDiagnostic,
} from "./ai-generation-batch";

function scope(partial: Partial<ProdeAiScopeDiagnostic> & Pick<ProdeAiScopeDiagnostic, "scopeLabel">): ProdeAiScopeDiagnostic {
  return {
    requested: 2,
    parsed: 0,
    saved: 0,
    status: "ok",
    errors: [],
    ...partial,
  };
}

test("finalizeProdeScopeStatus: ai_error prioriza errores de modelo", () => {
  const d = scope({
    scopeLabel: "Grupo A",
    parsed: 1,
    saved: 1,
    errors: ["ai_error: timeout"],
  });
  assert.equal(finalizeProdeScopeStatus(d), "ai_error");
});

test("computeProdeBatchOverallStatus: parse_failed sin guardados", () => {
  const status = computeProdeBatchOverallStatus([
    scope({ scopeLabel: "Grupo A", requested: 3, parsed: 0, saved: 0, errors: ["parse_failed: vacío"] }),
  ]);
  assert.equal(status, "parse_failed");
});

test("summarizeProdeBatchErrors: une hasta 3 errores", () => {
  const summary = summarizeProdeBatchErrors([
    scope({ scopeLabel: "A", errors: ["e1", "e2"] }),
    scope({ scopeLabel: "B", errors: ["e3", "e4"] }),
  ]);
  assert.equal(summary, "e1 · e2 · e3");
});
