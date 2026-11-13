import assert from "node:assert/strict";
import test from "node:test";
import { niHaoAirQuote, niHaoSeaQuote } from "../../lib/admin/nihao-pricing";
import { estimateNiHaoCost, resolveNiHaoCost } from "../../lib/admin/nihao-estimate";

/** Expected amounts below use the Ni Hao sea costs before 2026-11-10. */
const OLD = "2026-11-05";

test("Ni Hao sea rates use the 500 kg/CBM density rule separately from customer pricing", () => {
  const lowValue = niHaoSeaQuote("LOW VALUE GOODS", 1, 501, 1, OLD);
  assert.equal(lowValue.base, 7000);
  assert.equal(lowValue.densityApplies, true);
  assert.equal(lowValue.densityCharge, 7014);
  assert.equal(lowValue.final, 7014);
  assert.equal(niHaoSeaQuote("VOLUME GOODS", 1, 500, 1, OLD).densityApplies, false);
  assert.equal(niHaoSeaQuote("SENSITIVE - BATTERIES", 1, 400, 1, OLD).final, 15000);
  assert.equal(niHaoSeaQuote("SENSITIVE - BATTERIES", 1, 501, 1, OLD).final, 15030);
  assert.equal(niHaoSeaQuote("SENSITIVE - CHEMICALS", 1, 501, 1, OLD).final, 12024);
});

test("Ni Hao small packages compare their base with density pricing", () => {
  assert.equal(niHaoSeaQuote("LOW VALUE GOODS", 0.01, 1, 1, OLD).final, 200);
  assert.equal(niHaoSeaQuote("LOW VALUE GOODS", 0.01, 10, 1, OLD).final, 200);
  assert.equal(niHaoSeaQuote("VOLUME GOODS", 0.05, 30, 1, OLD).final, 600);
  assert.equal(niHaoSeaQuote("COMMODITIES", 0.125, 100, 1, OLD).final, 1700);
  assert.equal(niHaoSeaQuote("COMMODITIES", 0.125, 200, 1, OLD).final, 3400);
  assert.equal(niHaoSeaQuote("LOW VALUE GOODS", 0.01, 10, 2, OLD).base, 400);
});

test("Ni Hao mobile, computers, and tablets were density exempt before 2026-11-10", () => {
  const quote = niHaoSeaQuote("MOBILE / COMPUTERS / TABLETS", 0.01, 100, 1, OLD);
  assert.equal(quote.densityApplies, false);
  assert.equal(quote.densityCharge, 0);
  assert.equal(quote.final, 200);
  assert.equal(niHaoSeaQuote("MOBILE / COMPUTERS / TABLETS", 1, 1000, 1, OLD).final, 10000);
});

test("Ni Hao air cost uses billable weight rounded up, or a per-piece rate", () => {
  assert.equal(niHaoAirQuote("Ordinary Items", 0.0381, 7.5, 1).final, 8 * 350);
  assert.equal(niHaoAirQuote("Liquid, Powder, Food, Computer Parts, Electronics", 0.06, 2, 1).final, 11 * 450);
  assert.equal(niHaoAirQuote("Medicine and Food Supplements", 0.001, 3, 1).final, 3 * 500);
  assert.equal(niHaoAirQuote("Mobile Phones", 0, 0, 3).final, 2400);
  assert.equal(niHaoAirQuote("Laptop Computers", 0, 0, 2).final, 4000);
});

test("Ni Hao estimate prices sea and air shipments in centavos and skips what it cannot price", () => {
  assert.deepEqual(estimateNiHaoCost({ serviceType: "Sea Freight", category: "LOW VALUE GOODS", cbm: 1, weight: 100, pricingDate: OLD })?.cost, 700000);
  assert.equal(estimateNiHaoCost({ serviceType: "Sea Freight", category: "COMMODITIES", cbm: 0.04, weight: 5, packageCount: 2, pricingDate: OLD })?.cost, 120000);
  assert.equal(estimateNiHaoCost({ serviceType: "Air Freight", item: "Ordinary Items", cbm: 0.0381, weight: 7.5 })?.cost, 280000);
  assert.match(estimateNiHaoCost({ serviceType: "Air Freight", item: "Ordinary Items", cbm: 0.0381, weight: 7.5 })!.basis, /8 kg × ₱350/);
  assert.equal(estimateNiHaoCost({ serviceType: "FCL", cbm: 30, weight: 1000 }), null);
  assert.equal(estimateNiHaoCost({ serviceType: "Sea Freight", category: "", cbm: 1, weight: 100, pricingDate: OLD }), null);
  assert.equal(estimateNiHaoCost({ serviceType: "Sea Freight", category: "LOW VALUE GOODS", cbm: 0, weight: 100, pricingDate: OLD }), null);
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

test("Ni Hao sea costs from 2026-11-10 and the estimate follow the record date", () => {
  const NEW = "2026-11-10";
  assert.equal(niHaoSeaQuote("LOW VALUE GOODS", 1, 400, 1, NEW).final, 8000);
  assert.equal(niHaoSeaQuote("SENSITIVE - BATTERIES", 1, 400, 1, NEW).final, 16000);
  assert.equal(niHaoSeaQuote("SENSITIVE - CHEMICALS", 1, 501, 1, NEW).final, 13026, "density 501 × ₱26 is above the CBM cost");
  assert.equal(niHaoSeaQuote("MOBILE / COMPUTERS / TABLETS", 1, 400, 1, NEW).final, 11000);
  assert.equal(niHaoSeaQuote("MOBILE / COMPUTERS / TABLETS", 1, 1000, 1, NEW).final, 22000, "Nov 13 table: ₱22/kg above 500 kg/CBM");
  assert.equal(niHaoSeaQuote("COMMODITIES", 0.125, 200, 1, NEW).final, 3800, "Plus tier unchanged; new density rate ₱19/kg");
  assert.equal(estimateNiHaoCost({ serviceType: "Sea Freight", category: "HIGH VALUE", cbm: 2, weight: 300, pricingDate: NEW })?.cost, 2100000);
  assert.equal(estimateNiHaoCost({ serviceType: "Sea Freight", category: "HIGH VALUE", cbm: 2, weight: 300, pricingDate: OLD })?.cost, 1900000);
});
