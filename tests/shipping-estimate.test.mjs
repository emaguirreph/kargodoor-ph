import assert from "node:assert/strict";
import test from "node:test";
import { getSeaEstimate } from "../lib/shipping-estimate.mjs";

test("small-package rates remain the minimum when the density charge is lower", () => {
  assert.deepEqual(getSeaEstimate(0.05, 24), {
    packageName: "KD Lite",
    amount: 750,
  });
});

test("small-package density charges become KD Max only when they exceed the minimum", () => {
  assert.deepEqual(getSeaEstimate(0.05, 40), {
    packageName: "KD Max",
    amount: 760,
  });
});
