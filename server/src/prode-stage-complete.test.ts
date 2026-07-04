import assert from "node:assert/strict";
import test from "node:test";
import { isProdeStageComplete } from "./prode-stage-complete";

test("isProdeStageComplete: true cuando todos tienen resultado oficial", () => {
  const now = new Date("2026-07-05T12:00:00Z");
  assert.equal(
    isProdeStageComplete(
      [
        { kickoffAt: new Date("2026-06-28T19:00:00Z"), resultScoreA: 2, resultScoreB: 1 },
        { kickoffAt: new Date("2026-07-04T19:00:00Z"), resultScoreA: 0, resultScoreB: 0 },
      ],
      now
    ),
    true
  );
});

test("isProdeStageComplete: true cuando todos jugaron y cerró la ventana", () => {
  const now = new Date("2026-07-05T12:00:00Z");
  assert.equal(
    isProdeStageComplete(
      [{ kickoffAt: new Date("2026-07-04T19:00:00Z"), resultScoreA: null, resultScoreB: null }],
      now
    ),
    true
  );
});

test("isProdeStageComplete: false si queda un partido con ventana abierta", () => {
  const now = new Date("2026-07-04T17:00:00Z");
  assert.equal(
    isProdeStageComplete(
      [
        { kickoffAt: new Date("2026-06-28T19:00:00Z"), resultScoreA: 1, resultScoreB: 0 },
        { kickoffAt: new Date("2026-07-04T19:00:00Z"), resultScoreA: null, resultScoreB: null },
      ],
      now
    ),
    false
  );
});

test("isProdeStageComplete: false sin partidos", () => {
  assert.equal(isProdeStageComplete([]), false);
});
