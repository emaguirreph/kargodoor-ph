import type { D1Database } from "@cloudflare/workers-types";
import { expenseSchema } from "./validation";
import { AdminError, type AdminUser } from "./security";
import { esc, hidden, pesos } from "./ui";
import { philippineToday } from "./finance-dates";
import { transferFeeCategory } from "./nihao-payment";

/**
 * The ₱30 transfer fee on every shipment, made visible.
 *
 * The customer pays one shipping fee that already includes ₱30 (rule agreed
 * with Em 2026-11-03). Inside the admin we show it apart from the KargoDoor
 * base fee, and next to it the fees KargoDoor actually paid for that
 * shipment: the bank fee to Ni Hao (saved by Mark Ni Hao paid) and the fee
 * for moving the customer's GCash money to UnionBank (saved here). Both are
 * "Bank / Payment Fees" expenses carrying the shipment's tracking number, so
 * Expenses, the statement and Reports & BIR already count them.
 */
export type TransferFeePaid = { date: string; description: string; amount: number };

export const gcashToUnionBankLabel = "GCash to UnionBank";

/** Bank / Payment Fees expenses linked to this tracking number, oldest first. */
export async function readTransferFeesPaid(db: D1Database, trackingNumber: unknown): Promise<TransferFeePaid[]> {
  const tracking = String(trackingNumber ?? "").trim();
  if (!tracking) return [];
  const rows = await db.prepare(`SELECT expense_date, description, amount FROM expenses
    WHERE category = ? AND tracking_number = ? COLLATE NOCASE ORDER BY expense_date, created_at`)
    .bind(transferFeeCategory, tracking).all<{ expense_date: string; description: string; amount: number }>();
  return rows.results.map((row) => ({ date: row.expense_date, description: row.description, amount: Number(row.amount) }));
}

/** Short name for a fee row: "UnionBank to Ni Hao", "GCash to UnionBank"... */
export function transferFeeLeg(description: string) {
  const match = /^Transfer fee: (.+?) for /.exec(description);
  return match ? match[1]! : description;
}

/** "₱500.00 base + ₱30.00 transfer fee" split of the KargoDoor freight charge. */
export function splitFreightCharge(shippingCharge: unknown, transferFeeCollected: unknown) {
  const charge = Number(shippingCharge ?? 0) || 0;
  const fee = Math.min(Math.max(Number(transferFeeCollected ?? 0) || 0, 0), charge);
  return { base: charge - fee, fee, charge };
}

/** The last GCash to UnionBank fee saved, used to fill in the box (centavos). */
export async function lastGcashTransferFee(db: D1Database): Promise<number | null> {
  const row = await db.prepare(`SELECT amount FROM expenses WHERE category = ? AND description LIKE ?
    ORDER BY expense_date DESC, created_at DESC LIMIT 1`)
    .bind(transferFeeCategory, `Transfer fee: ${gcashToUnionBankLabel} for %`).first<{ amount: number }>();
  return row ? Number(row.amount) : null;
}

const allowedFields = ["csrf", "action", "id", "expense_date", "amount", "reference_number"];

