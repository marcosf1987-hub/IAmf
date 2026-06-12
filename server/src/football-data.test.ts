import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalTeamName,
  findUniqueOurMatchByTeams,
  getMatchScore,
  mapScoreToOurMatch,
  resolveOurMatchFromApi,
  teamsPairEqual,
  type FootballDataMatch,
  type OurMatch,
} from "./football-data";

function apiMatch(
  partial: Partial<FootballDataMatch> & Pick<FootballDataMatch, "homeTeam" | "awayTeam">
): FootballDataMatch {
  return {
    id: 1,
    utcDate: "2026-06-11T19:00:00Z",
    status: "FINISHED",
    score: {
      fullTime: { homeTeam: 2, awayTeam: 0 },
      regularTime: { homeTeam: 2, awayTeam: 0 },
    },
    ...partial,
  };
}

const mexicoSouthAfricaOur: OurMatch = {
  id: "m1",
  teamA: "Mexico",
  teamB: "South Africa",
  kickoffAt: new Date("2026-06-11T19:00:00Z"),
};

test("canonicalTeamName: ignora acentos y mayúsculas", () => {
  assert.equal(canonicalTeamName("México"), canonicalTeamName("Mexico"));
  assert.equal(canonicalTeamName("SOUTH AFRICA"), canonicalTeamName("South Africa"));
});

test("teamsPairEqual: respeta orden home/away invertido", () => {
  assert.equal(teamsPairEqual("Mexico", "South Africa", "Mexico", "South Africa"), true);
  assert.equal(teamsPairEqual("Mexico", "South Africa", "South Africa", "Mexico"), true);
  assert.equal(teamsPairEqual("Mexico", "South Africa", "Mexico", "Korea Republic"), false);
});

test("getMatchScore: FINISHED y AWARDED con marcador", () => {
  const finished = apiMatch({
    homeTeam: { id: 1, name: "Mexico" },
    awayTeam: { id: 2, name: "South Africa" },
  });
  assert.deepEqual(getMatchScore(finished), { home: 2, away: 0 });

  const awarded = apiMatch({
    status: "AWARDED",
    homeTeam: { id: 1, name: "Mexico" },
    awayTeam: { id: 2, name: "South Africa" },
  });
  assert.deepEqual(getMatchScore(awarded), { home: 2, away: 0 });
});

test("getMatchScore: SCHEDULED sin marcador", () => {
  const scheduled = apiMatch({
    status: "SCHEDULED",
    score: { fullTime: { homeTeam: null, awayTeam: null } },
    homeTeam: { id: 1, name: "Mexico" },
    awayTeam: { id: 2, name: "South Africa" },
  });
  assert.equal(getMatchScore(scheduled), null);
});

test("mapScoreToOurMatch: orden teamA/teamB en BD", () => {
  const match = apiMatch({
    homeTeam: { id: 1, name: "Mexico" },
    awayTeam: { id: 2, name: "South Africa" },
  });
  assert.deepEqual(mapScoreToOurMatch(match, { teamA: "Mexico", teamB: "South Africa" }), {
    scoreA: 2,
    scoreB: 0,
  });
  assert.deepEqual(mapScoreToOurMatch(match, { teamA: "South Africa", teamB: "Mexico" }), {
    scoreA: 0,
    scoreB: 2,
  });
});

test("resolveOurMatchFromApi: empareja con nombres acentuados en API", () => {
  const match = apiMatch({
    homeTeam: { id: 1, name: "México" },
    awayTeam: { id: 2, name: "South Africa" },
  });
  const resolved = resolveOurMatchFromApi(match, [mexicoSouthAfricaOur]);
  assert.equal(resolved?.kind, "exact");
  assert.equal(resolved?.ourMatch.id, "m1");
});

test("resolveOurMatchFromApi: fallback por par único si kickoff difiere", () => {
  const match = apiMatch({
    utcDate: "2026-06-12T01:00:00Z",
    homeTeam: { id: 1, name: "Mexico" },
    awayTeam: { id: 2, name: "South Africa" },
  });
  const our = {
    ...mexicoSouthAfricaOur,
    kickoffAt: new Date("2026-06-11T19:00:00Z"),
  };
  const resolved = resolveOurMatchFromApi(match, [our], 60_000);
  assert.equal(resolved?.kind, "exact");
  assert.equal(resolved?.ourMatch.id, "m1");
});

test("findUniqueOurMatchByTeams: solo cuando el cruce es único", () => {
  const match = apiMatch({
    homeTeam: { id: 1, name: "Mexico" },
    awayTeam: { id: 2, name: "South Africa" },
  });
  assert.equal(findUniqueOurMatchByTeams(match, [mexicoSouthAfricaOur])?.id, "m1");
  assert.equal(
    findUniqueOurMatchByTeams(match, [
      mexicoSouthAfricaOur,
      { id: "m2", teamA: "Mexico", teamB: "South Africa", kickoffAt: new Date("2026-06-25T01:00:00Z") },
    ]),
    null
  );
});
