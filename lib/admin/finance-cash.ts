import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import { cashEntrySchema, cashEntryTypes, type RecordData } from "./validation";
import { AdminError } from "./security";
import { esc, hidden, input, page, pesos } from "./ui";

const path = "/admin/finance/cash";
const cashTypes = new Set(["Opening Cash Balance", "Owner Contribution", "Other Cash Received", "Customer Payment Received", "Adjustment Increase"]);
const receivableType = "Customer Reimbursement Due";

type Customer = { id: string; customer_code: string; full_name: string };
type CashEntry = RecordData & { id: string; entry_date: string; entry_type: string; amount: number; customer_name: string | null; customer_code: string | null };

type AutomaticPayment = {
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_code: string;
};

function amountInput(values: RecordData) {
  const amount = values.amount;
  const value = amount === undefined || amount === null ? "" : (Number(amount) / 100).toFixed(2);
  return `<label>Amount (PHP) *<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required value="${esc(value)}"></label>`;
}

function selectField(name: string, label: string, options: readonly string[], value: unknown, prompt: string) {
  return `<label>${esc(label)}<select name="${name}"><option value="">${esc(prompt)}</option>${options.map((option) => `<option value="${esc(option)}"${value === option ? " selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`;
}

async function customers(db: D1Database) {
  return (await db.prepare("SELECT id, customer_code, full_name FROM customers ORDER BY full_name COLLATE NOCASE, customer_code").all<Customer>()).results;
}

function customerSelect(rows: Customer[], value: unknown) {
  return `<label>Customer<select name="customer_id"><option value="">Not customer-related</option>${rows.map((row) => `<option value="${esc(row.id)}"${value === row.id ? " selected" : ""}>${esc(`${row.full_name} (${row.customer_code})`)}</option>`).join("")}</select></label>`;
}

async function saveCashEntry(db: D1Database, form: URLSearchParams) {
  const allowed = ["entry_date", "entry_type", "customer_id", "related_entry_id", "amount", "reference_number", "notes", "csrf"];
  for (const key of form.keys()) if (!allowed.includes(key) || form.getAll(key).length !== 1) throw new AdminError("Unexpected or repeated cash entry field.");
  const values = cashEntrySchema.parse(Object.fromEntries(allowed.filter((key) => key !== "csrf").map((key) => [key, form.get(key) ?? ""])));
  if (values.related_entry_id) {
    const related = await db.prepare("SELECT customer_id, entry_type FROM finance_cash_entries WHERE id = ?").bind(values.related_entry_id).first<{ customer_id: string | null; entry_type: string }>();
    if (!related || related.entry_type !== receivableType || related.customer_id !== values.customer_id) throw new AdminError("Choose an outstanding balance due for this customer payment.");
  }
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO finance_cash_entries (id, entry_date, entry_type, customer_id, related_entry_id, amount, reference_number, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), values.entry_date, values.entry_type, values.customer_id, values.related_entry_id, values.amount, values.reference_number, values.notes, now, now).run();
}

