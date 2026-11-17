import assert from "node:assert/strict";
import { test } from "node:test";
import { applySpecialDiscount, discountAmount, discountLabel, maxDiscountPercent } from "../../lib/admin/special-discount";
import { invoiceMessages } from "../../lib/admin/customer-messages";

test("special discount is any % off the base fee, never the ₱30 transfer fee", () => {
  assert.equal(discountAmount(53000, 3000, 10), 5000);
  assert.equal(discountAmount(53000, 3000, 20), 10000);
  assert.equal(discountAmount(53000, 3000, 0), 0);
  assert.equal(discountAmount(53000, 3000, 12.5), 6300); // ₱62.50 → ₱63
  // Rounded to a whole peso: 10% of ₱1,234.50 base = ₱123.45 → ₱123.
  assert.equal(discountAmount(126450, 3000, 10), 12300);
});

test("special discount keeps at least 10% gross margin", () => {
  // Air, ₱530 charge, Ni Hao ₱350: 20% off leaves (₱430 − ₱350) / ₱430 = 18.6%.
  assert.deepEqual(applySpecialDiscount({ grossCharge: 53000, transferFee: 3000, percent: 20, niHaoCost: 35000 }), { percent: 20, amount: 10000, netCharge: 43000 });
  assert.equal(maxDiscountPercent(53000, 3000, 35000), 28);
  assert.equal(applySpecialDiscount({ grossCharge: 53000, transferFee: 3000, percent: 12.5, niHaoCost: 35000 }).netCharge, 46700);
  // Sea, 0.36 CBM: ₱3,630 vs Ni Hao ₱3,060. 10% off (₱360) leaves 6.4%, below 10%; 6% is the most.
  assert.throws(() => applySpecialDiscount({ grossCharge: 363000, transferFee: 3000, percent: 10, niHaoCost: 306000 }), /leaves 6.4% gross margin.*most you can give on this shipment is 6%/);
  assert.equal(maxDiscountPercent(363000, 3000, 306000), 6);
  // Margin already under 10%: no discount at all.
  assert.throws(() => applySpecialDiscount({ grossCharge: 340000, transferFee: 3000, percent: 1, niHaoCost: 306000 }), /too thin/);
  assert.equal(maxDiscountPercent(340000, 3000, 306000), 0);
  // 20% too much: says the most allowed (₱1,030 vs Ni Hao ₱750 → 19.5%).
  assert.throws(() => applySpecialDiscount({ grossCharge: 103000, transferFee: 3000, percent: 20, niHaoCost: 75000 }), /leaves 9.6% gross margin.*most you can give on this shipment is 19.5%/);
  assert.equal(applySpecialDiscount({ grossCharge: 103000, transferFee: 3000, percent: 19.5, niHaoCost: 75000 }).amount, 19500);
  // No Ni Hao cost: can't check, so no discount.
  assert.throws(() => applySpecialDiscount({ grossCharge: 53000, transferFee: 3000, percent: 10, niHaoCost: null }), /Enter the Ni Hao cost/);
  // No discount needs no Ni Hao cost.
  assert.deepEqual(applySpecialDiscount({ grossCharge: 53000, transferFee: 3000, percent: 0, niHaoCost: null }), { percent: 0, amount: 0, netCharge: 53000 });
});

test("invoice message shows the fee before discount and the discount only when there is one", () => {
  const [, , withDiscount] = invoiceMessages({ customerName: "Ana", shippingFee: 48000, discount: 5000, discountLabel: "Special discount 10%", total: 48000 })[0]!;
  assert.match(withDiscount, /Shipping Fee: ₱530\.00\nSpecial discount 10%: -₱50\.00/);
  const [, , plain] = invoiceMessages({ customerName: "Ana", shippingFee: 53000, total: 53000 })[0]!;
  assert.match(plain, /Shipping Fee: ₱530\.00/);
  assert.ok(!/discount/i.test(plain));
});

test("special discount label keeps the typed percent", () => {
  assert.equal(discountLabel(12.5), "Special discount 12.5%");
  assert.equal(discountLabel(10), "Special discount 10%");
});

test("additional fee counts as income in the 10% margin check", () => {
  // Air ₱530, Ni Hao ₱350 + 100 RMB (≈₱800) = ₱1,150; customer also pays ₱850 large-shipment fee.
  // Without the fee there is no margin at all; with it, (₱1,380 − ₱1,150) / ₱1,380 = 16.7% before discount.
  assert.equal(maxDiscountPercent(53000, 3000, 115000), 0);
  // 20% off (₱100) leaves (₱1,280 − ₱1,150) / ₱1,280 = 10.2%; 25% would go under.
  assert.equal(maxDiscountPercent(53000, 3000, 115000, 85000), 20);
  assert.throws(() => applySpecialDiscount({ grossCharge: 53000, transferFee: 3000, percent: 25, niHaoCost: 115000, additionalFee: 85000 }), /most you can give on this shipment is 20%/);
});

test("invoice message names the additional fee", () => {
  const [, , body] = invoiceMessages({ customerName: "Ana", shippingFee: 53000, otherCharge: 85000, otherChargeLabel: "Large shipment fee", total: 138000 })[0]!;
  assert.match(body, /Large shipment fee: ₱850\.00/);
});
