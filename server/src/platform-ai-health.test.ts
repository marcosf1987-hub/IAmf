import test from "node:test";
import assert from "node:assert/strict";
import { classifyAiBatch } from "./platform-ai-health";

test("classifyAiBatch: sin guardados es failed", () => {
  assert.equal(classifyAiBatch(1, 0), "failed");
  assert.equal(classifyAiBatch(5, 0), "failed");
});

test("classifyAiBatch: un prompt y guardados es ok", () => {
  assert.equal(classifyAiBatch(1, 3), "ok");
});

test("classifyAiBatch: varios prompts y guardados es partial", () => {
  assert.equal(classifyAiBatch(2, 1), "partial");
  assert.equal(classifyAiBatch(7, 4), "partial");
});
