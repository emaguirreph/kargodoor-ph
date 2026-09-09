import type { D1Database } from "@cloudflare/workers-types";
import { freightSummary } from "./reports";
import { financeRange, inFinanceRange, philippineToday, validBusinessDate, type FinanceRange } from "./finance-dates";
import { readFinanceReport } from "./finance-report";
import { esc, input, page } from "./ui";

type Invoice = { id: string; issued_at: string | null; total: string; other_charge: string };
type Payment = { invoice_id: string; payment_date: string; amount: string };
type Expense = { expense_date: string; amount: string };
const zero = BigInt(0);

const expenseDescriptions: Record<string, string> = {
  "Freight / Ni Hao Cost": "Manual freight/backend cost reference.",
  "Local Delivery / Trucking": "Local delivery, trucking, hauling, or cargo transfer costs.",
  "Marketing / Advertising": "Ads, promotions, content, printing, sponsorships, and marketing.",
  "Salaries / Wages": "Employee or staff salaries, wages, and labor payments.",
  "Management / Administrative": "General management and administrative business costs.",
  "Office / Rent": "Office rent, workspace fees, and general office costs.",
  "Website / Technology": "Website, hosting, domains, software, online services, and technology.",
  "Permits / Government Fees": "Business permits, registrations, licenses, and government fees.",
  "Transportation / Fuel / Parking": "Fuel, tolls, parking, fares, and business transportation.",
  "Supplies / Packaging": "Office supplies, shipping materials, packaging, labels, and consumables.",
  "Professional Fees": "Accounting, legal, consulting, bookkeeping, and professional services.",
  Utilities: "Electricity, water, internet, telephone, and similar utilities.",
  "Bank / Payment Fees": "Bank, transfer, payment processing, and transaction fees.",
  "Repairs / Maintenance": "Repairs, servicing, maintenance, and business-property upkeep.",
  "Meals / Representation": "Business meals, meetings, client entertainment, and representation.",
  Taxes: "Business taxes and tax-related operating expenses.",
  Miscellaneous: "Valid business expenses that do not fit another category.",
};
export function financePesos(centavos: bigint) {
  const absolute = centavos < zero ? -centavos : centavos;
  return `${centavos < zero ? "-" : ""}₱${(absolute / BigInt(100)).toLocaleString("en-PH")}.${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
}

function metricTable(title: string, rows: [string, string, bigint | string][], emphasize = "") {
  return `<section><h2>${esc(title)}</h2><div class="table"><table><thead><tr>
    <th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>
    ${rows.map(([label, description, amount]) => `<tr${label === emphasize ? ' class="finance-emphasis"' : ""}>
      <td><strong>${esc(label)}</strong></td><td class="muted">${esc(description)}</td>
      <td><strong>${esc(typeof amount === "bigint" ? financePesos(amount) : amount)}</strong></td></tr>`).join("")}
    </tbody></table></div></section>`;
}

function reportingPeriod(range: FinanceRange) {
  if (!range.from && !range.to) return "All Time";
  const display = (date: string) => date
    ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" })
        .format(new Date(`${date}T00:00:00+08:00`))
    : "All dates";
  return `${display(range.from)}–${display(range.to)}`;
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
  const charges = BigInt(String(freight?.charges ?? "0"));
  const margin = BigInt(String(freight?.margin ?? "0"));
  const shipments = BigInt(String(freight?.shipments ?? "0"));
  const uncosted = shipments - BigInt(String(freight?.costed ?? "0"));
  return { revenue, received, receivable, charges, costs, margin, operating,
    profit: revenue - costs - operating, shipments, uncosted, asOf,
    undatedInvoices, undatedPayments, undatedExpenses };
}
export async function financeDashboard(db: D1Database, url: URL, user: string, now = new Date(), canWrite = true) {
  const range = financeRange(url, now);
  const summary = await readFinanceSummary(db, range, now);
  const report = await readFinanceReport(db, url, now, summary);
  const notices = [
    summary.uncosted > zero ? `${summary.uncosted} shipments in this range have no Ni Hao cost. Freight Costs and Freight Margin exclude their missing costs; Net Profit uses recorded costs only.` : "",
    summary.undatedInvoices ? `${summary.undatedInvoices} non-Draft/non-Void invoices lack valid issue dates and are excluded from Revenue and Accounts Receivable. These metrics may be incomplete.` : "",
    summary.undatedPayments ? `${summary.undatedPayments} payments lack valid payment dates and are excluded from collections and receivable deductions. These metrics may be incomplete.` : "",
    summary.undatedExpenses ? `${summary.undatedExpenses} operating expenses lack valid dates and are excluded. Operating Expenses and Net Profit may be incomplete.` : "",
  ].filter(Boolean);
  const freightLink = `/admin/finance?report=freight&${new URLSearchParams(range)}`;
  const financeOverview: [string, string, bigint][] = [
    ["Revenue", "Total eligible customer invoice revenue for the selected period.", summary.revenue],
    ["Ni Hao Freight Cost", "Backend freight cost paid/payable to Ni Hao for customer shipments.", summary.costs],
    ["Operating Expenses", "Business overhead such as marketing, salaries, permits, website, office, and transportation.", summary.operating],
    ["Net Profit / (Loss)", "Revenue remaining after Ni Hao freight costs and operating expenses.", summary.profit],
  ];
  const cash: [string, string, bigint][] = [
    ["Payments Received", "Actual customer payments received during the selected period.", summary.received],
    ["Accounts Receivable", `Outstanding customer invoice balances as of ${summary.asOf}.`, summary.receivable],
  ];
  const shipping: [string, string, bigint | string][] = [
    ["Freight Charges", "KargoDoor freight charges for eligible costed shipments in the selected period.", summary.charges],
    ["Ni Hao Freight Cost", "Backend freight cost for those eligible shipments.", summary.costs],
    ["Freight Margin", "KargoDoor freight charges less Ni Hao freight cost.", summary.margin],
    ["Shipments", "Qualifying non-cancelled shipments in the selected period.", summary.shipments.toString()],
  ];
  const breakdown = `<div class="table"><table><thead><tr><th>Category</th><th>Description</th><th>Amount</th><th>% of Operating Expenses</th></tr></thead><tbody>
      ${report.breakdown.map((row) => {
        const description = expenseDescriptions[row.category] ?? "Historical expense category.";
        return `<tr><td><strong>${esc(row.category)}</strong></td>
          <td class="muted">${esc(description)}</td><td><strong>${esc(financePesos(row.amount))}</strong></td>
          <td>${esc(row.percent)}</td></tr>`;
      }).join("") || '<tr><td colspan="4" class="muted">No operating expense categories have amounts in this reporting period.</td></tr>'}
      </tbody></table></div>`;
  const comparison = report.comparison.length
    ? `<div class="table"><table><thead><tr><th>Metric</th><th>Current</th><th>Previous</th><th>Difference</th><th>% Change</th></tr></thead><tbody>
      ${report.comparison.map((row) => `<tr><td><strong>${esc(row.label)}</strong></td><td>${esc(financePesos(row.current))}</td>
        <td>${esc(financePesos(row.previous))}</td><td>${esc(financePesos(row.difference))}</td><td>${esc(row.percentChange)}</td></tr>`).join("")}
      </tbody></table></div>`
    : '<p class="muted">Previous-period comparison is available for date presets and ranges with both From and To dates.</p>';
  const monthly = `<div class="table finance-wide"><table><thead><tr><th>Month</th><th>Revenue</th><th>Payments Received</th>
    <th>Ni Hao Freight Cost</th><th>Operating Expenses</th><th>Net Profit</th><th>Freight Margin</th><th>Shipments</th></tr></thead><tbody>
    ${report.monthly.map((row) => `<tr><td><strong>${esc(row.label)}</strong></td><td>${esc(financePesos(row.revenue))}</td>
      <td>${esc(financePesos(row.received))}</td><td>${esc(financePesos(row.costs))}</td><td>${esc(financePesos(row.operating))}</td>
      <td>${esc(financePesos(row.profit))}</td><td>${esc(financePesos(row.margin))}</td><td>${row.shipments}</td></tr>`).join("")}
    </tbody></table></div>`;
  const exportLink = `/admin/finance/export?${new URLSearchParams(range)}`;
  return page("Finance", `<section><form action="/admin/finance" method="get" class="search">
    ${input("from", "From Date", range, "date")}${input("to", "To Date", range, "date")}<button type="submit">Apply</button></form>
    <div class="actions"><a href="/admin/finance?preset=month">This Month</a><a href="/admin/finance?preset=last-month">Last Month</a>
    <a href="/admin/finance?preset=year">This Year</a><a href="/admin/finance">All Time</a></div></section>
    <p class="muted"><strong>Reporting period:</strong> ${esc(reportingPeriod(range))}. Dates follow Philippine business time.</p>
    ${notices.map((notice) => `<p class="notice" role="status">${esc(notice)}</p>`).join("")}
    ${metricTable("Finance Overview", financeOverview, "Net Profit / (Loss)")}
    ${metricTable("Cash & Receivables", cash)}
    ${metricTable("Shipping Performance", shipping)}
    <section><div class="actions"><h2>Operating Expenses</h2>${canWrite ? '<a class="button" href="/admin/finance/expenses?new=1">+ Add Expense</a>' : ""}<a href="/admin/finance/expenses">View Expenses</a></div>
      <p><strong>Total Operating Expenses: ${esc(financePesos(summary.operating))}</strong></p>${breakdown}</section>
    <section><h2>Period Comparison</h2>${comparison}</section>
    <section><div class="actions"><h2>Monthly Summary</h2>${canWrite ? `<a class="button" href="${esc(exportLink)}">Export Finance CSV</a>` : ""}</div>${monthly}</section>
    <section><h2>How the Numbers Are Calculated</h2><div class="table"><table><tbody>
      <tr><td><strong>Revenue</strong></td><td class="muted">Eligible Invoice Revenue</td></tr>
      <tr><td><strong>Payments Received</strong></td><td class="muted">Actual Payments Received</td></tr>
      <tr><td><strong>Accounts Receivable</strong></td><td class="muted">Eligible Invoice Balance − Payments Applied (as of reporting end date)</td></tr>
      <tr><td><strong>Freight Margin</strong></td><td class="muted">KargoDoor Freight Charges − Ni Hao Freight Cost</td></tr>
      <tr><td><strong>Operating Expenses</strong></td><td class="muted">Business Expenses − Freight / Ni Hao Cost category</td></tr>
      <tr><td><strong>Net Profit</strong></td><td class="muted">Revenue − Ni Hao Freight Cost − Operating Expenses</td></tr>
    </tbody></table></div>
    <p class="muted">Revenue and Payments Received are different: Revenue represents eligible invoiced earnings, while Payments Received represents actual cash collected.</p>
    <p class="muted">Freight / Ni Hao Cost entered under Expenses is excluded from Operating Expenses when the same backend freight cost is already recorded against shipments. This prevents double counting.</p></section>
    <p class="muted">Freight metrics use warehouse receipt date, or Philippine creation date when receipt date is absent. Cancelled shipments are excluded.</p>
    <div class="actions"><a href="${esc(freightLink)}">Freight Margin</a><a href="/admin/finance/expenses">Expenses</a></div>
    <style>.finance-emphasis td{border-top:2px solid #154876;border-bottom:2px solid #154876}.finance-emphasis strong{font-size:1.08rem}.finance-wide{overflow-x:auto}
    @media(max-width:520px){table{min-width:0}thead{display:none}tr{display:block;padding:10px 0;border-bottom:1px solid #d5e4ed}td{display:block;border:0;padding:4px 0}td:last-child{font-size:1.1rem}}</style>`, user, 200, {}, canWrite);
}
