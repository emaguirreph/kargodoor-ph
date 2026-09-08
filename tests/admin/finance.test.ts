import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import { financeDashboard, readFinanceSummary, financePesos } from "../../lib/admin/finance-summary";
import { financeRange, philippineToday } from "../../lib/admin/finance-dates";
import { finance, marginSummarySql } from "../../lib/admin/reports";

const now = new Date("2026-09-08T16:30:00Z");
const all = { from: "", to: "" };
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of ["0001_phase1.sql", "0002_freight_cost.sql", "0003_invoices_payments.sql", "0004_public_tracking.sql", "0005_expenses.sql"])
    sql.exec(readFileSync(`migrations/admin/${file}`, "utf8"));
  sql.exec("INSERT INTO customers VALUES ('c','KDOOR0001','Test customer',NULL,'12345',NULL,NULL,NULL,'2026-01-01','2026-01-01')");
  const queries: string[] = [];
  const db = { prepare(query: string) {
    queries.push(query);
    assert.match(query.trim(), /^SELECT\b/i, "dashboard database access must be SELECT only");
    let args: (string | number | null)[] = [];
    return {
      bind(...values: (string | number | null)[]) { args = values; return this; },
      async first() { return sql.prepare(query).get(...args) ?? null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { throw new Error("Dashboard attempted a write"); },
    };
  } } as unknown as D1Database;
  function shipment(charge = BigInt(0), cost: bigint | null = null, date: string | null = "2026-09-08", status = "In Transit", created = "2026-09-01T16:30:00Z") {
    const id = randomUUID();
    sql.prepare(`INSERT INTO shipments (id,customer_id,tracking_number,service_type,china_warehouse,cbm,weight_kg,status,
      shipping_charge,delivery_charge,payment_status,created_at,updated_at,nihao_cost,warehouse_received_date)
      VALUES (?,'c',?,'Sea Freight','Guangzhou',1,1,?,?,0,'Unpaid',?,?,?,?)`)
      .run(id, id, status, charge, created, created, cost, date);
    return id;
  }
  function invoice(total = BigInt(1000000), date: string | null = "2026-09-08", status = "Unpaid", other = BigInt(0), sid = shipment()) {
    const id = randomUUID();
    sql.prepare(`INSERT INTO invoices (id,invoice_number,customer_id,shipment_id,subtotal,delivery_charge,total,status,issued_at,created_at,updated_at,other_charge)
      VALUES (?,?,'c',?,?,0,?,?,?,'2026-09-08','2026-09-08',?)`).run(id, id, sid, total, total, status, date, other);
    return id;
  }
  function payment(id: string, amount: bigint, date = "2026-09-08") {
    sql.prepare("INSERT INTO payments VALUES (?,?,'c',?,'Cash',NULL,?,NULL,'2026-09-08')").run(randomUUID(), id, amount, date);
  }
  function expense(amount: bigint, category = "Office / Rent", date = "2026-09-08") {
    sql.prepare(`INSERT INTO expenses (id,category,description,amount,expense_date,created_at,updated_at) VALUES (?,?,'Test expense',?,?,'then','then')`)
      .run(randomUUID(), category, amount, date);
  }
  return { sql, db, queries, shipment, invoice, payment, expense };
}

