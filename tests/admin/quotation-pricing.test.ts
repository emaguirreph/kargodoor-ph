import assert from "node:assert/strict";
import test from "node:test";
import { airQuote, itemCategories, seaQuote } from "../../lib/admin/quotation-pricing";

test("sea package tiers and density rule preserve boundaries", () => {
  assert.equal(seaQuote("LOW VALUE GOODS", .01, 4).final, 250);
  assert.equal(seaQuote("LOW VALUE GOODS", .05, 10).final, 750);
  assert.equal(seaQuote("LOW VALUE GOODS", .125, 20).final, 1400);
  assert.equal(seaQuote("COMMODITIES", 2.2, 500).final, 20900);
  const dense=seaQuote("COMMODITIES", .2, 500);
  assert.equal(dense.packageTier, "KD Max"); assert.equal(dense.final, 11000);
  assert.equal(seaQuote("COMMODITIES", 1, 425).densityApplies, false);
});
test("batteries and chemicals have their own sensitive rates", () => {
  assert.equal(itemCategories["Batteries"], "SENSITIVE - BATTERIES");
  assert.equal(itemCategories["Chemicals"], "SENSITIVE - CHEMICALS");
  assert.equal(seaQuote("SENSITIVE - BATTERIES", 1, 400).final, 16000);
  assert.equal(seaQuote("SENSITIVE - CHEMICALS", 1, 400).final, 13000);
});
test("mobile sea is unit priced and never density priced", () => {
  const quote=seaQuote("MOBILE / COMPUTERS / TABLETS", .5, 500, 10);
  assert.equal(quote.final,7750); assert.equal(quote.densityCharge,0); assert.equal(quote.packageTier,"KD Standard");
});
test("air weight and piece calculations", () => {
  assert.equal(airQuote("Ordinary Items",1,10,1).final,83500);
  assert.equal(airQuote("Liquid, Powder, Food, Computer Parts, Electronics",.2,100,1).final,60000);
  assert.equal(airQuote("Mobile Phones",0,0,20).final,19000);
  assert.equal(airQuote("Tablets",0,0,10).final,12000);
  assert.equal(airQuote("Laptop Computers",0,0,5).final,14000);
});
test("pricing engines reject malformed or missing pricing inputs", () => {
  assert.throws(() => seaQuote("LOW VALUE GOODS", Number.NaN, 10));
  assert.throws(() => seaQuote("MOBILE / COMPUTERS / TABLETS", .5, 10, 0));
  assert.throws(() => airQuote("Ordinary Items", .1, -1, 1));
  assert.throws(() => airQuote("Mobile Phones", 0, 0, 0));
});
test("air recalculates billable weight from changed CBM or actual weight", () => {
  assert.equal(airQuote("Ordinary Items", .1, 10, 1).billableWeight, 17);
  assert.equal(airQuote("Ordinary Items", .1, 30, 1).billableWeight, 30);
});

test("sea density and special-item mappings retain workbook rules",()=>{const smallDense=seaQuote("LOW VALUE GOODS",.01,100);assert.equal(smallDense.densityApplies,true);assert.equal(smallDense.packageTier,"KD Max");assert.equal(itemCategories["Mobile / computer parts & accessories"],"MOBILE / COMPUTERS / TABLETS");for(const item of ["Mobile phones","Computers","Tablets"]){assert.equal(itemCategories[item],"MOBILE / COMPUTERS / TABLETS");assert.equal(seaQuote(itemCategories[item],.5,20,2).final,5750);}});
test("air categories round per-kilogram weights up and retain per-piece pricing",()=>{assert.equal(airQuote("Medicine and Food Supplements",.1,10,1).final,11050);assert.equal(airQuote("Ordinary Items",.01,10,1).billableWeight,10);const fractional=airQuote("Ordinary Items",.5,60,1);assert.equal(fractional.volumetricWeight,83.5);assert.equal(fractional.billableWeight,84);assert.equal(fractional.final,42000);assert.equal(airQuote("Mobile Phones",0,0,1).rate,950);assert.equal(airQuote("Tablets",0,0,1).rate,1200);assert.equal(airQuote("Laptop Computers",0,0,1).rate,2800);assert.throws(()=>airQuote("Ordinary Items",Infinity,1,1));});

