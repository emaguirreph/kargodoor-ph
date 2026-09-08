import type { D1Database } from "@cloudflare/workers-types";
import { financeRange, philippineToday, shipmentBusinessDateSql, type FinanceRange } from "./finance-dates";
import { readFinanceSummary } from "./finance-summary";

type Summary = Awaited<ReturnType<typeof readFinanceSummary>>;
type CategoryRow = { category: string; amount: string };
type BoundsRow = { first_date: string | null; last_date: string | null };
export type ExpenseBreakdownRow = { category: string; amount: bigint; percent: string };
export type MonthlyFinanceRow = Summary & { month: string; label: string };
export type ComparisonRow = {
  label: string; current: bigint; previous: bigint; difference: bigint; percentChange: string;
};
const zero = BigInt(0);

const dateAt = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
function addDays(value: string, days: number) {
  const date = dateAt(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}
const daysInclusive = (from: string, to: string) =>
  Math.round((dateAt(to).getTime() - dateAt(from).getTime()) / 86_400_000) + 1;

function previousMonth(from: string) {
  const date = dateAt(from.slice(0, 7) + "-01");
  date.setUTCDate(0);
  const to = iso(date);
  return { from: to.slice(0, 7) + "-01", to };
}

function priorYearEquivalent(range: FinanceRange) {
  const year = Number(range.from.slice(0, 4)) - 1;
  const requestedEnd = `${year}${range.to.slice(4)}`;
  const parsed = dateAt(requestedEnd);
  const to = Number.isNaN(parsed.getTime()) || iso(parsed) !== requestedEnd ? `${year}-02-28` : requestedEnd;
  return { from: `${year}-01-01`, to };
}

export function previousFinanceRange(url: URL, range: FinanceRange): FinanceRange | null {
  const preset = url.searchParams.get("preset") ?? "";
  if (preset === "month" || preset === "last-month") return previousMonth(range.from);
  if (preset === "year") return priorYearEquivalent(range);
  if (!range.from || !range.to) return null;
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(daysInclusive(range.from, range.to) - 1)), to };
}

function formattedPercent(numerator: bigint, denominator: bigint, signed = false) {
  if (denominator === zero) return signed ? "N/A" : "0.00%";
  const negative = numerator < zero;
  const absolute = negative ? -numerator : numerator;
  const divisor = denominator < zero ? -denominator : denominator;
  const value = (absolute * BigInt(10_000) + divisor / BigInt(2)) / divisor;
  return `${signed && !negative ? "+" : negative ? "-" : ""}${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}%`;
}

async function expenseBreakdown(db: D1Database, range: FinanceRange, total: bigint) {
  const rows = (await db.prepare(`SELECT category, CAST(SUM(amount) AS TEXT) AS amount
    FROM expenses WHERE category != ? AND amount > 0 AND date(expense_date) = expense_date
      AND (? = '' OR expense_date >= ?) AND (? = '' OR expense_date <= ?)
    GROUP BY category HAVING SUM(amount) > 0 ORDER BY SUM(amount) DESC, category ASC`)
    .bind("Freight / Ni Hao Cost", range.from, range.from, range.to, range.to).all<CategoryRow>()).results;
  if (total <= zero) return [];
  const values = rows.map((row, index) => {
    const amount = BigInt(row.amount);
    const scaled = amount * BigInt(10_000);
    return { category: row.category, amount, index, hundredths: scaled / total, remainder: scaled % total };
  });
  let remaining = BigInt(10_000) - values.reduce((sum, row) => sum + row.hundredths, zero);
  for (const row of [...values].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining <= zero) break;
    row.hundredths += BigInt(1);
    remaining -= BigInt(1);
  }
  return values.map((row) => ({
    category: row.category,
    amount: row.amount,
    percent: `${row.hundredths / BigInt(100)}.${(row.hundredths % BigInt(100)).toString().padStart(2, "0")}%`,
  }));
}

async function activityBounds(db: D1Database) {
  return await db.prepare(`SELECT MIN(business_date) AS first_date, MAX(business_date) AS last_date FROM (
    SELECT issued_at AS business_date FROM invoices WHERE status NOT IN ('Draft', 'Void') AND date(issued_at) = issued_at
    UNION ALL SELECT payment_date FROM payments WHERE date(payment_date) = payment_date
    UNION ALL SELECT expense_date FROM expenses WHERE date(expense_date) = expense_date
    UNION ALL SELECT ${shipmentBusinessDateSql} FROM shipments
      WHERE status != 'Cancelled' AND date(${shipmentBusinessDateSql}) = ${shipmentBusinessDateSql}
  )`).first<BoundsRow>();
}

