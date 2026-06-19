import test from "node:test";
import assert from "node:assert/strict";
import { mergePlatformTimeSeries } from "./platform-time-series";

test("mergePlatformTimeSeries: acumula por día", () => {
  const data = mergePlatformTimeSeries(
    [{ d: new Date("2026-01-01"), c: BigInt(2) }],
    [
      { d: new Date("2026-01-01"), c: BigInt(1) },
      { d: new Date("2026-01-02"), c: BigInt(3) },
    ],
    [{ d: new Date("2026-01-02"), c: BigInt(5) }]
  );
  assert.equal(data.length, 2);
  assert.deepEqual(data[0], { date: "2026-01-01", users: 2, prompts: 1, logins: 0 });
  assert.deepEqual(data[1], { date: "2026-01-02", users: 2, prompts: 4, logins: 5 });
});
