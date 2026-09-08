import type { D1Database } from "@cloudflare/workers-types";
import { freightSummary } from "./reports";
import { financeRange, inFinanceRange, philippineToday, validBusinessDate, type FinanceRange } from "./finance-dates";
import { esc, input, page } from "./ui";

type Invoice = { id: string; issued_at: string | null; total: string; other_charge: string };
type Payment = { invoice_id: string; payment_date: string; amount: string };
type Expense = { expense_date: string; amount: string };
const zero = BigInt(0);
export function financePesos(centavos: bigint) {
  const absolute = centavos < zero ? -centavos : centavos;
  return `${centavos < zero ? "-" : ""}₱${(absolute / BigInt(100)).toLocaleString("en-PH")}.${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
}
export async function readFinanceSummary(db: D1Database, range: FinanceRange, now = new Date()) {
  // Text crosses D1's JSON boundary exactly. Billing grand total is total + other_charge;
  // total already includes delivery. All subsequent money arithmetic uses BigInt centavos.
  const [invoices, payments, expenses, freight] = await Promise.all([
    db.prepare(`SELECT id, issued_at, CAST(total AS TEXT) AS total, CAST(other_charge AS TEXT) AS other_charge
      FROM invoices WHERE status NOT IN ('Draft', 'Void')`).all<Invoice>(),
    db.prepare(`SELECT invoice_id, payment_date, CAST(amount AS TEXT) AS amount FROM payments`).all<Payment>(),
    db.prepare(`SELECT expense_date, CAST(amount AS TEXT) AS amount FROM expenses WHERE category != ?`)
      .bind("Freight / Ni Hao Cost").all<Expense>(),
    freightSummary(db, range),
  ]);
  const asOf = range.to || philippineToday(now);
  let revenue = zero, received = zero, receivable = zero, operating = zero;
  let undatedInvoices = 0, undatedPayments = 0, undatedExpenses = 0;
  const applied = new Map<string, bigint>();
  for (const payment of payments.results) {
    if (!validBusinessDate(payment.payment_date)) { undatedPayments++; continue; }
    const amount = BigInt(payment.amount);
    if (inFinanceRange(payment.payment_date, range)) received += amount;
    if (payment.payment_date <= asOf)
      applied.set(payment.invoice_id, (applied.get(payment.invoice_id) ?? zero) + amount);
  }
  for (const invoice of invoices.results) {
    const date = invoice.issued_at ?? "";
    if (!validBusinessDate(date)) { undatedInvoices++; continue; }
    const total = BigInt(invoice.total) + BigInt(invoice.other_charge);
    if (inFinanceRange(date, range)) revenue += total;
    if (date <= asOf) {
      const balance = total - (applied.get(invoice.id) ?? zero);
      if (balance > zero) receivable += balance;
    }
  }
  for (const expense of expenses.results) {
    if (!validBusinessDate(expense.expense_date)) { undatedExpenses++; continue; }
    if (inFinanceRange(expense.expense_date, range)) operating += BigInt(expense.amount);
  }
  const costs = BigInt(String(freight?.costs ?? "0"));
  const margin = BigInt(String(freight?.margin ?? "0"));
  const shipments = BigInt(String(freight?.shipments ?? "0"));
  const uncosted = shipments - BigInt(String(freight?.costed ?? "0"));
  return { revenue, received, receivable, costs, margin, operating,
    profit: revenue - costs - operating, shipments, uncosted, asOf,
    undatedInvoices, undatedPayments, undatedExpenses };
}
export async function financeDashboard(db: D1Database, url: URL, user: string, now = new Date()) {
  const range = financeRange(url, now);
  const summary = await readFinanceSummary(db, range, now);
  const metrics: [string, bigint, string][] = [
    ["Revenue", summary.revenue, "Invoiced charges, including delivery and other charges, by issue date."],
    ["Payments Received", summary.received, "Actual cash collected by payment date."],
    ["Accounts Receivable", summary.receivable, `Outstanding as of ${summary.asOf}; From Date does not apply.`],
    ["Freight Costs", summary.costs, "Recorded backend/Ni Hao freight costs."],
    ["Freight Margin", summary.margin, "Freight charges less backend costs on costed shipments."],
    ["Operating Expenses", summary.operating, "By expense date; excludes Freight / Ni Hao Cost."],
    ["Net Profit", summary.profit, "Revenue less freight costs and operating expenses."],
    ["Shipments", summary.shipments, "Non-cancelled shipments, including those awaiting costs."],
  ];
  const notices = [
    summary.uncosted > zero ? `${summary.uncosted} shipments in this range have no Ni Hao cost. Freight Costs and Freight Margin exclude their missing costs; Net Profit uses recorded costs only.` : "",
    summary.undatedInvoices ? `${summary.undatedInvoices} non-Draft/non-Void invoices lack valid issue dates and are excluded from Revenue and Accounts Receivable. These metrics may be incomplete.` : "",
    summary.undatedPayments ? `${summary.undatedPayments} payments lack valid payment dates and are excluded from collections and receivable deductions. These metrics may be incomplete.` : "",
    summary.undatedExpenses ? `${summary.undatedExpenses} operating expenses lack valid dates and are excluded. Operating Expenses and Net Profit may be incomplete.` : "",
  ].filter(Boolean);
  const freightLink = `/admin/finance?report=freight&${new URLSearchParams(range)}`;
  return page("Finance", `<section><form action="/admin/finance" method="get" class="search">
    ${input("from", "From Date", range, "date")}${input("to", "To Date", range, "date")}<button type="submit">Apply</button></form>
    <div class="actions"><a href="/admin/finance?preset=month">This Month</a><a href="/admin/finance?preset=last-month">Last Month</a>
    <a href="/admin/finance?preset=year">This Year</a><a href="/admin/finance">All Time</a></div></section>
    <p class="muted">Period: ${esc(range.from || "All dates")} through ${esc(range.to || "all dates")}. Dates follow Philippine business time.</p>
    ${notices.map((notice) => `<p class="notice" role="status">${esc(notice)}</p>`).join("")}
    <div class="cards">${metrics.map(([label, value, help]) => `<div class="card"><h2>${label}</h2><strong>${esc(label === "Shipments" ? value.toString() : financePesos(value))}</strong><p class="muted">${esc(help)}</p></div>`).join("")}</div>
    <p class="muted">Freight metrics use warehouse receipt date, or Philippine creation date when receipt date is absent. Cancelled shipments are excluded. Invoice metrics exclude Draft and Void using current invoice status; payments are counted separately. Costs and revenue use their respective business dates.</p>
    <div class="actions"><a href="${esc(freightLink)}">Freight Margin</a><a href="/admin/finance/expenses">Expenses</a></div>`, user);
}
