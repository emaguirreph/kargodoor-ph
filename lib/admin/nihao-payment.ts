import type { D1Database } from "@cloudflare/workers-types";
import { expenseSchema } from "./validation";
import { AdminError, type AdminUser } from "./security";
import { esc, hidden, pesos } from "./ui";
import { philippineToday } from "./finance-dates";

/**
 * Paying Ni Hao for one shipment, from the shipment page.
 *
 * The payment is saved as a "Freight / Ni Hao Cost" expense carrying the
 * shipment's tracking number. That one row is what the rest of Finance
 * already reads: Cash on Hand goes down by it, "Going out to Ni Hao" stops
 * counting the shipment, and profit keeps using the shipment's Ni Hao cost
 * (a linked expense is skipped there), so nothing is counted twice.
 */
export const niHaoExpenseCategory = "Freight / Ni Hao Cost";
export const niHaoPayee = "Ni Hao";
/** Transfer fees (UnionBank / GCash to Ni Hao, GCash to UnionBank) are their own expense. */
export const transferFeeCategory = "Bank / Payment Fees";
/** Where KargoDoor sent the money from, and the payment method it is saved as. */
export const paidFromAccounts = { UnionBank: "Bank Transfer", GCash: "GCash", Cash: "Cash", Other: "Other" } as const;
type PaidFrom = keyof typeof paidFromAccounts;

export type NiHaoPayment = {
  count: number;
  amount: number;
  lastDate: string;
  lastId: string;
  /** Transfer fees linked to the same tracking number. */
  fees: number;
};

