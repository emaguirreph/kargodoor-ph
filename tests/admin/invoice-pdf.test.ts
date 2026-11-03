import assert from "node:assert/strict";
import test from "node:test";
import { customerInvoicePdf } from "../../lib/admin/invoice-pdf";

const invoice = {
  invoice_number: "INV-20261102-DA201FBC", issued_at: "2026-11-02", status: "Unpaid",
  full_name: "Michaela Juan", company_name: "Example Co", customer_code: "KDOOR-5560", mobile: "09175098267",
  tracking_number: "KDAIR-466471", service_type: "Air Freight", china_warehouse: "Tongda Air Cargo",
  cbm: 0.009, weight_kg: 2, verified_cbm: 0.009, verified_weight_kg: 1, cargo_item: "Daily necessities", cargo_quantity: 3,
  subtotal: 53000, delivery_charge: 23100, other_charge: 0, total: 76100, nihao_cost: 35000,
};
const read = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

test("unpaid invoice PDF shows charges, amount due and how to pay", () => {
  const pdf = read(customerInvoicePdf({ invoice, payments: [] }));
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /\/Count 1/);
  assert.match(pdf, /\/Filter \/DCTDecode/);
  for (const text of ["INVOICE", "INV-20261102-DA201FBC", "Michaela Juan", "0917 509 8267", "Air freight, China to Manila", "1 kg verified", "530.00", "231.00", "761.00", "AMOUNT DUE", "How to pay", "0021 7001 7106", "0919 932 3077"]) {
    assert.ok(pdf.includes(text), text);
  }
  assert.ok(!pdf.includes("Payment received"));
  assert.ok(!pdf.includes("350.00"), "Ni Hao cost must never reach the customer");
});

test("paid invoice PDF becomes a receipt with zero balance and no payment instructions", () => {
  const pdf = read(customerInvoicePdf({ invoice: { ...invoice, status: "Paid" }, payments: [{ date: "2026-11-03", method: "GCash", reference: "GC123", amount: 76100 }] }));
  for (const text of ["PAID", "BALANCE DUE", "0.00", "Payment received. Salamat!", "3 Nov 2026", "GCash", "GC123"]) assert.ok(pdf.includes(text), text);
  assert.ok(!pdf.includes("How to pay"));
});

test("partial invoice PDF shows the remaining balance and both payment boxes", () => {
  const pdf = read(customerInvoicePdf({ invoice: { ...invoice, status: "Partial", full_name: "José Peña" }, payments: [{ date: "2026-11-01", method: "UnionBank", reference: "", amount: 30000 }] }));
  for (const text of ["PARTIAL", "461.00", "How to pay", "Payments received", "Jos\\351 Pe\\361a"]) assert.ok(pdf.includes(text), text);
});