/** Saves the GCash to UnionBank fee for one shipment as a Bank / Payment Fees expense. */
export async function recordGcashTransferFee(db: D1Database, form: URLSearchParams, user: AdminUser) {
  for (const key of form.keys()) {
    if (!allowedFields.includes(key) || form.getAll(key).length !== 1)
      throw new AdminError("Unexpected or repeated form field.");
  }
  const id = form.get("id") ?? "";
  if (!/^[\da-f-]{36}$/i.test(id)) throw new AdminError("Invalid shipment ID.");
  const shipment = await db.prepare("SELECT id, tracking_number, status, archived_at FROM shipments WHERE id = ?")
    .bind(id).first<{ id: string; tracking_number: string | null; status: string; archived_at: string | null }>();
  if (!shipment) throw new AdminError("Shipment not found.", 404);
  if (shipment.status === "Cancelled" || shipment.archived_at) throw new AdminError("This shipment is cancelled or archived.");
  if (!shipment.tracking_number) throw new AdminError("Add a tracking number before saving a transfer fee.");

  const values = expenseSchema.parse({
    expense_date: form.get("expense_date") ?? "",
    category: transferFeeCategory,
    payee: "GCash",
    description: `Transfer fee: ${gcashToUnionBankLabel} for ${shipment.tracking_number}`,
    amount: form.get("amount") ?? "",
    payment_method: "GCash",
    reference_number: form.get("reference_number") ?? "",
    tracking_number: shipment.tracking_number,
    notes: "",
    paid_from_account: "kd-gcash",
    paid_to_account: "",
  });
  const now = new Date().toISOString();
  const expenseId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO expenses
      (id, expense_date, category, payee, description, amount, payment_method,
       reference_number, tracking_number, notes, paid_from_account, created_by_admin_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(expenseId, values.expense_date, values.category, values.payee, values.description, values.amount,
        values.payment_method, values.reference_number, values.tracking_number, values.notes,
        values.paid_from_account, user.id || null, now, now),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
      VALUES (?, ?, 'transfer_fee_paid', 'shipments', ?, NULL, ?, 'GCash to UnionBank fee saved as an expense.', ?)`)
      .bind(crypto.randomUUID(), user.id || null, id,
        JSON.stringify({ expense_id: expenseId, amount: values.amount, expense_date: values.expense_date }), now),
  ]);
  return expenseId;
}

/** One line for the shipment page: "₱15.00 UnionBank to Ni Hao · ₱15.00 GCash to UnionBank". */
export function transferFeesPaidSummary(fees: TransferFeePaid[]) {
  if (!fees.length) return "";
  return fees.map((fee) => `${pesos(fee.amount)} ${transferFeeLeg(fee.description)}`).join(" · ");
}

/** "Transfer fee" box in the green KargoDoor part of Edit shipment. */
export function transferFeeSection(options: {
  path: string;
  csrf: string;
  shipmentId: string;
  shippingCharge: unknown;
  transferFeeCollected: unknown;
  fees: TransferFeePaid[];
  canWrite: boolean;
  justSaved?: boolean;
  suggestedFee?: number | null;
}) {
  const { base, fee, charge } = splitFreightCharge(options.shippingCharge, options.transferFeeCollected);
  const paid = options.fees.reduce((sum, row) => sum + row.amount, 0);
  const split = fee > 0
    ? `<p><strong>${esc(pesos(base))}</strong> KargoDoor base fee + <strong>${esc(pesos(fee))}</strong> transfer fee = ${esc(pesos(charge))} shipping fee. The customer sees one shipping fee of ${esc(pesos(charge))}.</p>`
    : `<p class="muted">No transfer fee is included in this shipment's charge.</p>`;
  const list = options.fees.length
    ? `<ul class="transfer-fee-list">${options.fees.map((row) => `<li>${esc(row.date)} · ${esc(transferFeeLeg(row.description))} · ${esc(pesos(row.amount))}</li>`).join("")}</ul>
      <p class="muted">Paid ${esc(pesos(paid))}${fee > 0 ? ` of ${esc(pesos(fee))} collected${paid > fee ? ` (${esc(pesos(paid - fee))} more than collected)` : paid < fee ? ` (${esc(pesos(fee - paid))} left over)` : ""}` : ""}.</p>`
    : `<p class="muted">No transfer fees paid yet for this shipment. The fee to Ni Hao is saved with Mark Ni Hao paid.</p>`;
  const form = options.canWrite
    ? `<form method="post" action="${esc(options.path)}">
      ${hidden("csrf", options.csrf)}${hidden("action", "gcash_transfer_fee")}${hidden("id", options.shipmentId)}
      <div class="grid">
        <label>Date moved *<input name="expense_date" type="date" required value="${esc(philippineToday())}"></label>
        <label>GCash to UnionBank fee (PHP) *<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required placeholder="e.g. 15.00" value="${options.suggestedFee ? esc((options.suggestedFee / 100).toFixed(2)) : ""}"></label>
        <label>Reference no.<input name="reference_number" maxlength="160"></label>
      </div>
      <div class="actions"><button type="submit">Save GCash to UnionBank fee</button></div>
    </form>`
    : "";
  return `<div class="shipment-pay-box" id="transfer-fee">
    <h4>Transfer fee</h4>
    ${options.justSaved ? '<p class="notice" role="status">Transfer fee saved to Expenses (Bank / Payment Fees).</p>' : ""}
    ${split}${list}
    ${options.canWrite ? '<p class="muted">Moved this customer\'s GCash payment to UnionBank? Save the fee here. It goes to Expenses as Bank / Payment Fees with this tracking number.</p>' : ""}
    ${form}
  </div>`;
}