/** Ni Hao expenses already linked to this tracking number, if any. */
export async function readNiHaoPayment(db: D1Database, trackingNumber: unknown): Promise<NiHaoPayment | null> {
  const tracking = String(trackingNumber ?? "").trim();
  if (!tracking) return null;
  const row = await db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount,
      MAX(expense_date) AS last_date,
      (SELECT id FROM expenses WHERE category = ? AND tracking_number = ? COLLATE NOCASE
        ORDER BY expense_date DESC, created_at DESC LIMIT 1) AS last_id
    FROM expenses WHERE category = ? AND tracking_number = ? COLLATE NOCASE`)
    .bind(niHaoExpenseCategory, tracking, niHaoExpenseCategory, tracking)
    .first<{ count: number; amount: number; last_date: string | null; last_id: string | null }>();
  if (!row || Number(row.count) === 0) return null;
  const fees = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE category = ? AND tracking_number = ? COLLATE NOCASE")
    .bind(transferFeeCategory, tracking).first<{ amount: number }>();
  return { count: Number(row.count), amount: Number(row.amount), lastDate: String(row.last_date ?? ""), lastId: String(row.last_id ?? ""), fees: Number(fees?.amount ?? 0) };
}

const allowedFields = ["csrf", "action", "id", "expense_date", "amount", "payment_method", "paid_from", "transfer_fee", "reference_number", "notes"];

/**
 * Records the Ni Hao payment for a shipment as a linked expense. The amount
 * paid also becomes the shipment's "Ni Hao actual" cost, so profit and cash
 * use the same number. Refuses a second payment for the same tracking number.
 */
export async function recordNiHaoPayment(db: D1Database, form: URLSearchParams, user: AdminUser) {
  for (const key of form.keys()) {
    if (!allowedFields.includes(key) || form.getAll(key).length !== 1)
      throw new AdminError("Unexpected or repeated form field.");
  }
  const id = form.get("id") ?? "";
  if (!/^[\da-f-]{36}$/i.test(id)) throw new AdminError("Invalid shipment ID.");
  const shipment = await db.prepare(`SELECT id, tracking_number, nihao_cost, nihao_cost_source, status, archived_at
    FROM shipments WHERE id = ?`).bind(id).first<{ id: string; tracking_number: string; nihao_cost: number | null; nihao_cost_source: string | null; status: string; archived_at: string | null }>();
  if (!shipment) throw new AdminError("Shipment not found.", 404);
  if (shipment.status === "Cancelled" || shipment.archived_at) throw new AdminError("This shipment is cancelled or archived.");
  if (!shipment.tracking_number) throw new AdminError("Add a tracking number before recording the Ni Hao payment.");

  const paidFromRaw = (form.get("paid_from") ?? "").trim();
  if (paidFromRaw && !Object.hasOwn(paidFromAccounts, paidFromRaw)) throw new AdminError("Choose where the money was paid from.");
  const paidFrom = (paidFromRaw || null) as PaidFrom | null;
  const values = expenseSchema.parse({
    expense_date: form.get("expense_date") ?? "",
    category: niHaoExpenseCategory,
    payee: niHaoPayee,
    description: `Ni Hao freight cost for ${shipment.tracking_number}${paidFrom ? ` (paid from ${paidFrom})` : ""}`,
    amount: form.get("amount") ?? "",
    payment_method: form.get("payment_method") || (paidFrom ? paidFromAccounts[paidFrom] : ""),
    reference_number: form.get("reference_number") ?? "",
    tracking_number: shipment.tracking_number,
    notes: form.get("notes") ?? "",
  });
  // The bank's transfer fee is a business expense of its own, linked to the
  // same tracking number so the shipment statement can show it.
  const feeRaw = (form.get("transfer_fee") ?? "").trim();
  const fee = feeRaw && Number(feeRaw) !== 0
    ? expenseSchema.parse({
      expense_date: values.expense_date,
      category: transferFeeCategory,
      payee: paidFrom && paidFrom !== "Other" ? paidFrom : "Bank",
      description: `Transfer fee: ${paidFrom ?? "bank"} to Ni Hao for ${shipment.tracking_number}`,
      amount: feeRaw,
      payment_method: values.payment_method ?? "",
      reference_number: values.reference_number ?? "",
      tracking_number: shipment.tracking_number,
      notes: "",
    })
    : null;

  const now = new Date().toISOString();
  const expenseId = crypto.randomUUID();
  const [insert] = await db.batch([
    // Only inserts when no Ni Hao expense is linked yet, so a double click
    // or two tabs cannot pay the same shipment twice.
    db.prepare(`INSERT INTO expenses
      (id, expense_date, category, payee, description, amount, payment_method,
       reference_number, tracking_number, notes, created_by_admin_user_id, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE category = ? AND tracking_number = ? COLLATE NOCASE)`)
      .bind(expenseId, values.expense_date, values.category, values.payee, values.description, values.amount,
        values.payment_method, values.reference_number, values.tracking_number, values.notes, user.id || null, now, now,
        niHaoExpenseCategory, shipment.tracking_number),
    db.prepare(`UPDATE shipments SET nihao_cost = ?, nihao_cost_source = 'actual', updated_at = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM expenses WHERE id = ?)`)
      .bind(values.amount, now, id, expenseId),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
      SELECT ?, ?, 'nihao_paid', 'shipments', ?, ?, ?, 'Ni Hao payment recorded as an expense.', ?
      WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ?)`)
      .bind(crypto.randomUUID(), user.id || null, id,
        JSON.stringify({ nihao_cost: shipment.nihao_cost, nihao_cost_source: shipment.nihao_cost_source }),
        JSON.stringify({ expense_id: expenseId, amount: values.amount, expense_date: values.expense_date, paid_from: paidFrom, transfer_fee: fee?.amount ?? 0 }), now, expenseId),
    ...(fee
      ? [db.prepare(`INSERT INTO expenses
          (id, expense_date, category, payee, description, amount, payment_method,
           reference_number, tracking_number, notes, created_by_admin_user_id, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ?)`)
        .bind(crypto.randomUUID(), fee.expense_date, fee.category, fee.payee, fee.description, fee.amount,
          fee.payment_method, fee.reference_number, fee.tracking_number, fee.notes, user.id || null, now, now, expenseId)]
      : []),
  ]);
  if (insert.meta.changes !== 1)
    throw new AdminError("Ni Hao is already marked paid for this shipment. Check Expenses.", 409);
  return expenseId;
}

