import test from "node:test";
import assert from "node:assert/strict";
import {
  areSameGroupMembers,
  isBracketAssignmentValid,
  isGroupFixturePair,
} from "./football-data";

test("isBracketAssignmentValid: Sudáfrica vs Canadá no encaja en 1E vs 3F", () => {
  assert.equal(isBracketAssignmentValid("1E", "3F", "South Africa", "Canada"), false);
});

test("isGroupFixturePair: Cabo Verde vs Arabia Saudita es de grupos", () => {
  assert.equal(isGroupFixturePair("Cape Verde", "Saudi Arabia"), true);
});

test("areSameGroupMembers: Panamá e Inglaterra comparten grupo L", () => {
  assert.equal(areSameGroupMembers("Panama", "England"), true);
});
