import assert from "node:assert/strict";
import test from "node:test";
import { airQuote, seaQuote } from "../../lib/admin/quotation-pricing";

test("sea package tiers and density rule preserve boundaries", () => {
  assert.equal(seaQuote("LOW VALUE GOODS", .01, 4).final, 250);
  assert.equal(seaQuote("LOW VALUE GOODS", .05, 10).final, 750);
  assert.equal(seaQuote("LOW VALUE GOODS", .125, 20).final, 1400);
  assert.equal(seaQuote("COMMODITIES", 2.2, 500).final, 20900);
  const dense=seaQuote("COMMODITIES", .2, 500);
  assert.equal(dense.packageTier, "KD Max"); assert.equal(dense.final, 11000);
  assert.equal(seaQuote("COMMODITIES", 1, 425).densityApplies, false);
});
test("mobile sea is unit priced and never density priced", () => {
  const quote=seaQuote("MOBILE / COMPUTERS / TABLETS", .5, 500, 10);
  assert.equal(quote.final,7750); assert.equal(quote.densityCharge,0); assert.equal(quote.packageTier,"KD Standard");
});
test("air weight and piece calculations", () => {
  assert.equal(airQuote("Ordinary Items",1,10,1).final,58450);
  assert.equal(airQuote("Liquid, Powder, Food, Computer Parts, Electronics",.2,100,1).final,45000);
  assert.equal(airQuote("Mobile Phones",0,0,20).final,16000);
  assert.equal(airQuote("Tablets",0,0,10).final,10000);
  assert.equal(airQuote("Laptop Computers",0,0,5).final,10000);
});