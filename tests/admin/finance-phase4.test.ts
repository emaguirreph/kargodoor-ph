import { test } from "node:test";
import assert from "node:assert/strict";
import { financeDashboard } from "../../lib/admin/finance-summary";
import { financeCsv, previousFinanceRange, readFinanceReport } from "../../lib/admin/finance-report";
import { all, fixture, now } from "./finance.test";

test("Phase 4 expense breakdown excludes freight, sorts descending and calculates percentages", async () => {
  const f = fixture();
  f.expense(BigInt(30000), "Office / Rent");
  f.expense(BigInt(10000), "Utilities");
  f.expense(BigInt(90000), "Freight / Ni Hao Cost");
  const report = await readFinanceReport(f.db, new URL("https://test/admin/finance"), now);
  assert.deepEqual(report.breakdown.map((row) => [row.category, row.amount, row.percent]), [
    ["Office / Rent", BigInt(30000), "75.00%"],
    ["Utilities", BigInt(10000), "25.00%"],
  ]);
  assert.equal(report.summary.operating, BigInt(40000));
});

test("Phase 4 expense percentages add to exactly 100 percent after rounding", async () => {
  const f = fixture();
  for (const category of ["Utilities", "Taxes", "Office / Rent"]) f.expense(BigInt(1), category);
  const report = await readFinanceReport(f.db, new URL("https://test/admin/finance"), now);
  const hundredths = report.breakdown.reduce((sum, row) =>
    sum + Number(row.percent.replace("%", "").replace(".", "")), 0);
  assert.equal(hundredths, 10000);
});

test("Phase 4 monthly summary includes zero months and matches selected-range totals", async () => {
  const f = fixture();
  f.invoice(BigInt(10000), "2026-01-15");
  f.expense(BigInt(2500), "Utilities", "2026-03-02");
  const report = await readFinanceReport(f.db,
    new URL("https://test/admin/finance?from=2026-01-01&to=2026-03-31"), now);
  assert.deepEqual(report.monthly.map((row) => row.label), ["January 2026", "February 2026", "March 2026"]);
  assert.equal(report.monthly[1].revenue, BigInt(0));
  assert.equal(report.monthly[1].operating, BigInt(0));
  assert.equal(report.monthly.reduce((sum, row) => sum + row.revenue, BigInt(0)), report.summary.revenue);
  assert.equal(report.monthly.reduce((sum, row) => sum + row.operating, BigInt(0)), report.summary.operating);
});

test("Phase 4 previous periods are deterministic for custom and preset ranges", () => {
  assert.deepEqual(previousFinanceRange(new URL("https://test/admin/finance?from=2026-09-01&to=2026-09-30"),
    { from: "2026-09-01", to: "2026-09-30" }), { from: "2026-08-02", to: "2026-08-31" });
  assert.deepEqual(previousFinanceRange(new URL("https://test/admin/finance?preset=month"),
    { from: "2026-09-01", to: "2026-09-09" }), { from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(previousFinanceRange(new URL("https://test/admin/finance?preset=last-month"),
    { from: "2026-08-01", to: "2026-08-31" }), { from: "2026-07-01", to: "2026-07-31" });
  assert.deepEqual(previousFinanceRange(new URL("https://test/admin/finance?preset=year"),
    { from: "2026-01-01", to: "2026-09-09" }), { from: "2025-01-01", to: "2025-09-09" });
});

test("Phase 4 comparison handles positive, negative and zero-previous values", async () => {
  const f = fixture();
  f.expense(BigInt(10000), "Utilities", "2026-08-15");
  f.expense(BigInt(5000), "Utilities", "2026-09-15");
  const report = await readFinanceReport(f.db,
    new URL("https://test/admin/finance?from=2026-09-01&to=2026-09-30"), now);
  const operating = report.comparison.find((row) => row.label === "Operating Expenses")!;
  const revenue = report.comparison.find((row) => row.label === "Revenue")!;
  assert.deepEqual([operating.difference, operating.percentChange], [BigInt(-5000), "-50.00%"]);
  assert.equal(revenue.percentChange, "N/A");
});

test("Phase 4 CSV is Excel-compatible, escaped, injection-safe and contains no internal identifiers", async () => {
  const f = fixture();
  f.expense(BigInt(12345), '=DANGEROUS,\"category\"');
  const response = await financeCsv(f.db, new URL("https://test/admin/finance"), now);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(bytes);
  assert.equal(response.headers.get("content-disposition"),
    'attachment; filename="KargoDoor-Finance-All-Time.csv"');
  for (const section of ["SUMMARY", "EXPENSE BREAKDOWN", "MONTHLY SUMMARY"]) assert.ok(csv.includes(section));
  assert.ok(csv.includes(`\"'=DANGEROUS,\"\"category\"\"\"`));
  assert.ok(!csv.includes("cargo_code") && !csv.includes("invoice_id") && !csv.includes("customer_id"));
});

test("Phase 4 dated CSV filename and dashboard report UI preserve the active range", async () => {
  const f = fixture();
  const url = new URL("https://test/admin/finance?from=2026-09-01&to=2026-09-30");
  const csv = await financeCsv(f.db, url, now);
  assert.equal(csv.headers.get("content-disposition"),
    'attachment; filename="KargoDoor-Finance-2026-09-01-to-2026-09-30.csv"');
  const html = await (await financeDashboard(f.db, url, "Admin", now)).text();
  for (const heading of ["Operating Expenses", "Period Comparison", "Monthly Summary"]) {
    assert.ok(html.includes(`<h2>${heading}</h2>`));
  }
  assert.ok(html.includes("/admin/finance/export?from=2026-09-01&amp;to=2026-09-30"));
  assert.ok(html.includes("% of Operating Expenses"));
});

test("Phase 4 report and export perform zero database writes", async () => {
  const f = fixture();
  const changes = f.sql.prepare("SELECT total_changes() AS n").get()!.n;
  await readFinanceReport(f.db, new URL("https://test/admin/finance"), now);
  await financeCsv(f.db, new URL("https://test/admin/finance"), now);
  assert.equal(f.sql.prepare("SELECT total_changes() AS n").get()!.n, changes);
  assert.ok(f.queries.every((query) => /^SELECT\b/i.test(query.trim())));
  assert.deepEqual((await readFinanceReport(f.db, new URL("https://test/admin/finance"), now)).range, all);
});