export async function financeCashPage(db: D1Database, url: URL, user: string, csrf: string, canWrite = true) {
  const add = url.searchParams.get("new") === "1";
  const customerRows = await customers(db);
  if (add) {
    const selected = url.searchParams.get("type") ?? "";
    const form: RecordData = { entry_type: cashEntryTypes.includes(selected as never) ? selected : "", entry_date: new Date().toISOString().slice(0, 10) };
    return page("Add Cash or Customer Credit", `<section><p class="notice"><strong>How this works:</strong> Expenses record money KargoDoor pays out. Use <strong>Customer Reimbursement Due</strong> only after recording the expense; it tracks what the customer owes and does not count as cash or income until payment is received.</p>
      <form method="post" action="${path}">${hidden("csrf", csrf)}<div class="grid">
      ${selectField("entry_type", "Entry type *", cashEntryTypes, form.entry_type, "Select entry type")}
      ${input("entry_date", "Date", form, "date", true)}
      ${customerSelect(customerRows, form.customer_id)}
      <label>Balance due being paid (optional)<input name="related_entry_id" maxlength="36" placeholder="Enter the reimbursement record ID when settling it"></label>
      ${amountInput(form)}${input("reference_number", "Reference number", form)}
      <label class="wide">Notes *<textarea name="notes" required maxlength="4000"></textarea></label></div>
      <p class="muted">Opening Cash Balance: starting cash only. Owner Contribution: business funds added by the owner. Adjustment: correction only—state why in Notes. Customer Payment Received: cash received and, when applicable, link the reimbursement record it settles.</p>
      <div class="actions"><button type="submit">Save entry</button><a href="${path}">Cancel</a></div></form></section>`, user, 200, {}, canWrite);
  }
  const { results } = await db.prepare(`SELECT e.id, e.entry_date, e.entry_type, e.amount, e.reference_number, e.notes, c.full_name AS customer_name, c.customer_code
    FROM finance_cash_entries e LEFT JOIN customers c ON c.id = e.customer_id ORDER BY e.entry_date DESC, e.created_at DESC`).all<CashEntry>();
  const { results: automaticPayments } = await db.prepare(`
    SELECT
      p.payment_date,
      p.amount,
      p.payment_method,
      p.reference_number,
      i.id AS invoice_id,
      i.invoice_number,
      c.full_name AS customer_name,
      c.customer_code
    FROM payments p
    JOIN invoices i
      ON i.id = p.invoice_id
    JOIN customers c
      ON c.id = p.customer_id
    WHERE i.archived_at IS NULL
    ORDER BY
      p.payment_date DESC,
      p.created_at DESC
  `).all<AutomaticPayment>();

  const automaticTotal = automaticPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );

  const automaticRows = automaticPayments
    .map(
      (payment) => `
        <tr>
          <td>${esc(payment.payment_date)}</td>
          <td>
            ${esc(payment.customer_name)}
            <br>
            <span class="muted">${esc(payment.customer_code)}</span>
          </td>
          <td>
            <a href="/admin/invoices?id=${esc(payment.invoice_id)}">
              ${esc(payment.invoice_number)}
            </a>
          </td>
          <td>${esc(pesos(payment.amount))}</td>
          <td>${esc(payment.payment_method)}</td>
          <td>${esc(payment.reference_number) || "—"}</td>
        </tr>
      `,
    )
    .join("") ||
    `<tr><td colspan="6">No invoice payments recorded yet.</td></tr>`;

  const rows = results.map((entry) => `<tr><td>${esc(entry.entry_date)}</td><td><strong>${esc(entry.entry_type)}</strong></td><td>${esc(entry.customer_name ? `${entry.customer_name} (${entry.customer_code})` : "—")}</td><td>${esc(pesos(entry.amount))}</td><td>${esc(entry.reference_number) || "—"}</td><td>${esc(entry.notes)}</td><td><code>${esc(entry.id)}</code></td></tr>`).join("") || `<tr><td colspan="7">No manual cash or customer-credit records yet.</td></tr>`;
  return page("Cash Flow & Customer Credits", `
    <section>
      <p class="notice">
        <strong>Automatic records:</strong>
        Invoice payments below are recorded automatically from Billing.
        Do not enter ordinary invoice payments again as manual cash records.
      </p>

      <div class="actions">
        ${canWrite ? `<a class="button" href="${path}?new=1">+ Add Manual Record</a>` : ""}
        <a href="/admin/finance">Finance Dashboard</a>
        <a href="/admin/finance/expenses">Expenses</a>
      </div>
    </section>

    <section>
      <div class="actions">
        <h2>Automatic Customer Payments</h2>
        <strong>Total: ${esc(pesos(automaticTotal))}</strong>
      </div>

      <p class="muted">
        Automatically recorded from invoice payments. No manual entry required.
      </p>

      <div class="table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>${automaticRows}</tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Manual Cash & Customer Credit Records</h2>

      <p class="muted">
        For owner contributions, opening cash, adjustments, other cash received,
        and customer reimbursements that are not ordinary invoice payments.
      </p>

      <div class="table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Reference</th>
              <th>Notes</th>
              <th>Record ID</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `, user, 200, {}, canWrite);
}

export async function mutateFinanceCash(db: D1Database, form: URLSearchParams) {
  await saveCashEntry(db, form);
  return "saved";
}

export async function readManualCashSummary(db: D1Database, asOf: string) {
  let results: { id: string; entry_date: string; entry_type: string; related_entry_id: string | null; amount: string }[];
  try {
    ({ results } = await db.prepare("SELECT id, entry_date, entry_type, related_entry_id, amount FROM finance_cash_entries WHERE entry_date <= ?").bind(asOf).all<{ id: string; entry_date: string; entry_type: string; related_entry_id: string | null; amount: string }>());
  } catch (error) {
    if (error instanceof Error && /no such table: finance_cash_entries/i.test(error.message))
      return { cash: BigInt(0), receivable: BigInt(0) };
    throw error;
  }
  let cash = BigInt(0); const due = new Map<string, bigint>(); const paid = new Map<string, bigint>();
  for (const entry of results) {
    const amount = BigInt(entry.amount);
    if (cashTypes.has(entry.entry_type)) cash += amount;
    if (entry.entry_type === "Adjustment Decrease") cash -= amount;
    if (entry.entry_type === receivableType) due.set(entry.id, amount);
    if (entry.entry_type === "Customer Payment Received" && entry.related_entry_id) paid.set(entry.related_entry_id, (paid.get(entry.related_entry_id) ?? BigInt(0)) + amount);
  }
  let receivable = BigInt(0);
  for (const [id, amount] of due) { const balance = amount - (paid.get(id) ?? BigInt(0)); if (balance > 0) receivable += balance; }
  return { cash, receivable };
}
