import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, csvRow, platformExportFilename } from "./platform-exports";

test("csvCell: escapa comillas", () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(null), '""');
});

test("csvRow: une celdas", () => {
  assert.equal(csvRow(["a", 1, true]), '"a","1","true"');
});

test("platformExportFilename: con y sin rango", () => {
  assert.equal(platformExportFilename("platform_users"), "platform_users.csv");
  const name = platformExportFilename("platform_users", {
    from: new Date("2026-01-01T00:00:00.000Z"),
    to: new Date("2026-01-31T23:59:59.999Z"),
  });
  assert.equal(name, "platform_users_2026-01-01_2026-01-31.csv");
});