async function monthlyRows(db: D1Database, range: FinanceRange, now: Date) {
  const bounds = await activityBounds(db);
  const today = philippineToday(now);
  const first = range.from || bounds?.first_date || (range.to ? range.to.slice(0, 7) + "-01" : today.slice(0, 7) + "-01");
  const last = range.to || bounds?.last_date || today;
  if (first > last) return [];
  const rows: MonthlyFinanceRow[] = [];
  let month = first.slice(0, 7) + "-01";
  const finalMonth = last.slice(0, 7) + "-01";
  while (month <= finalMonth) {
    const next = dateAt(month);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const from = month === first.slice(0, 7) + "-01" ? first : month;
    const to = month === finalMonth ? last : addDays(iso(next), -1);
    const summary = await readFinanceSummary(db, { from, to }, now);
    rows.push({
      ...summary,
      month: month.slice(0, 7),
      label: new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila", month: "long", year: "numeric",
      }).format(new Date(`${month}T00:00:00+08:00`)),
    });
    month = iso(next);
  }
  return rows;
}

export async function readFinanceReport(
  db: D1Database, url: URL, now = new Date(), suppliedSummary?: Summary,
) {
  const range = financeRange(url, now);
  const summary = suppliedSummary ?? await readFinanceSummary(db, range, now);
  const previousRange = previousFinanceRange(url, range);
  const previous = previousRange ? await readFinanceSummary(db, previousRange, now) : null;
  const comparison: ComparisonRow[] = previous ? [
    ["Revenue", summary.revenue, previous.revenue],
    ["Operating Expenses", summary.operating, previous.operating],
    ["Net Profit", summary.profit, previous.profit],
    ["Payments Received", summary.received, previous.received],
  ].map(([label, current, prior]) => ({
    label: label as string,
    current: current as bigint,
    previous: prior as bigint,
    difference: (current as bigint) - (prior as bigint),
    percentChange: formattedPercent((current as bigint) - (prior as bigint), prior as bigint, true),
  })) : [];
  const [breakdown, monthly] = await Promise.all([
    expenseBreakdown(db, range, summary.operating),
    monthlyRows(db, range, now),
  ]);
  return { range, summary, breakdown, monthly, previousRange, comparison };
}

function csvCell(value: string | bigint) {
  let text = String(value);
  if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvMoney(value: bigint) {
  const absolute = value < zero ? -value : value;
  return `${value < zero ? "-" : ""}${absolute / BigInt(100)}.${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
}

export async function financeCsv(db: D1Database, url: URL, now = new Date()) {
  const report = await readFinanceReport(db, url, now);
  const { summary } = report;
  const rows: (string | bigint)[][] = [
    ["SUMMARY"], ["Metric", "Amount"],
    ["Revenue", csvMoney(summary.revenue)],
    ["Payments Received", csvMoney(summary.received)],
    ["Accounts Receivable", csvMoney(summary.receivable)],
    ["Ni Hao Freight Cost", csvMoney(summary.costs)],
    ["Freight Margin", csvMoney(summary.margin)],
    ["Operating Expenses", csvMoney(summary.operating)],
    ["Net Profit", csvMoney(summary.profit)],
    ["Shipments", summary.shipments], [],
    ["EXPENSE BREAKDOWN"], ["Category", "Amount", "% of Operating Expenses"],
    ...report.breakdown.map((row) => [row.category, csvMoney(row.amount), row.percent]), [],
    ["MONTHLY SUMMARY"],
    ["Month", "Revenue", "Payments Received", "Freight Cost", "Operating Expenses", "Net Profit", "Freight Margin", "Shipments"],
    ...report.monthly.map((row) => [
      row.label, csvMoney(row.revenue), csvMoney(row.received), csvMoney(row.costs),
      csvMoney(row.operating), csvMoney(row.profit), csvMoney(row.margin), row.shipments,
    ]),
  ];
  const name = report.range.from || report.range.to
    ? `KargoDoor-Finance-${report.range.from || "All-Time"}-to-${report.range.to || "All-Time"}.csv`
    : "KargoDoor-Finance-All-Time.csv";
  return new Response(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
