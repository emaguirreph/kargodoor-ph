import assert from "node:assert/strict";
import test from "node:test";
import { niHaoAirQuote, niHaoSeaQuote } from "../../lib/admin/nihao-pricing";
import { estimateNiHaoCost, resolveNiHaoCost } from "../../lib/admin/nihao-estimate";

test("Ni Hao sea rates use the 500 kg/CBM density rule separately from customer pricing", () => {
  const lowValue = niHaoSeaQuote("LOW VALUE GOODS", 1, 501);
  assert.equal(lowValue.base, 7000);
  assert.equal(lowValue.densityApplies, true);
  assert.equal(lowValue.densityCharge, 7014);
  assert.equal(lowValue.final, 7014);
  assert.equal(niHaoSeaQuote("VOLUME GOODS", 1, 500).densityApplies, false);
  assert.equal(niHaoSeaQuote("SENSITIVE - BATTERIES", 1, 400).final, 15000);
  assert.equal(niHaoSeaQuote("SENSITIVE - BATTERIES", 1, 501).final, 15030);
  assert.equal(niHaoSeaQuote("SENSITIVE - CHEMICALS", 1, 501).final, 12024);
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

test("Ni Hao air cost uses billable weight rounded up, or a per-piece rate", () => {
  assert.equal(niHaoAirQuote("Ordinary Items", 0.0381, 7.5, 1).final, 8 * 350);
  assert.equal(niHaoAirQuote("Liquid, Powder, Food, Computer Parts, Electronics", 0.06, 2, 1).final, 11 * 450);
  assert.equal(niHaoAirQuote("Medicine and Food Supplements", 0.001, 3, 1).final, 3 * 500);
  assert.equal(niHaoAirQuote("Mobile Phones", 0, 0, 3).final, 2400);
  assert.equal(niHaoAirQuote("Laptop Computers", 0, 0, 2).final, 4000);
});

test("Ni Hao estimate prices sea and air shipments in centavos and skips what it cannot price", () => {
  assert.deepEqual(estimateNiHaoCost({ serviceType: "Sea Freight", category: "LOW VALUE GOODS", cbm: 1, weight: 100 })?.cost, 700000);
  assert.equal(estimateNiHaoCost({ serviceType: "Sea Freight", category: "COMMODITIES", cbm: 0.04, weight: 5, packageCount: 2 })?.cost, 120000);
  assert.equal(estimateNiHaoCost({ serviceType: "Air Freight", item: "Ordinary Items", cbm: 0.0381, weight: 7.5 })?.cost, 280000);
  assert.match(estimateNiHaoCost({ serviceType: "Air Freight", item: "Ordinary Items", cbm: 0.0381, weight: 7.5 })!.basis, /8 kg × ₱350/);
  assert.equal(estimateNiHaoCost({ serviceType: "FCL", cbm: 30, weight: 1000 }), null);
  assert.equal(estimateNiHaoCost({ serviceType: "Sea Freight", category: "", cbm: 1, weight: 100 }), null);
  assert.equal(estimateNiHaoCost({ serviceType: "Sea Freight", category: "LOW VALUE GOODS", cbm: 0, weight: 100 }), null);
});

test("an edited Ni Hao cost is kept as actual; a blank or untouched one follows the estimate", () => {
  const estimate = { cost: 700000, basis: "" };
  assert.deepEqual(resolveNiHaoCost(null, null, estimate), { cost: 700000, source: "estimate" });
  assert.deepEqual(resolveNiHaoCost(null, null, null), { cost: null, source: null });
  assert.deepEqual(resolveNiHaoCost(650000, null, estimate), { cost: 650000, source: "actual" });
  assert.deepEqual(resolveNiHaoCost(700000, null, estimate), { cost: 700000, source: "estimate" });
  // The size changed, so the old estimate still in the box is replaced by the new one.
  assert.deepEqual(resolveNiHaoCost(500000, { cost: 500000, source: "estimate" }, estimate), { cost: 700000, source: "estimate" });
  // Ni Hao's quote is never replaced, even when the size changes.
  assert.deepEqual(resolveNiHaoCost(500000, { cost: 500000, source: "actual" }, estimate), { cost: 500000, source: "actual" });
  // Clearing the box goes back to the estimate.
  assert.deepEqual(resolveNiHaoCost(null, { cost: 500000, source: "actual" }, estimate), { cost: 700000, source: "estimate" });
});