test("sea rates from 2026-11-10: KargoDoor price, Ni Hao cost and margin per category", async () => {
  const { niHaoSeaQuote } = await import("../../lib/admin/nihao-pricing");
  const after = "2026-11-10T01:00:00.000Z";
  const cases: [Parameters<typeof seaQuote>[0], number, number][] = [
    ["LOW VALUE GOODS", 8999, 8000],
    ["VOLUME GOODS", 9500, 8500],
    ["COMMODITIES", 10500, 9500],
    ["HIGH VALUE", 12000, 10500],
    ["SENSITIVE - CHEMICALS", 14000, 13000],
    ["SENSITIVE - BATTERIES", 17000, 16000],
  ];
  for (const [category, kd, nh] of cases) {
    for (const cbm of [0.2, 1, 2.5]) {
      const weight = cbm * 200; // below both density thresholds
      assert.equal(seaQuote(category, cbm, weight, 0, after).volumeCharge, cbm * kd, `${category} ${cbm} KD`);
      assert.equal(niHaoSeaQuote(category, cbm, weight, 1, after).final, cbm * nh, `${category} ${cbm} NH`);
    }
  }
  const mobile = seaQuote("MOBILE / COMPUTERS / TABLETS", 1, 100, 2, after);
  assert.equal(mobile.final, 11500 + 500 + 30);
  assert.equal(niHaoSeaQuote("MOBILE / COMPUTERS / TABLETS", 1, 100, 1, after).final, 11000);
});

test("records created before 2026-11-10 (Manila) keep the earlier sea rates", async () => {
  const { niHaoSeaQuote } = await import("../../lib/admin/nihao-pricing");
  const { manilaDate, usesEarlierSeaRates } = await import("../../lib/admin/quotation-pricing");
  // 2026-11-09 15:59 UTC is 23:59 on Nov 9 in Manila; 16:00 UTC is midnight Nov 10.
  assert.equal(manilaDate("2026-11-09T15:59:59.000Z"), "2026-11-09");
  assert.equal(manilaDate("2026-11-09T16:00:00.000Z"), "2026-11-10");
  assert.equal(usesEarlierSeaRates("2026-11-09T15:59:59.000Z"), true);
  assert.equal(usesEarlierSeaRates("2026-11-09T16:00:00.000Z"), false);
  assert.equal(usesEarlierSeaRates(undefined), manilaDate() < "2026-11-10");
  const old = "2026-11-05T03:00:00.000Z";
  assert.equal(seaQuote("COMMODITIES", 2, 400, 0, old).final, 2 * 9500 + 30);
  assert.equal(seaQuote("COMMODITIES", 2, 400, 0, "2026-11-10").final, 2 * 10500 + 30);
  assert.equal(seaQuote("SENSITIVE - BATTERIES", 1, 400, 0, old).final, 16030);
  assert.equal(seaQuote("MOBILE / COMPUTERS / TABLETS", 1, 100, 2, old).final, 10500 + 500 + 30);
  assert.equal(niHaoSeaQuote("LOW VALUE GOODS", 1, 200, 1, old).final, 7000);
  // Small-package tiers, the ₱1,700 minimum and density rates do not change.
  for (const date of [old, "2026-11-10"]) {
    assert.equal(seaQuote("HIGH VALUE", 0.01, 1, 0, date).final, 280);
    assert.equal(seaQuote("HIGH VALUE", 0.05, 1, 0, date).final, 780);
    assert.equal(seaQuote("HIGH VALUE", 0.125, 1, 0, date).final, 1430);
    assert.equal(seaQuote("LOW VALUE GOODS", 0.13, 1, 0, date).final, 1730);
    assert.equal(seaQuote("COMMODITIES", 0.2, 500, 0, date).densityCharge, 500 * 22);
    assert.equal(niHaoSeaQuote("COMMODITIES", 0.2, 500, 1, date).densityCharge, 500 * 17);
  }
});
