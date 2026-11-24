import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { blogCaption, fbLibrary, fbRotation } from "../lib/admin/fb-library";
import { insights } from "../lib/insights";
import { manilaDate, planStart, unixFor } from "../lib/admin/fb-posts";
import { getSeaEstimate, getAirEstimate } from "../lib/shipping-estimate.mjs";

test("Manila time helpers", () => {
  // 2026-11-24 19:00 Manila = 11:00 UTC
  assert.equal(unixFor("2026-11-24", "19:00"), Date.UTC(2026, 10, 24, 11, 0) / 1000);
  assert.equal(manilaDate(Date.UTC(2026, 10, 24, 16, 30)), "2026-11-25");
  // 10 AM Manila: today's 7 PM is still ahead
  assert.equal(planStart(Date.UTC(2026, 10, 24, 2, 0)), "2026-11-24");
  // 6:50 PM Manila: too close to 7 PM, start tomorrow
  assert.equal(planStart(Date.UTC(2026, 10, 24, 10, 50)), "2026-11-25");
});

test("post library: cards, captions and rates", () => {
  const keys = new Set<string>();
  for (const item of fbLibrary) {
    assert.ok(!keys.has(item.key), `duplicate key ${item.key}`);
    keys.add(item.key);
    assert.ok(existsSync(`public/fb-cards/${item.key}.jpg`), `missing card for ${item.key} (run scripts/make-fb-cards.mjs)`);
    assert.ok(item.lines.length >= 2 && item.lines.length <= 5, item.key);
    assert.ok(!/\*\*|__|^#\s/m.test(item.caption), `no markdown in ${item.key}`);
    assert.ok(!item.caption.includes("0917"), `old phone number in ${item.key}`);
    assert.ok(item.caption.length < 2000, item.key);
  }
  for (const c of fbRotation) if (c !== "Blog") assert.ok(fbLibrary.some((i) => i.category === c), `no posts for ${c}`);
  // Numbers used in the rate posts match the real rates.
  assert.equal(getSeaEstimate(0.05, 10).amount, 750);
  assert.equal(getSeaEstimate(0.01, 2).amount, 250);
  assert.equal(getSeaEstimate(0.1, 10).amount, 1400);
  assert.equal(getSeaEstimate(1, 150).amount, 7999);
  assert.equal(getAirEstimate(10).amount, 5000);
  assert.equal(getAirEstimate(150).amount, 75000);
});

test("No links in captions, and every Blog article has its card", () => {
  // Facebook allows Pages only 2 link posts a month without Meta One (2026-11-24).
  const link = /https?:\/\/|kargodoorph\.com|www\./i;
  for (const item of fbLibrary) assert.ok(!link.test(item.caption), `${item.key} caption has a link`);
  assert.ok(!link.test(blogCaption("Title", "Description")));
  assert.ok(existsSync("public/fb-cards/blog.jpg"));
  for (const i of insights) assert.ok(existsSync(`public/fb-cards/blog-${i.slug}.jpg`), `missing card for ${i.slug}`);
});
