import test from "node:test";
import assert from "node:assert/strict";
import { scoreFootballMatchPoints } from "./leaderboard";

test("scoreFootballMatchPoints: exacto = 3", () => {
  assert.equal(scoreFootballMatchPoints(2, 1, 2, 1), 3);
});

test("scoreFootballMatchPoints: ganador y diferencia = 2", () => {
  assert.equal(scoreFootballMatchPoints(2, 1, 3, 2), 2);
  assert.equal(scoreFootballMatchPoints(1, 1, 0, 0), 2);
});

test("scoreFootballMatchPoints: solo ganador = 1", () => {
  assert.equal(scoreFootballMatchPoints(2, 1, 3, 1), 1);
  assert.equal(scoreFootballMatchPoints(2, 1, 3, 0), 1);
});

test("scoreFootballMatchPoints: fallo = 0", () => {
  assert.equal(scoreFootballMatchPoints(2, 1, 1, 2), 0);
  assert.equal(scoreFootballMatchPoints(1, 1, 2, 1), 0);
});

test("scoreFootballMatchPoints: sin resultado = 0", () => {
  assert.equal(scoreFootballMatchPoints(2, 1, null, 1), 0);
});