/** The last transfer fee saved with a Ni Hao payment, used to fill in the fee box (centavos). */
export async function lastNiHaoTransferFee(db: D1Database): Promise<number | null> {
  const row = await db.prepare(`SELECT amount FROM expenses
    WHERE category = ? AND tracking_number IS NOT NULL AND tracking_number != ''
    ORDER BY expense_date DESC, created_at DESC LIMIT 1`).bind(transferFeeCategory).first<{ amount: number }>();
  return row ? Number(row.amount) : null;
}

/** "Ni Hao payment" block on the shipment page. */
export function niHaoPaymentSection(options: {
  path: string;
  csrf: string;
  shipmentId: string;
  trackingNumber: unknown;
  nihaoCost: unknown;
  payment: NiHaoPayment | null;
  canWrite: boolean;
  justPaid?: boolean;
  suggestedFee?: number | null;
}) {
  const { payment } = options;
  const expensesLink = `/admin/finance/expenses?q=${encodeURIComponent(String(options.trackingNumber ?? ""))}`;
  if (payment) {
    return `<section class="nihao-payment">
      <h2>Ni Hao payment</h2>
      ${options.justPaid ? `<p class="notice" role="status">Ni Hao payment saved to Expenses.</p>` : ""}
      <p><strong>Paid</strong> · ${esc(pesos(payment.amount))} on ${esc(payment.lastDate)}${payment.count > 1 ? ` (${payment.count} expense records)` : ""}${payment.fees ? ` + ${esc(pesos(payment.fees))} transfer fee` : ""}.
      Counted in Expenses and Cash on Hand. <a href="${esc(expensesLink)}">View in Expenses</a></p>
    </section>`;
  }
  const cost = options.nihaoCost === null || options.nihaoCost === undefined || options.nihaoCost === "" ? null : Number(options.nihaoCost);
  if (!options.canWrite) {
    return `<section class="nihao-payment"><h2>Ni Hao payment</h2><p class="muted">Not paid yet.</p></section>`;
  }
  const amountValue = cost === null ? "" : (cost / 100).toFixed(2);
  const accounts = Object.keys(paidFromAccounts).map((account) => `<option value="${esc(account)}"${account === "UnionBank" ? " selected" : ""}>${esc(account)}</option>`).join("");
  return `<section class="nihao-payment">
    <h2>Ni Hao payment</h2>
    <p class="muted">Not paid yet. When you pay Ni Hao for this shipment, save it here. It is added to Expenses as a Freight / Ni Hao Cost with this tracking number, so you don't need to enter it again there. The amount paid becomes the shipment's Ni Hao actual cost. A transfer fee is saved as its own Bank / Payment Fees expense.</p>
    <form method="post" action="${esc(options.path)}">
      ${hidden("csrf", options.csrf)}${hidden("action", "nihao_paid")}${hidden("id", options.shipmentId)}
      <div class="grid">
        <label>Date paid *<input name="expense_date" type="date" required value="${esc(philippineToday())}"></label>
        <label>Amount paid (PHP) *<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required value="${esc(amountValue)}"></label>
        <label>Paid from<select name="paid_from">${accounts}</select></label>
        <label>Transfer fee (PHP)<input name="transfer_fee" type="number" min="0" max="1000000" step="0.01" placeholder="e.g. 10.00" value="${options.suggestedFee ? esc((options.suggestedFee / 100).toFixed(2)) : ""}"><small class="muted" style="display:block">${options.suggestedFee ? "Filled in from your last transfer. Change it or clear it if there was no fee." : "Bank or GCash fee for this transfer, if any."}</small></label>
        <label>Reference / receipt no.<input name="reference_number" maxlength="160"></label>
        <label class="wide">Notes<textarea name="notes" maxlength="4000" placeholder="e.g. Ni Hao SOA number or Drive location"></textarea></label>
      </div>
      <div class="actions"><button type="submit">Mark Ni Hao paid</button></div>
    </form>
  </section>`;
}