test("finance dashboard dates: Philippine boundary, presets, one-sided, same-day and invalid ranges", () => {
  assert.equal(philippineToday(now), "2026-09-09");
  const range = (q: string, clock = now) => financeRange(new URL(`https://test/admin/finance?${q}`), clock);
  assert.deepEqual(range("preset=month"), { from: "2026-09-01", to: "2026-09-09" });
  assert.deepEqual(range("preset=last-month"), { from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(range("preset=year"), { from: "2026-01-01", to: "2026-09-09" });
  assert.deepEqual(range("preset=all&from=2026-01-01"), all);
  assert.deepEqual(range("preset=last-month", new Date("2026-01-01T00:00:00Z")), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(range("preset=last-month", new Date("2024-03-01T00:00:00Z")), { from: "2024-02-01", to: "2024-02-29" });
  assert.deepEqual(range("from=2026-09-08"), { from: "2026-09-08", to: "" });
  assert.deepEqual(range("to=2026-09-08"), { from: "", to: "2026-09-08" });
  assert.deepEqual(range("from=2026-09-08&to=2026-09-08"), { from: "2026-09-08", to: "2026-09-08" });
  for (const query of ["from=2026-09-09&to=2026-09-08", "from=2026-02-30", "preset=no", "from=bad", "to=2026-09-08&to=2026-09-09"])
    assert.throws(() => range(query));
});

test("finance dashboard empty page, presets and validation perform zero writes", async () => {
  const f = fixture();
  const changes = f.sql.prepare("SELECT total_changes() AS n").get()!.n;
  for (const q of ["", "preset=all", "preset=month", "preset=last-month", "preset=year", "from=2026-09-08", "to=2026-09-08", "from=2026-09-08&to=2026-09-08"]) {
    const response = await financeDashboard(f.db, new URL(`https://test/admin/finance?${q}`), "Admin", now);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    const html = await response.text();
    assert.ok((html.match(/₱0.00/g) ?? []).length >= 9);
    assert.match(html, /<strong>Shipments<\/strong>[\s\S]*?<strong>0<\/strong>/);
    for (const label of ["This Month", "Last Month", "This Year", "All Time", "Freight Margin", "Expenses"]) assert.ok(html.includes(label));
  }
  await assert.rejects(financeDashboard(f.db, new URL("https://test/admin/finance?from=2026-09-09&to=2026-09-08"), "Admin", now), /From Date/);
  assert.equal(f.sql.prepare("SELECT total_changes() AS n").get()!.n, changes);
});

test("finance dashboard scenarios A B C: revenue/cash separation, AR and no duplicate freight expense", async () => {
  const f = fixture();
  const sid = f.shipment(BigInt(1000000), BigInt(700000));
  const id = f.invoice(BigInt(1000000), "2026-09-08", "Partial", BigInt(0), sid);
  f.payment(id, BigInt(400000));
  f.expense(BigInt(100000));
  f.expense(BigInt(700000), "Freight / Ni Hao Cost");
  const before = f.sql.prepare("SELECT total_changes() AS n").get()!.n;
  const s = await readFinanceSummary(f.db, all, now);
  assert.equal(s.revenue, BigInt(1000000));
  assert.equal(s.received, BigInt(400000));
  assert.equal(s.receivable, BigInt(600000));
  assert.equal(s.costs, BigInt(700000));
  assert.equal(s.charges, BigInt(1000000));
  assert.equal(s.margin, BigInt(300000));
  assert.equal(s.operating, BigInt(100000));
  assert.equal(s.profit, BigInt(200000));
  assert.equal(s.shipments, BigInt(1));
  assert.equal(f.sql.prepare("SELECT total_changes() AS n").get()!.n, before);
});

test("finance overview tables, expense breakdown, actions and formulas use Phase 3A values", async () => {
  const f = fixture();
  const sid = f.shipment(BigInt(1000000), BigInt(700000));
  const id = f.invoice(BigInt(1000000), "2026-09-08", "Partial", BigInt(0), sid);
  f.payment(id, BigInt(400000));
  f.expense(BigInt(200000), "Marketing / Advertising");
  f.expense(BigInt(700000), "Freight / Ni Hao Cost");
  f.expense(BigInt(300000), "Utilities", "2026-08-31");
  const before = await readFinanceSummary(f.db, { from: "2026-09-01", to: "2026-09-30" }, now);
  const changes = f.sql.prepare("SELECT total_changes() AS n").get()!.n;
  const html = await (await financeDashboard(f.db,
    new URL("https://test/admin/finance?from=2026-09-01&to=2026-09-30"), "Admin", now)).text();
  assert.equal(f.sql.prepare("SELECT total_changes() AS n").get()!.n, changes);
  for (const heading of ["Finance Overview", "Cash &amp; Receivables", "Shipping Performance",
    "Operating Expenses", "How the Numbers Are Calculated"]) assert.ok(html.includes(`<h2>${heading}</h2>`));
  assert.ok(html.includes("Reporting period:") && html.includes("September 1, 2026–September 30, 2026"));
  const expectedMetrics: [string, bigint][] = [["Revenue", before.revenue], ["Payments Received", before.received],
    ["Accounts Receivable", before.receivable], ["Ni Hao Freight Cost", before.costs],
    ["Freight Margin", before.margin], ["Operating Expenses", before.operating],
    ["Net Profit / (Loss)", before.profit]];
  for (const [label, value] of expectedMetrics) {
    assert.ok(html.includes(label));
    assert.ok(html.includes(financePesos(value)));
  }
  assert.ok(html.includes("Freight Charges") && html.includes(financePesos(before.charges)));
  assert.ok(html.includes('href="/admin/finance/expenses?new=1">+ Add Expense</a>'));
  assert.ok(html.includes('href="/admin/finance/expenses">View Expenses</a>'));
  assert.ok(html.includes("Marketing / Advertising") && html.includes("Ads, promotions"));
  assert.ok(html.includes("Freight / Ni Hao Cost") && html.includes("Excluded from Operating Expense total"));
  assert.ok(!html.includes("Utilities"), "out-of-range category is omitted");
  assert.equal((html.match(/Marketing \/ Advertising/g) ?? []).length, 1);
  for (const wording of ["Eligible Invoice Revenue", "Actual Payments Received",
    "Eligible Invoice Balance − Payments Applied", "KargoDoor Freight Charges − Ni Hao Freight Cost",
    "Business Expenses − Freight / Ni Hao Cost category", "Revenue − Ni Hao Freight Cost − Operating Expenses",
    "Revenue and Payments Received are different", "This prevents double counting"]) assert.ok(html.includes(wording));
});

test("finance dashboard scenarios D E: marketing included; Draft and Void excluded", async () => {
  const f = fixture();
  f.expense(BigInt(200000), "Marketing / Advertising");
  f.invoice(BigInt(5000000), "2026-09-08", "Void");
  f.invoice(BigInt(5000000), "2026-09-08", "Draft");
  const s = await readFinanceSummary(f.db, all, now);
  assert.equal(s.revenue, BigInt(0));
  assert.equal(s.receivable, BigInt(0));
  assert.equal(s.operating, BigInt(200000));
  assert.equal(s.profit, BigInt(-200000));
  const html = await (await financeDashboard(f.db, new URL("https://test/admin/finance"), "Admin", now)).text();
  assert.ok(html.includes("-₱2,000.00"));
});

test("finance dashboard invoice grand total includes delivery and other charge exactly once", async () => {
  const f = fixture();
  const id = f.invoice(BigInt(1050000), "2026-09-08", "Paid", BigInt(2500));
  f.sql.prepare("UPDATE invoices SET subtotal=1000000,delivery_charge=50000 WHERE id=?").run(id);
  // A Paid status without payment rows must not invent collections.
  const s = await readFinanceSummary(f.db, all, now);
  assert.equal(s.revenue, BigInt(1052500));
  assert.equal(s.received, BigInt(0));
  assert.equal(s.receivable, BigInt(1052500));
});

test("finance dashboard range boundaries and AR as-of cutoff ignore From Date", async () => {
  const f = fixture();
  const id = f.invoice(BigInt(1000000), "2026-08-31");
  f.payment(id, BigInt(400000), "2026-09-08");
  f.payment(id, BigInt(700000), "2026-09-10");
  f.expense(BigInt(10), "Old category", "2026-09-08");
  f.expense(BigInt(20), "Utilities", "2026-09-09");
  f.expense(BigInt(40), "Utilities", "2026-09-10");
  const same = await readFinanceSummary(f.db, { from: "2026-09-08", to: "2026-09-08" }, now);
  assert.equal(same.revenue, BigInt(0));
  assert.equal(same.received, BigInt(400000));
  assert.equal(same.receivable, BigInt(600000));
  assert.equal(same.operating, BigInt(10));
  const endOnly = await readFinanceSummary(f.db, { from: "", to: "2026-09-08" }, now);
  assert.equal(endOnly.revenue, BigInt(1000000));
  assert.equal(endOnly.receivable, same.receivable);
  const fromOnly = await readFinanceSummary(f.db, { from: "2026-09-09", to: "" }, now);
  assert.equal(fromOnly.operating, BigInt(60));
  assert.equal(fromOnly.receivable, BigInt(600000));
  const current = await readFinanceSummary(f.db, all, now);
  assert.equal(current.receivable, BigInt(600000), "All Time AR uses today's Philippine cutoff");
  assert.equal(current.received, BigInt(1100000), "All Time period metrics have no end cutoff");
  const later = await readFinanceSummary(f.db, { from: "2026-09-09", to: "2026-09-10" }, now);
  assert.equal(later.receivable, BigInt(0), "overpayments clamp per invoice");
  assert.equal(later.operating, BigInt(60));
});

test("finance dashboard freight source matches original, including missing/zero costs, loss and cancellation", async () => {
  const f = fixture();
  f.shipment(BigInt(100), null);
  f.shipment(BigInt(100), BigInt(0));
  f.shipment(BigInt(50), BigInt(100));
  f.shipment(BigInt(9000), BigInt(8000), "2026-09-08", "Cancelled");
  const s = await readFinanceSummary(f.db, all, now);
  const original = f.sql.prepare(marginSummarySql).get()!;
  assert.equal(s.costs, BigInt(String(original.costs)));
  assert.equal(s.margin, BigInt(String(original.margin)));
  assert.equal(s.shipments, BigInt(3));
  assert.equal(s.uncosted, BigInt(1));
  const html = await (await financeDashboard(f.db, new URL("https://test/admin/finance"), "Admin", now)).text();
  assert.match(html, /have no Ni Hao cost/);
});

test("finance dashboard shipment receipt priority and Philippine creation-date fallback match report", async () => {
  const f = fixture();
  f.shipment(BigInt(1000), BigInt(700), null, "In Transit", "2026-09-08T16:00:00Z");
  f.shipment(BigInt(100), BigInt(70), "2026-09-08", "In Transit", "2026-09-08T16:00:00Z");
  const range = { from: "2026-09-09", to: "2026-09-09" };
  const s = await readFinanceSummary(f.db, range, now);
  assert.equal(s.shipments, BigInt(1));
  assert.equal(s.costs, BigInt(700));
  assert.equal(s.margin, BigInt(300));
  const html = await (await finance(f.db, new URL("https://test/admin/finance?report=freight&from=2026-09-09&to=2026-09-09"), "Admin")).text();
  assert.ok(html.includes("₱7.00") && html.includes("₱3.00"));
  assert.match(html, /name="report" value="freight"/);
});

test("finance dashboard large centavos and small fractions remain exact across SQL JSON boundary", async () => {
  const f = fixture();
  const huge = BigInt("9007199254740993");
  f.invoice(huge);
  f.invoice(BigInt(10));
  f.invoice(BigInt(20));
  f.shipment(huge, BigInt(1));
  const s = await readFinanceSummary(f.db, all, now);
  assert.equal(s.revenue, huge + BigInt(30));
  assert.equal(s.margin, huge - BigInt(1));
  assert.equal(s.profit, huge + BigInt(29));
  assert.equal(financePesos(s.revenue), "₱90,071,992,547,410.23");
  assert.equal(financePesos(BigInt(-1)), "-₱0.01");
});

test("finance dashboard does not invent dates for legacy invoices and reports incomplete data", async () => {
  const f = fixture();
  f.invoice(BigInt(1000), null);
  f.expense(BigInt(100), "Utilities", "invalid");
  const s = await readFinanceSummary(f.db, all, now);
  assert.equal(s.undatedInvoices, 1);
  assert.equal(s.undatedExpenses, 1);
  assert.equal(s.revenue, BigInt(0));
  const html = await (await financeDashboard(f.db, new URL("https://test/admin/finance"), "Admin", now)).text();
  assert.match(html, /lack valid issue dates/);
  assert.match(html, /may be incomplete/);
});
