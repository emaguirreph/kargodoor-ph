import assert from "node:assert/strict";
import test from "node:test";
import { niHaoSeaQuote } from "../../lib/admin/nihao-pricing";

test("Ni Hao sea rates use the 500 kg/CBM density rule separately from customer pricing", () => {
  const lowValue = niHaoSeaQuote("LOW VALUE GOODS", 1, 501);
  assert.equal(lowValue.base, 7000);
  assert.equal(lowValue.densityApplies, true);
  assert.equal(lowValue.densityCharge, 7014);
  assert.equal(lowValue.final, 7014);
  assert.equal(niHaoSeaQuote("VOLUME GOODS", 1, 500).densityApplies, false);
  assert.equal(niHaoSeaQuote("SENSITIVE GOODS", 1, 501).final, 12024);
});

test("Ni Hao small packages compare their base with density pricing", () => {
  assert.equal(niHaoSeaQuote("LOW VALUE GOODS", 0.01, 1).final, 200);
  assert.equal(niHaoSeaQuote("LOW VALUE GOODS", 0.01, 10).final, 200);
  assert.equal(niHaoSeaQuote("VOLUME GOODS", 0.05, 30).final, 600);
  assert.equal(niHaoSeaQuote("COMMODITIES", 0.125, 100).final, 1700);
  assert.equal(niHaoSeaQuote("COMMODITIES", 0.125, 200).final, 3400);
  assert.equal(niHaoSeaQuote("LOW VALUE GOODS", 0.01, 10, 2).base, 400);
});

test("Ni Hao mobile, computers, and tablets are density exempt", () => {
  const quote = niHaoSeaQuote("MOBILE / COMPUTERS / TABLETS", 0.01, 100);
  assert.equal(quote.densityApplies, false);
  assert.equal(quote.densityCharge, 0);
  assert.equal(quote.final, 200);
  assert.equal(niHaoSeaQuote("MOBILE / COMPUTERS / TABLETS", 1, 1000).final, 10000);
});
