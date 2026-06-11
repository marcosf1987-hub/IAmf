import test from "node:test";
import assert from "node:assert/strict";
import { parseAiBatchScoresJson, parseAiScore } from "./ai-parse";

const MATCHES = [
  { id: "cm111aaa", teamA: "Mexico", teamB: "South Africa" },
  { id: "cm222bbb", teamA: "South Korea", teamB: "Czech Republic" },
  { id: "cm333ccc", teamA: "Czech Republic", teamB: "South Africa" },
];
const IDS = new Set(MATCHES.map((m) => m.id));

test("parseAiScore: 2-1 simple", () => {
  assert.deepEqual(parseAiScore("2-1"), { scoreA: 2, scoreB: 1 });
});

test("parseAiScore: texto con marcador", () => {
  assert.deepEqual(parseAiScore("Creo que termina 2-1 por la defensa"), { scoreA: 2, scoreB: 1 });
});

test("parseAiScore: 2 a 1", () => {
  assert.deepEqual(parseAiScore("2 a 1"), { scoreA: 2, scoreB: 1 });
});

test("parseAiScore: sin numeros devuelve null", () => {
  assert.equal(parseAiScore("Sin resultado claro"), null);
});

test("parseAiBatchScoresJson: JSON plano con ids", () => {
  const m = parseAiBatchScoresJson(
    '{"cm111aaa":{"scoreA":2,"scoreB":1},"cm222bbb":{"scoreA":0,"scoreB":0}}',
    IDS,
    MATCHES
  );
  assert.equal(m.size, 2);
  assert.deepEqual(m.get("cm111aaa"), { scoreA: 2, scoreB: 1 });
});

test("parseAiBatchScoresJson: anidado en predictions", () => {
  const m = parseAiBatchScoresJson(
    '{"predictions":{"cm111aaa":"2-1","cm222bbb":{"scoreA":1,"scoreB":1}}}',
    IDS,
    MATCHES
  );
  assert.equal(m.size, 2);
});

test("parseAiBatchScoresJson: array con matchId", () => {
  const m = parseAiBatchScoresJson(
    '[{"matchId":"cm111aaa","scoreA":3,"scoreB":0},{"matchId":"cm222bbb","scoreA":1,"scoreB":2}]',
    IDS,
    MATCHES
  );
  assert.equal(m.size, 2);
  assert.deepEqual(m.get("cm111aaa"), { scoreA: 3, scoreB: 0 });
});

test("parseAiBatchScoresJson: markdown fence", () => {
  const m = parseAiBatchScoresJson(
    '```json\n{"cm111aaa":{"scoreA":1,"scoreB":0}}\n```',
    new Set(["cm111aaa"]),
    [MATCHES[0]!]
  );
  assert.equal(m.size, 1);
});

test("parseAiBatchScoresJson: texto antes del JSON", () => {
  const m = parseAiBatchScoresJson(
    'Aqui van mis predicciones: {"cm111aaa":{"scoreA":2,"scoreB":2}}',
    new Set(["cm111aaa"]),
    [MATCHES[0]!]
  );
  assert.equal(m.size, 1);
});

test("parseAiBatchScoresJson: claves numericas 1,2,3 (Groq/Llama)", () => {
  const m = parseAiBatchScoresJson(
    '{"1":{"scoreA":2,"scoreB":1},"2":{"scoreA":1,"scoreB":0},"3":{"scoreA":0,"scoreB":0}}',
    IDS,
    MATCHES
  );
  assert.equal(m.size, 3);
  assert.deepEqual(m.get("cm111aaa"), { scoreA: 2, scoreB: 1 });
  assert.deepEqual(m.get("cm222bbb"), { scoreA: 1, scoreB: 0 });
});

test("parseAiBatchScoresJson: claves por nombre de equipos", () => {
  const m = parseAiBatchScoresJson(
    '{"Mexico vs South Africa":{"scoreA":2,"scoreB":1},"South Korea vs Czech Republic":"1-0"}',
    IDS,
    MATCHES
  );
  assert.equal(m.size, 2);
  assert.deepEqual(m.get("cm111aaa"), { scoreA: 2, scoreB: 1 });
  assert.deepEqual(m.get("cm222bbb"), { scoreA: 1, scoreB: 0 });
});

test("parseAiBatchScoresJson: array sin matchId pero con equipos", () => {
  const m = parseAiBatchScoresJson(
    '[{"teamA":"Mexico","teamB":"South Africa","score":"2-1"},{"teamA":"South Korea","teamB":"Czech Republic","scoreA":1,"scoreB":1}]',
    IDS,
    MATCHES
  );
  assert.equal(m.size, 2);
});

test("parseAiBatchScoresJson: texto plano multilinea", () => {
  const text = [
    "Mexico 2-1 South Africa",
    "South Korea 1-1 Czech Republic",
    "Czech Republic 0-0 South Africa",
  ].join("\n");
  const m = parseAiBatchScoresJson(text, IDS, MATCHES);
  assert.equal(m.size, 3);
  assert.deepEqual(m.get("cm111aaa"), { scoreA: 2, scoreB: 1 });
});

test("parseAiBatchScoresJson: solo 2-1 en batch de 3 no asigna nada sin contexto de equipos", () => {
  const m = parseAiBatchScoresJson("2-1", IDS, []);
  assert.equal(m.size, 0);
});

test("parseAiBatchScoresJson: JSON vacio", () => {
  assert.equal(parseAiBatchScoresJson("{}", IDS, MATCHES).size, 0);
});

test("parseAiBatchScoresJson: home/away en objeto", () => {
  const m = parseAiBatchScoresJson(
    '{"cm111aaa":{"home":2,"away":1}}',
    new Set(["cm111aaa"]),
    [MATCHES[0]!]
  );
  assert.deepEqual(m.get("cm111aaa"), { scoreA: 2, scoreB: 1 });
});
