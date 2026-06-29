import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalTeamName,
  findUniqueOurMatchByTeams,
  getMatchScore,
  isBracketAssignmentValid,
  isGroupFixturePair,
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
  stage: "group",
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

test("isGroupFixturePair: detecta cruces de fase de grupos", () => {
  assert.equal(isGroupFixturePair("Panama", "England"), true);
  assert.equal(isGroupFixturePair("Mexico", "Canada"), false);
});

test("isBracketAssignmentValid: rechaza rivales del mismo grupo en slot 1A vs 2B", () => {
  assert.equal(isBracketAssignmentValid("1A", "2B", "Panama", "England"), false);
  assert.equal(isBracketAssignmentValid("1A", "2B", "Mexico", "Canada"), true);
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

test("getMatchScore: v4 usa home/away en lugar de homeTeam/awayTeam", () => {
  const v4 = apiMatch({
    score: {
      fullTime: { home: 2, away: 0 },
      regularTime: { home: 2, away: 0 },
    },
    homeTeam: { id: 1, name: "Mexico" },
    awayTeam: { id: 2, name: "South Africa" },
  });
  assert.deepEqual(getMatchScore(v4), { home: 2, away: 0 });
  assert.deepEqual(mapScoreToOurMatch(v4, { teamA: "Mexico", teamB: "South Africa" }), {
    scoreA: 2,
    scoreB: 0,
  });
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
  const resolved = resolveOurMatchFromApi(match, [our]);
  assert.equal(resolved?.kind, "exact");
  assert.equal(resolved?.ourMatch.id, "m1");
});

test("resolveOurMatchFromApi: ignora partidos API con nombre null sin lanzar error", () => {
  const match = apiMatch({
    homeTeam: { id: 1, name: null },
    awayTeam: { id: 2, name: "South Africa" },
  });
  assert.equal(resolveOurMatchFromApi(match, [mexicoSouthAfricaOur]), null);
  assert.doesNotThrow(() => resolveOurMatchFromApi(match, [mexicoSouthAfricaOur]));
});

test("canonicalTeamName: null o vacío devuelve cadena vacía", () => {
  assert.equal(canonicalTeamName(null), "");
  assert.equal(canonicalTeamName(""), "");
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
      {
        id: "m2",
        teamA: "Mexico",
        teamB: "South Africa",
        kickoffAt: new Date("2026-06-25T01:00:00Z"),
        stage: "group",
      },
    ]),
    null
  );
});

test("resolveOurMatchFromApi: rellena placeholder de 16avos con equipos válidos para el slot", () => {
  const api = apiMatch({
    utcDate: "2026-06-28T19:05:00Z",
    status: "SCHEDULED",
    stage: "LAST_32",
    score: undefined,
    homeTeam: { id: 10, name: "Mexico" },
    awayTeam: { id: 11, name: "Canada" },
  });
  const our: OurMatch[] = [
    {
      id: "r32-a",
      teamA: "1A",
      teamB: "2B",
      kickoffAt: new Date("2026-06-28T19:00:00Z"),
      stage: "roundOf32",
    },
    {
      id: "r32-b",
      teamA: "1C",
      teamB: "3D",
      kickoffAt: new Date("2026-06-28T23:00:00Z"),
      stage: "roundOf32",
    },
  ];
  const resolved = resolveOurMatchFromApi(api, our);
  assert.equal(resolved?.kind, "fill_teams");
  assert.equal(resolved?.ourMatch.id, "r32-a");
  if (resolved?.kind === "fill_teams") {
    assert.equal(resolved.teamA, "Mexico");
    assert.equal(resolved.teamB, "Canada");
  }
});

test("resolveOurMatchFromApi: no asigna partido de grupos a slot de 16avos", () => {
  const api = apiMatch({
    utcDate: "2026-06-28T19:05:00Z",
    status: "FINISHED",
    stage: "GROUP_STAGE",
    score: { fullTime: { home: 0, away: 2 }, regularTime: { home: 0, away: 2 } },
    homeTeam: { id: 10, name: "Panama" },
    awayTeam: { id: 11, name: "England" },
  });
  const our: OurMatch[] = [
    {
      id: "group-l",
      teamA: "Panama",
      teamB: "England",
      kickoffAt: new Date("2026-06-27T21:00:00Z"),
      stage: "group",
    },
    {
      id: "r32-a",
      teamA: "1A",
      teamB: "2B",
      kickoffAt: new Date("2026-06-28T19:00:00Z"),
      stage: "roundOf32",
    },
  ];
  const resolved = resolveOurMatchFromApi(api, our);
  assert.equal(resolved?.kind, "exact");
  assert.equal(resolved?.ourMatch.id, "group-l");
});

test("resolveOurMatchFromApi: sin fila de grupo pendiente, no rellena 16avos con rivales de grupo", () => {
  const api = apiMatch({
    utcDate: "2026-06-28T19:05:00Z",
    status: "FINISHED",
    score: { fullTime: { home: 0, away: 2 }, regularTime: { home: 0, away: 2 } },
    homeTeam: { id: 10, name: "Panama" },
    awayTeam: { id: 11, name: "England" },
  });
  const our: OurMatch[] = [
    {
      id: "r32-a",
      teamA: "1A",
      teamB: "2B",
      kickoffAt: new Date("2026-06-28T19:00:00Z"),
      stage: "roundOf32",
    },
  ];
  assert.equal(resolveOurMatchFromApi(api, our), null);
});
