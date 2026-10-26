import type { D1Database } from "@cloudflare/workers-types";
import { freightSummary } from "./reports";
import {
  financeRange,
  inFinanceRange,
  philippineToday,
  validBusinessDate,
  type FinanceRange,
} from "./finance-dates";
import { readFinanceReport } from "./finance-report";
import { esc, input, page } from "./ui";
import { readCashOnHand, readManualCashSummary } from "./finance-cash";

type Invoice = {
  id: string;
  issued_at: string | null;
  total: string;
  other_charge: string;
  nihao_cost: string | null;
};

type Payment = {
  invoice_id: string;
  payment_date: string;
  amount: string;
};

type Expense = {
  expense_date: string;
  amount: string;
  category: string;
  linked_cost: number;
};

type UnbilledShipment = {
  id: string;
  tracking_number: string | null;
  full_name: string;
  status: string;
  amount: string;
  nihao_cost: string | null;
  draft_invoice_id: string | null;
};

const freightExpenseCategory = "Freight / Ni Hao Cost";

const zero = BigInt(0);

const expenseDescriptions: Record<string, string> = {
  "Freight / Ni Hao Cost": "Manual freight/backend cost reference.",
  "Local Delivery / Trucking":
    "Local delivery, trucking, hauling, or cargo transfer costs.",
  "Marketing / Advertising":
    "Ads, promotions, content, printing, sponsorships, and marketing.",
  "Salaries / Wages":
    "Employee or staff salaries, wages, and labor payments.",
  "Management / Administrative":
    "General management and administrative business costs.",
  "Office / Rent":
    "Office rent, workspace fees, and general office costs.",
  "Website / Technology":
    "Website, hosting, domains, software, online services, and technology.",
  "Permits / Government Fees":
    "Business permits, registrations, licenses, and government fees.",
  "Transportation / Fuel / Parking":
    "Fuel, tolls, parking, fares, and business transportation.",
  "Supplies / Packaging":
    "Office supplies, shipping materials, packaging, labels, and consumables.",
  "Professional Fees":
    "Accounting, legal, consulting, bookkeeping, and professional services.",
  Utilities:
    "Electricity, water, internet, telephone, and similar utilities.",
  "Bank / Payment Fees":
    "Bank, transfer, payment processing, and transaction fees.",
  "Repairs / Maintenance":
    "Repairs, servicing, maintenance, and business-property upkeep.",
  "Meals / Representation":
    "Business meals, meetings, client entertainment, and representation.",
  Taxes:
    "Business taxes and tax-related operating expenses.",
  Miscellaneous:
    "Valid business expenses that do not fit another category.",
};

export function financePesos(centavos: bigint) {
  const absolute = centavos < zero ? -centavos : centavos;

  return `${centavos < zero ? "-" : ""}₱${(
    absolute / BigInt(100)
  ).toLocaleString("en-PH")}.${(absolute % BigInt(100))
    .toString()
    .padStart(2, "0")}`;
}

