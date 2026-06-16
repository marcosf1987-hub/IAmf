import test from "node:test";
import assert from "node:assert/strict";
import { guidelinesRowHasContent } from "./platform-metrics";

test("guidelinesRowHasContent: fase fútbol con texto", () => {
  assert.equal(
    guidelinesRowHasContent({
      userId: "u1",
      textGroups: "Argentina gana",
      textRoundOf32: "",
      textKnockout: "",
      f1RaceGuidelines: {},
    }),
    true
  );
});

test("guidelinesRowHasContent: pautas F1 en JSON", () => {
  assert.equal(
    guidelinesRowHasContent({
      userId: "u1",
      textGroups: "",
      textRoundOf32: "",
      textKnockout: "",
      f1RaceGuidelines: { "9158": "Verstappen P1" },
    }),
    true
  );
});

test("guidelinesRowHasContent: vacío", () => {
  assert.equal(
    guidelinesRowHasContent({
      userId: "u1",
      textGroups: "  ",
      textRoundOf32: "",
      textKnockout: "",
      f1RaceGuidelines: {},
    }),
    false
  );
});
