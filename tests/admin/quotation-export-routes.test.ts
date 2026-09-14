import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const affectedId = "81510a99-26a2-4211-ae06-25fc4cdfa72c";
const validator = /^[\da-f-]{36}$/i;

for (const route of [
  "app/admin/quotations/export/route.ts",
  "app/admin/quotations/image/route.ts",
]) {
  test(route + " accepts UUID quotation IDs containing digits", () => {
    const source = readFileSync(route, "utf8");

    assert.match(source, /\^\[\\da-f-\]\{36\}\$\/i\.test\(id\)/);
    assert.ok(validator.test(affectedId));
    assert.ok(!validator.test("81510a99-26a2-4211-ae06-25fc4cdfa72"));
  });
}