function metricTable(
  title: string,
  rows: [string, string, bigint | string][],
  emphasize = "",
) {
  return `<section>
    <h2>${esc(title)}</h2>

    <div class="table">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>

        <tbody>
          ${rows
            .map(
              ([label, description, amount]) => `
                <tr${
                  label === emphasize
                    ? ' class="finance-emphasis"'
                    : ""
                }>
                  <td>
                    <strong>${esc(label)}</strong>
                  </td>

                  <td class="muted">
                    ${esc(description)}
                  </td>

                  <td>
                    <strong>
                      ${esc(
                        typeof amount === "bigint"
                          ? financePesos(amount)
                          : amount,
                      )}
                    </strong>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </section>`;
}

function reportingPeriod(range: FinanceRange) {
  if (!range.from && !range.to) {
    return "All Time";
  }

  const display = (date: string) =>
    date
      ? new Intl.DateTimeFormat("en-PH", {
          timeZone: "Asia/Manila",
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(new Date(`${date}T00:00:00+08:00`))
      : "All dates";

  return `${display(range.from)}–${display(range.to)}`;
}

export async function readFinanceSummary(
  db: D1Database,
  range: FinanceRange,
  now = new Date(),
) {
  // Text crosses D1's JSON boundary exactly.
  // Billing grand total is total + other_charge;
  // total already includes delivery.
  // All subsequent money arithmetic uses BigInt centavos.
  // Cost of sales follows the invoice: a shipment's Ni Hao cost is
  // counted on the same date its invoice is counted as revenue.

  const [invoices, payments, expenses, freight] =
    await Promise.all([
      db
        .prepare(
          `SELECT
            i.id,
            i.issued_at,
            CAST(i.total AS TEXT) AS total,
            CAST(i.other_charge AS TEXT) AS other_charge,
            CAST(s.nihao_cost AS TEXT) AS nihao_cost
          FROM invoices i
          LEFT JOIN shipments s ON s.id = i.shipment_id
          WHERE i.status NOT IN ('Draft', 'Void')
            AND i.archived_at IS NULL`,
        )
        .all<Invoice>(),

      db
        .prepare(
          `SELECT
            invoice_id,
            payment_date,
            CAST(amount AS TEXT) AS amount
          FROM payments p
          JOIN invoices i ON i.id = p.invoice_id
          WHERE i.archived_at IS NULL`,
        )
        .all<Payment>(),

      // A Ni Hao expense tied to a shipment that already carries its
      // Ni Hao cost would count twice; every other one is a real cost.
      db
        .prepare(
          `SELECT
            e.expense_date,
            CAST(e.amount AS TEXT) AS amount,
            e.category,
            CASE WHEN e.category = ? AND EXISTS (
              SELECT 1 FROM shipments s
              WHERE s.tracking_number = e.tracking_number
                AND s.nihao_cost IS NOT NULL
                AND s.status != 'Cancelled'
                AND s.archived_at IS NULL
            ) THEN 1 ELSE 0 END AS linked_cost
          FROM expenses e`,
        )
        .bind(freightExpenseCategory)
        .all<Expense>(),

      freightSummary(db, range),
    ]);

  const asOf =
    range.to || philippineToday(now);

  let revenue = zero;
  let received = zero;
  let receivable = zero;
  let operating = zero;
  let invoicedCosts = zero;
  let freightExpenses = zero;
  let linkedFreightExpenses = zero;
  let uncostedInvoices = 0;

  let undatedInvoices = 0;
  let undatedPayments = 0;
  let undatedExpenses = 0;

  const applied = new Map<string, bigint>();

  for (const payment of payments.results) {
    if (!validBusinessDate(payment.payment_date)) {
      undatedPayments++;
      continue;
    }

    const amount = BigInt(payment.amount);

    if (inFinanceRange(payment.payment_date, range)) {
      received += amount;
    }

    if (payment.payment_date <= asOf) {
      applied.set(
        payment.invoice_id,
        (applied.get(payment.invoice_id) ?? zero) + amount,
      );
    }
  }

  for (const invoice of invoices.results) {
    const date = invoice.issued_at ?? "";

    if (!validBusinessDate(date)) {
      undatedInvoices++;
      continue;
    }

    const total =
      BigInt(invoice.total) +
      BigInt(invoice.other_charge);

    if (inFinanceRange(date, range)) {
      revenue += total;

      if (invoice.nihao_cost === null) {
        uncostedInvoices++;
      } else {
        invoicedCosts += BigInt(invoice.nihao_cost);
      }
    }

    if (date <= asOf) {
      const balance =
        total -
        (applied.get(invoice.id) ?? zero);

      if (balance > zero) {
        receivable += balance;
      }
    }
  }

  for (const expense of expenses.results) {
    if (!validBusinessDate(expense.expense_date)) {
      undatedExpenses++;
      continue;
    }

    const amount = BigInt(expense.amount);

    if (!inFinanceRange(expense.expense_date, range)) {
      continue;
    }

    if (expense.category !== freightExpenseCategory) {
      operating += amount;
    } else if (expense.linked_cost) {
      linkedFreightExpenses += amount;
    } else {
      freightExpenses += amount;
    }
  }

  const costs = BigInt(
    String(freight?.costs ?? "0"),
  );

  const charges = BigInt(
    String(freight?.charges ?? "0"),
  );

  const margin = BigInt(
    String(freight?.margin ?? "0"),
  );

  const shipments = BigInt(
    String(freight?.shipments ?? "0"),
  );

  const uncosted =
    shipments -
    BigInt(
      String(freight?.costed ?? "0"),
    );

  const manual = await readManualCashSummary(db, asOf);
  const costOfSales = invoicedCosts + freightExpenses;
  const cash = await readCashOnHand(db, asOf);
  return {
    revenue,
    received,
    manualCash: manual.cash,
    cash,
    receivable: receivable + manual.receivable,
    invoiceReceivable: receivable,
    manualReceivable: manual.receivable,
    charges,
    costs,
    margin,
    operating,
    invoicedCosts,
    freightExpenses,
    linkedFreightExpenses,
    costOfSales,
    uncostedInvoices,
    profit:
      revenue -
      costOfSales -
      operating,
    shipments,
    uncosted,
    asOf,
    undatedInvoices,
    undatedPayments,
    undatedExpenses,
  };
}

type SimpleSummary = Awaited<ReturnType<typeof readSimpleSummary>>;

/**
 * "Where the business stands today", whatever date range a page shows:
 * cash now, money still coming in and going out, and profit to date plus
 * the profit still to come from shipments not yet billed.
 */
export async function readSimpleSummary(db: D1Database, now = new Date()) {
  const allTime = await readFinanceSummary(db, { from: "", to: "" }, now);
  const unbilled = await db
    .prepare(
      `SELECT
        s.id,
        s.tracking_number,
        c.full_name,
        s.status,
        CAST(s.shipping_charge + s.delivery_charge AS TEXT) AS amount,
        CAST(s.nihao_cost AS TEXT) AS nihao_cost,
        (
          SELECT i.id FROM invoices i
          WHERE i.shipment_id = s.id
            AND i.status = 'Draft'
            AND i.archived_at IS NULL
          LIMIT 1
        ) AS draft_invoice_id
      FROM shipments s
      JOIN customers c ON c.id = s.customer_id
      WHERE s.status != 'Cancelled'
        AND s.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM invoices i
          WHERE i.shipment_id = s.id
            AND i.status NOT IN ('Draft', 'Void')
            AND i.archived_at IS NULL
        )
      ORDER BY s.shipping_charge + s.delivery_charge DESC, s.created_at ASC`,
    )
    .all<UnbilledShipment>();

  const unbilledTotal = unbilled.results.reduce(
    (sum, row) => sum + BigInt(row.amount),
    zero,
  );

  // Expected profit covers only unbilled shipments whose Ni Hao cost is known;
  // the rest are counted separately so a missing cost never looks like profit.
  let expectedCharges = zero;
  let expectedCosts = zero;
  let uncostedCount = 0;
  let uncostedCharges = zero;
  for (const row of unbilled.results) {
    if (row.nihao_cost === null) {
      uncostedCount++;
      uncostedCharges += BigInt(row.amount);
    } else {
      expectedCharges += BigInt(row.amount);
      expectedCosts += BigInt(row.nihao_cost);
    }
  }
  const expectedProfit = expectedCharges - expectedCosts;
  // Profit so far (billed work minus its Ni Hao cost and every expense)
  // plus the profit still to come from shipments not yet billed.
  const overallProfit = allTime.profit + expectedProfit;
  const toCollect = allTime.receivable;
  const comingIn = unbilledTotal + toCollect;

  // Ni Hao is paid after the fact: a shipment's cost is still owed until a
  // Freight / Ni Hao Cost expense with its tracking number is recorded.
  const owed = await db
    .prepare(
      `SELECT
        CAST(COALESCE(SUM(s.nihao_cost), 0) AS TEXT) AS amount,
        CAST(COALESCE(SUM(CASE WHEN s.nihao_cost_source = 'estimate' THEN s.nihao_cost END), 0) AS TEXT) AS estimated,
        COUNT(s.nihao_cost) AS costed,
        COUNT(*) - COUNT(s.nihao_cost) AS uncosted
      FROM shipments s
      WHERE s.status != 'Cancelled'
        AND s.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM expenses e
          WHERE e.category = ?
            AND e.tracking_number = s.tracking_number
        )`,
    )
    .bind(freightExpenseCategory)
    .first<{ amount: string; estimated: string; costed: number; uncosted: number }>();
  const goingOut = BigInt(owed?.amount ?? "0");
  const goingOutEstimated = BigInt(owed?.estimated ?? "0");
  const goingOutUnknown = Number(owed?.uncosted ?? 0);

  return {
    cash: allTime.cash.total,
    allTimeProfit: allTime.profit,
    allTimeExpenses: allTime.operating,
    unbilled,
    unbilledTotal,
    toCollect,
    comingIn,
    goingOut,
    goingOutEstimated,
    goingOutUnknown,
    expectedCharges,
    expectedCosts,
    expectedProfit,
    uncostedCount,
    uncostedCharges,
    overallProfit,
  };
}

const simpleSummaryCss = `<style>
        .finance-simple-cards {
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }

        @media (max-width: 1300px) {
          .finance-simple-cards {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        .finance-simple-cards .card strong.finance-negative {
          color: #9a5b00;
        }

        .finance-simple-cards .card strong {
          display: block;
          font-size: 1.8rem;
          white-space: nowrap;
        }

        .finance-simple-cards small {
          display: block;
          margin-top: .4rem;
          line-height: 1.45;
        }

        .finance-simple-cards small strong.finance-warn {
          display: inline;
          font-size: inherit;
          white-space: normal;
          color: #9a5b00;
        }
        @media(max-width:760px) {
          .finance-simple-cards {
            grid-template-columns: 1fr;
          }
        }
      </style>`;

export function simpleSummarySection(
  simple: SimpleSummary,
  heading = "Simple Summary",
  subtitle = "Where the business stands today. The detailed numbers are below.",
) {
  const {
    cash, allTimeProfit, allTimeExpenses, unbilledTotal, toCollect, comingIn,
    goingOut, goingOutEstimated, goingOutUnknown, expectedCharges, expectedCosts,
    expectedProfit, uncostedCount, uncostedCharges, overallProfit,
  } = simple;
  return `
    <section class="finance-simple">
      <h2>${esc(heading)}</h2>
      <p class="muted">${esc(subtitle)}</p>

      <div class="cards finance-simple-cards">
        <div class="card">
          <span class="muted">Money we have now</span>
          <strong>${esc(financePesos(cash))}</strong>
          <small>Cash on Hand: opening cash plus money received, minus expenses paid.</small>
        </div>

        <div class="card">
          <span class="muted">Money coming in</span>
          <strong>${esc(financePesos(comingIn))}</strong>
          <small>${esc(financePesos(unbilledTotal))} still to bill + ${esc(financePesos(toCollect))} billed but not yet paid by customers.</small>
        </div>

        <div class="card">
          <span class="muted">Money going out</span>
          <strong>${esc(financePesos(goingOut))}</strong>
          <small>Ni Hao costs still to pay on active shipments.${
            goingOutEstimated > zero
              ? ` ${esc(financePesos(goingOut - goingOutEstimated))} is Ni Hao's actual quote and ${esc(financePesos(goingOutEstimated))} is estimated from the Ni Hao rates.`
              : ""
          }${
            goingOutUnknown
              ? ` <strong class="finance-warn">${esc(`${goingOutUnknown} shipment${goingOutUnknown === 1 ? " has" : "s have"} no Ni Hao cost yet, so the real amount is higher.`)}</strong>`
              : ""
          }</small>
        </div>

        <div class="card">
          <span class="muted">Expected profit once billed</span>
          <strong>${esc(financePesos(expectedProfit))}</strong>
          <small>${esc(
            `${financePesos(expectedCharges)} charges − ${financePesos(expectedCosts)} Ni Hao cost on shipments not yet billed.`,
          )}${
            uncostedCount
              ? ` <strong class="finance-warn">${esc(`${uncostedCount} shipment${uncostedCount === 1 ? "" : "s"} (${financePesos(uncostedCharges)}) ${uncostedCount === 1 ? "has" : "have"} no Ni Hao cost yet, so ${uncostedCount === 1 ? "its" : "their"} profit is not included.`)}</strong>`
              : ""
          }</small>
        </div>

        <div class="card">
          <span class="muted">Overall profit after expenses</span>
          <strong class="${overallProfit < zero ? "finance-negative" : ""}">${esc(financePesos(overallProfit))}</strong>
          <small>${esc(
            `${financePesos(allTimeProfit)} profit so far (after ${financePesos(allTimeExpenses)} expenses) + ${financePesos(expectedProfit)} expected.`,
          )} ${overallProfit < zero ? "Below zero: not yet earned back what we have spent, including startup costs." : "Above zero: everything we have spent is earned back."}</small>
        </div>
      </div>

      <p class="muted">
        After everything is collected and Ni Hao is paid:
        ${esc(financePesos(cash))} + ${esc(financePesos(comingIn))} − ${esc(financePesos(goingOut))} =
        <strong>${esc(financePesos(cash + comingIn - goingOut))}</strong>${goingOutUnknown ? ", less the Ni Hao costs not entered yet" : ""}.
        When you pay Ni Hao, add it under Expenses as Freight / Ni Hao Cost with the tracking number, so it moves out of Money going out and into Money we have now.
      </p>

    </section>
  ${simpleSummaryCss}`;
}

export async function financeDashboard(
  db: D1Database,
  url: URL,
  user: string,
  now = new Date(),
  canWrite = true,
) {
  const range = financeRange(url, now);

  const summary =
    await readFinanceSummary(
      db,
      range,
      now,
    );

  const report =
    await readFinanceReport(
      db,
      url,
      now,
      summary,
    );
  const collectionWatch = await db
    .prepare(
      `SELECT
        i.invoice_number,
        i.due_at,
        c.full_name,
        CAST(i.total + i.other_charge AS TEXT) AS total,
        CAST(COALESCE(SUM(p.amount), 0) AS TEXT) AS paid
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      LEFT JOIN payments p ON p.invoice_id = i.id
      WHERE i.status IN ('Unpaid', 'Partial')
        AND i.archived_at IS NULL
      GROUP BY i.id
      HAVING i.total + i.other_charge > COALESCE(SUM(p.amount), 0)
      ORDER BY CASE WHEN i.due_at IS NULL OR i.due_at = '' THEN 1 ELSE 0 END, i.due_at ASC, i.issued_at ASC
      LIMIT 5`,
    )
    .all<{
      invoice_number: string;
      due_at: string | null;
      full_name: string;
      total: string;
      paid: string;
    }>();

  const simple = await readSimpleSummary(db, now);
  const { unbilled, unbilledTotal } = simple;

  const notices = [
    summary.uncostedInvoices
      ? `${summary.uncostedInvoices} invoices in this range are for shipments with no Ni Hao cost. Net Profit counts no freight cost for them until the cost is added to the shipment.`
      : "",

    summary.uncosted > zero
      ? `${summary.uncosted} shipments in this range have no Ni Hao cost. Freight Margin excludes them.`
      : "",

    summary.undatedInvoices
      ? `${summary.undatedInvoices} non-Draft/non-Void invoices lack valid issue dates and are excluded from Revenue and Accounts Receivable. These metrics may be incomplete.`
      : "",

    summary.undatedPayments
      ? `${summary.undatedPayments} payments lack valid payment dates and are excluded from collections and receivable deductions. These metrics may be incomplete.`
      : "",

    summary.undatedExpenses
      ? `${summary.undatedExpenses} operating expenses lack valid dates and are excluded. Operating Expenses and Net Profit may be incomplete.`
      : "",
  ].filter(Boolean);

  const freightLink =
    `/admin/finance?report=freight&${new URLSearchParams(
      range,
    )}`;

  const totalExpenses =
    summary.costOfSales + summary.operating;

  const simpleSummary = simpleSummarySection(simple);

  const summaryCards = `
    <section>
      <h2>Finance Overview</h2>

      <div class="cards finance-summary-cards">
        <div class="card">
          <span class="muted">Revenue</span>
          <strong>${esc(financePesos(summary.revenue))}</strong>
        </div>

        <div class="card">
          <span class="muted">Expenses</span>
          <strong>${esc(financePesos(totalExpenses))}</strong>
        </div>

        <div class="card">
          <span class="muted">Net Profit / Loss</span>
          <strong>${esc(financePesos(summary.profit))}</strong>
        </div>

        <div class="card">
          <span class="muted">Cash on Hand</span>
          <strong>${esc(financePesos(summary.cash.total))}</strong>
        </div>

        <div class="card">
          <span class="muted">Cash Received</span>
          <strong>${esc(financePesos(summary.received))}</strong>
        </div>

        <div class="card">
          <span class="muted">Accounts Receivable</span>
          <strong>${esc(financePesos(summary.receivable))}</strong>
        </div>

        <div class="card">
          <span class="muted">Unbilled Shipments</span>
          <strong>${esc(financePesos(unbilledTotal))}</strong>
        </div>
      </div>

      <p class="muted">
        Expenses = Ni Hao cost of invoiced shipments + Ni Hao expenses not already on a shipment + Operating Expenses.
        Cash on Hand is as of ${esc(summary.asOf)}. Unbilled Shipments is as of today.
      </p>
    </section>
  `;

  const cash = summary.cash;
  const cashSection = `
    <section>
      <div class="actions">
        <h2>Cash on Hand</h2>
        <a href="/admin/finance/cash">Cash Flow &amp; Customer Credits</a>
      </div>

      <div class="table">
        <table>
          <tbody>
            <tr>
              <td><strong>Opening Cash Balance</strong></td>
              <td class="muted">${esc(cash.openingDate ? `Recorded ${cash.openingDate}. Only money in and out from this date on is added below.` : "No opening balance recorded. Add one under Cash Flow & Customer Credits.")}</td>
              <td class="finance-number">${esc(financePesos(cash.opening))}</td>
            </tr>
            <tr>
              <td><strong>+ Owner Funds &amp; Other Cash</strong></td>
              <td class="muted">Owner contributions, other cash received, reimbursements collected, and adjustments.</td>
              <td class="finance-number">${esc(financePesos(cash.ownerAndOther))}</td>
            </tr>
            <tr>
              <td><strong>+ Customer Invoice Payments</strong></td>
              <td class="muted">Payments recorded on invoices.</td>
              <td class="finance-number">${esc(financePesos(cash.collections))}</td>
            </tr>
            <tr>
              <td><strong>− Expenses Paid</strong></td>
              <td class="muted">All recorded expenses, including Ni Hao payments entered as expenses.</td>
              <td class="finance-number">${esc(financePesos(cash.expenses))}</td>
            </tr>
            <tr class="finance-emphasis">
              <td><strong>Cash on Hand</strong></td>
              <td class="muted">As of ${esc(summary.asOf)}.</td>
              <td class="finance-number"><strong>${esc(financePesos(cash.total))}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="muted">
        Opening cash and owner contributions are not revenue, so they do not change Net Profit.
        Ni Hao costs saved only on a shipment are not deducted until the payment is recorded as an expense.
      </p>
    </section>
  `;

  const unbilledSection = `
    <section id="finance-unbilled">
      <div class="actions">
        <h2>Shipments to Bill</h2>
        <strong>Total: ${esc(financePesos(unbilledTotal))}</strong>
      </div>
      ${
        unbilled.results.length
          ? `<div class="table"><table><thead><tr><th>Tracking</th><th>Customer</th><th>Status</th><th>Invoice</th><th class="finance-number">Shipping + Delivery</th><th></th></tr></thead><tbody>${unbilled.results
              .map(
                (row) => `<tr><td>${esc(row.tracking_number || "No tracking yet")}</td><td>${esc(row.full_name)}</td><td>${esc(row.status)}</td><td>${esc(row.draft_invoice_id ? "Draft (not issued)" : "None")}</td><td class="finance-number"><strong>${esc(financePesos(BigInt(row.amount)))}</strong></td><td>${row.draft_invoice_id ? `<a href="/admin/invoices?id=${encodeURIComponent(row.draft_invoice_id)}">Issue invoice</a>` : canWrite ? `<a href="/admin/invoices?new=1&amp;shipment_id=${encodeURIComponent(row.id)}">Create invoice</a>` : ""}</td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : '<p class="muted">Every active shipment has an issued invoice.</p>'
      }
      <p class="muted">
        Active shipments without an issued invoice. They are not in Revenue or Accounts Receivable until invoiced.
      </p>
    </section>
  `;

  const shipping: [
    string,
    string,
    bigint | string,
  ][] = [
    [
      "Freight Charges",
      "KargoDoor freight charges for eligible costed shipments in the selected period.",
      summary.charges,
    ],
    [
      "Ni Hao Freight Cost",
      "Backend freight cost for those eligible shipments.",
      summary.costs,
    ],
    [
      "Freight Margin",
      "KargoDoor freight charges less Ni Hao freight cost.",
      summary.margin,
    ],
    [
      "Shipments",
      "Qualifying non-cancelled shipments in the selected period.",
      summary.shipments.toString(),
    ],
  ];

  const shippingCards = `
    <section>
      <h2>Shipping Performance</h2>

      <div class="cards finance-shipping-cards">
        ${shipping
          .map(
            ([label, _description, value]) => `
              <div class="card">
                <span class="muted">${esc(label)}</span>
                <strong>${
                  typeof value === "string"
                    ? esc(value)
                    : esc(financePesos(value))
                }</strong>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;

  const breakdown = `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Description</th>
            <th>Amount</th>
            <th>% of Operating Expenses</th>
          </tr>
        </thead>

        <tbody>
          ${
            report.breakdown
              .map((row) => {
                const description =
                  expenseDescriptions[
                    row.category
                  ] ??
                  "Historical expense category.";

                return `
                  <tr>
                    <td>
                      <strong>
                        ${esc(row.category)}
                      </strong>
                    </td>

                    <td class="muted">
                      ${esc(description)}
                    </td>

                    <td>
                      <strong>
                        ${esc(
                          financePesos(
                            row.amount,
                          ),
                        )}
                      </strong>
                    </td>

                    <td>
                      ${esc(row.percent)}
                    </td>
                  </tr>
                `;
              })
              .join("") ||
            `<tr>
              <td
                colspan="4"
                class="muted"
              >
                No operating expense categories have amounts in this reporting period.
              </td>
            </tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  const comparison =
    report.comparison.length
      ? `
        <div class="table">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Current</th>
                <th>Previous</th>
                <th>Difference</th>
                <th>% Change</th>
              </tr>
            </thead>

            <tbody>
              ${report.comparison
                .map(
                  (row) => `
                    <tr>
                      <td>
                        <strong>
                          ${esc(row.label)}
                        </strong>
                      </td>

                      <td>
                        ${esc(
                          financePesos(
                            row.current,
                          ),
                        )}
                      </td>

                      <td>
                        ${esc(
                          financePesos(
                            row.previous,
                          ),
                        )}
                      </td>

                      <td>
                        ${esc(
                          financePesos(
                            row.difference,
                          ),
                        )}
                      </td>

                      <td>
                        ${esc(
                          row.percentChange,
                        )}
                      </td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `
      : `<p class="muted">
          Previous-period comparison is available for date presets and ranges with both From and To dates.
        </p>`;

  const monthly = `
    <div class="table finance-wide">
      <table class="finance-monthly">
        <thead>
          <tr>
            <th>Month</th>
            <th class="finance-number">Revenue</th>
            <th class="finance-number">Cash Received</th>
            <th class="finance-number">Expenses</th>
            <th class="finance-number">Net Profit / Loss</th>
            <th class="finance-number">Freight Margin</th>
          </tr>
        </thead>

        <tbody>
          ${report.monthly
            .map(
              (row) => `
                <tr>
                  <td>
                    <strong>${esc(row.label)}</strong>
                  </td>

                  <td class="finance-number">
                    ${esc(financePesos(row.revenue))}
                  </td>

                  <td class="finance-number">
                    ${esc(financePesos(row.received))}
                  </td>

                  <td class="finance-number">
                    ${esc(
                      financePesos(
                        row.costOfSales + row.operating,
                      ),
                    )}
                  </td>

                  <td class="finance-number">
                    ${esc(financePesos(row.profit))}
                  </td>

                  <td class="finance-number">
                    ${esc(financePesos(row.margin))}
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  const exportLink =
    `/admin/finance/export?${new URLSearchParams(
      range,
    )}`;

  return page(
    "Finance",
    `
      <section>
        <form
          action="/admin/finance"
          method="get"
          class="search"
        >
          ${input(
            "from",
            "From Date",
            range,
            "date",
          )}

          ${input(
            "to",
            "To Date",
            range,
            "date",
          )}

          <button type="submit">
            Apply
          </button>
        </form>

        <div class="actions">
          <a href="/admin/finance?preset=month">
            This Month
          </a>

          <a href="/admin/finance?preset=last-month">
            Last Month
          </a>

          <a href="/admin/finance?preset=year">
            This Year
          </a>

          <a href="/admin/finance">
            All Time
          </a>
        </div>
      </section>

      <p class="muted">
        <strong>Reporting period:</strong>
        ${esc(reportingPeriod(range))}.
        Dates follow Philippine business time.
      </p>

      ${notices
        .map(
          (notice) =>
            `<p
              class="notice"
              role="status"
            >
              ${esc(notice)}
            </p>`,
        )
        .join("")}

      ${simpleSummary}

      ${summaryCards}

      ${unbilledSection}

      ${cashSection}

      <section>
        <div class="actions">
          <h2>Collections to Follow Up</h2>
          <a href="/admin/invoices">View Invoices</a>
        </div>
        ${collectionWatch.results.length ? `<div class="table"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Due Date</th><th>Balance</th></tr></thead><tbody>${collectionWatch.results.map((invoice) => `<tr><td>${esc(invoice.invoice_number)}</td><td>${esc(invoice.full_name)}</td><td>${esc(invoice.due_at || "No due date")}</td><td><strong>${esc(financePesos(BigInt(invoice.total) - BigInt(invoice.paid)))}</strong></td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No unpaid invoice balances need follow-up.</p>'}
      </section>

      ${shippingCards}

      <section>
        <div class="actions">
          <h2>Operating Expenses</h2>

          ${
            canWrite
              ? `<a
                  class="button"
                  href="/admin/finance/expenses?new=1"
                >
                  + Add Expense
                </a>`
              : ""
          }

          <a href="/admin/finance/expenses">
            View Expenses
          </a>
        </div>

        <p>
          <strong>
            Total Operating Expenses:
            ${esc(
              financePesos(
                summary.operating,
              ),
            )}
          </strong>
        </p>

        ${
          summary.operating > zero
            ? breakdown
            : `<p class="muted">
                No operating expenses recorded in this reporting period.
              </p>`
        }
      </section>

      ${
        report.comparison.length
          ? `<section>
              <h2>Period Comparison</h2>
              ${comparison}
            </section>`
          : `<p class="muted">
              Period comparison is available when a complete date range or preset is selected.
            </p>`
      }

      <section>
        <div class="actions">
          <h2>Monthly Summary</h2>

          ${
            canWrite
              ? `<a
                  class="button"
                  href="${esc(exportLink)}"
                >
                  Export Finance CSV
                </a>`
              : ""
          }
        </div>

        ${monthly}
      </section>

      <section>
        <h2>
          How the Numbers Are Calculated
        </h2>

        <div class="table">
          <table>
            <tbody>
              <tr>
                <td>
                  <strong>Revenue</strong>
                </td>
                <td class="muted">
                  Eligible Invoice Revenue
                </td>
              </tr>

              <tr>
                <td>
                  <strong>
                    Payments Received
                  </strong>
                </td>
                <td class="muted">
                  Actual Payments Received
                </td>
              </tr>

              <tr>
                <td>
                  <strong>
                    Accounts Receivable
                  </strong>
                </td>
                <td class="muted">
                  Eligible Invoice Balance − Payments Applied (as of reporting end date)
                </td>
              </tr>

              <tr>
                <td>
                  <strong>
                    Freight Margin
                  </strong>
                </td>
                <td class="muted">
                  KargoDoor Freight Charges − Ni Hao Freight Cost
                </td>
              </tr>

              <tr>
                <td>
                  <strong>
                    Operating Expenses
                  </strong>
                </td>
                <td class="muted">
                  Business Expenses − Freight / Ni Hao Cost category
                </td>
              </tr>

              <tr>
                <td>
                  <strong>
                    Net Profit
                  </strong>
                </td>
                <td class="muted">
                  Revenue − Cost of Sales − Operating Expenses
                </td>
              </tr>

              <tr>
                <td>
                  <strong>
                    Cost of Sales
                  </strong>
                </td>
                <td class="muted">
                  Ni Hao cost of shipments whose invoices are in Revenue (same date as the invoice) + Freight / Ni Hao Cost expenses not tied to a costed shipment
                </td>
              </tr>

              <tr>
                <td>
                  <strong>
                    Cash on Hand
                  </strong>
                </td>
                <td class="muted">
                  Opening Cash Balance + owner funds and other cash + invoice payments − expenses paid, from the opening balance date on
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="muted">
          Revenue and Payments Received are different:
          Revenue represents eligible invoiced earnings,
          while Payments Received represents actual cash collected.
        </p>

        <p class="muted">
          A Freight / Ni Hao Cost expense is left out of profit only when its tracking number
          matches a shipment that already has its Ni Hao cost recorded. This prevents double counting.
          Any other Ni Hao expense, like a lump-sum payment, counts as Cost of Sales.
        </p>
      </section>

      <p class="muted">
        Freight metrics use warehouse receipt date,
        or Philippine creation date when receipt date is absent.
        Cancelled shipments are excluded.
      </p>

      <div class="actions">
        <a href="${esc(freightLink)}">
          Freight Margin
        </a>

        <a href="/admin/finance/expenses">
          Expenses
        </a>
      </div>

      <style>
        .finance-emphasis td {
          border-top: 2px solid #154876;
          border-bottom: 2px solid #154876;
        }

        .finance-emphasis strong {
          font-size: 1.08rem;
        }

        .finance-summary-cards {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .finance-summary-cards .card strong,
        .finance-shipping-cards .card strong {
          white-space: nowrap;
          font-size: 1.55rem;
        }

        .finance-shipping-cards {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .finance-wide {
          overflow-x: auto;
        }

        .finance-monthly {
          min-width: 780px;
        }

        .finance-number {
          text-align: right;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }

        @media(max-width:760px) {
          .finance-summary-cards,
          .finance-shipping-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

      </style>
    `,
    user,
    200,
    {},
    canWrite,
  );
}
