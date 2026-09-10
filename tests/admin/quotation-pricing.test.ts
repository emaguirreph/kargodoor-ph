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

test("sea density, high-value mappings, and special items retain workbook rules",()=>{const smallDense=seaQuote("LOW VALUE GOODS",.01,100);assert.equal(smallDense.densityApplies,true);assert.equal(smallDense.packageTier,"KD Max");const high=seaQuote(itemCategories["Mobile / computer parts & accessories"],1,500);assert.equal(high.final,13000);for(const item of ["Mobile phones","Computers","Tablets"]){assert.equal(itemCategories[item],"MOBILE / COMPUTERS / TABLETS");assert.equal(seaQuote(itemCategories[item],.5,20,2).final,5750);}});
test("air categories retain actual, volumetric, rounded, and per-piece pricing",()=>{assert.equal(airQuote("Medicine and Food Supplements",.1,10,1).final,8500);assert.equal(airQuote("Ordinary Items",.01,10,1).billableWeight,10);assert.equal(airQuote("Ordinary Items",.011,1,1).billableWeight,2);assert.throws(()=>airQuote("Ordinary Items",Infinity,1,1));});
