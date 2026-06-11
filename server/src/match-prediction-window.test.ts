import test from "node:test";
import assert from "node:assert/strict";
import {
  getPredictionLockAt,
  isMatchPredictionOpen,
  filterOpenMatches,
  PREDICTION_LOCK_MS_BEFORE_KICKOFF,
} from "./match-prediction-window";

test("getPredictionLockAt: 1h antes del kickoff", () => {
  const kickoff = new Date("2026-06-11T19:00:00Z");
  const lock = getPredictionLockAt(kickoff);
  assert.equal(lock.toISOString(), "2026-06-11T18:00:00.000Z");
});

test("isMatchPredictionOpen: abierto antes del cierre", () => {
  const kickoff = "2026-06-11T19:00:00Z";
  const now = new Date("2026-06-11T17:59:00Z");
  assert.equal(isMatchPredictionOpen(kickoff, now), true);
});

test("isMatchPredictionOpen: cerrado en el pitazo", () => {
  const kickoff = "2026-06-11T19:00:00Z";
  const now = new Date("2026-06-11T19:00:00Z");
  assert.equal(isMatchPredictionOpen(kickoff, now), false);
});

test("isMatchPredictionOpen: cerrado 1h antes exacta", () => {
  const kickoff = "2026-06-11T19:00:00Z";
  const now = new Date("2026-06-11T18:00:00Z");
  assert.equal(isMatchPredictionOpen(kickoff, now), false);
});

test("filterOpenMatches", () => {
  const matches = [
    { id: "a", kickoffAt: "2026-06-11T19:00:00Z" },
    { id: "b", kickoffAt: "2026-06-25T01:00:00Z" },
  ];
  const now = new Date("2026-06-11T19:30:00Z");
  const open = filterOpenMatches(matches, now);
  assert.equal(open.length, 1);
  assert.equal(open[0]!.id, "b");
});

test("PREDICTION_LOCK_MS_BEFORE_KICKOFF es 1 hora", () => {
  assert.equal(PREDICTION_LOCK_MS_BEFORE_KICKOFF, 3_600_000);
});
