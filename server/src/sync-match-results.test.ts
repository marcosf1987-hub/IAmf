import test from "node:test";
import assert from "node:assert/strict";
import { buildSyncMatchResultsHttpBody, type SyncMatchResultsResult } from "./sync-match-results";

test("buildSyncMatchResultsHttpBody incluye diagnóstico en message", () => {
  const result: SyncMatchResultsResult = {
    updated: 2,
    totalApi: 104,
    apiMatchesConsidered: 104,
    teamsResolved: 0,
    pendingInDb: 50,
    skippedFetch: false,
    diagnostics: {
      finishedInApi: 3,
      matched: 3,
      scoresWritten: 2,
      teamsFilled: 0,
      skippedNoMatch: 0,
      skippedNoScore: 1,
      samples: [],
    },
  };

  const body = buildSyncMatchResultsHttpBody(result);
  assert.equal(body.ok, true);
  assert.equal(body.updated, 2);
  assert.equal(body.diagnostics.scoresWritten, 2);
  assert.match(body.message, /2 marcadores escritos/);
  assert.match(body.message, /1 sin marcador/);
});
