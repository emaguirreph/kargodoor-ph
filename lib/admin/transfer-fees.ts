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
 * shipment: the bank fee to Ni Hao (saved by Mark Ni Hao paid, with the
 * tracking number). GCash to UnionBank fees are saved once per transfer on
 * the Expenses page, so they count in Reports & BIR but not per shipment.
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
    .bind(transferFeeCategory, `Transfer fee: ${gcashToUnionBankLabel}%`).first<{ amount: number }>();
  return row ? Number(row.amount) : null;
}

const allowedFields = ["csrf", "action", "expense_date", "moved_amount", "amount", "reference_number", "notes"];

/**
 * Moving customer GCash money to UnionBank is recorded once per transfer,
 * not per shipment (one transfer usually covers several customers; Em,
 * 2026-11-03). Only the fee is an expense; the money moved stays KargoDoor's.
 */
export async function recordGcashTransfer(db: D1Database, form: URLSearchParams, user: AdminUser) {
  for (const key of form.keys()) {
    if (!allowedFields.includes(key) || form.getAll(key).length !== 1)
      throw new AdminError("Unexpected or repeated form field.");
  }
  const movedRaw = (form.get("moved_amount") ?? "").trim();
  if (movedRaw && !(/^\d{1,9}(\.\d{1,2})?$/.test(movedRaw) && Number(movedRaw) > 0))
    throw new AdminError("Enter the amount moved in pesos, like 2500.00.");
  const moved = movedRaw ? ` (moved ${pesos(Math.round(Number(movedRaw) * 100))})` : "";
  const values = expenseSchema.parse({
    expense_date: form.get("expense_date") ?? "",
    category: transferFeeCategory,
    payee: "GCash",
    description: `Transfer fee: ${gcashToUnionBankLabel}${moved}`,
    amount: form.get("amount") ?? "",
    payment_method: "GCash",
    reference_number: form.get("reference_number") ?? "",
    tracking_number: "",
    notes: form.get("notes") ?? "",
    paid_from_account: "kd-gcash",
    paid_to_account: "",
  });
  const now = new Date().toISOString();
  const expenseId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO expenses
      (id, expense_date, category, payee, description, amount, payment_method,
       reference_number, tracking_number, notes, paid_from_account, created_by_admin_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`)
      .bind(expenseId, values.expense_date, values.category, values.payee, values.description, values.amount,
        values.payment_method, values.reference_number, values.notes, values.paid_from_account, user.id || null, now, now),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
      VALUES (?, ?, 'gcash_to_unionbank', 'expenses', ?, NULL, ?, 'GCash moved to UnionBank; fee saved as an expense.', ?)`)
      .bind(crypto.randomUUID(), user.id || null, expenseId,
        JSON.stringify({ amount: values.amount, moved: movedRaw ? Math.round(Number(movedRaw) * 100) : null, expense_date: values.expense_date }), now),
  ]);
  return expenseId;
}

/** "Moved GCash to UnionBank" box on the Expenses page. */
export function gcashTransferSection(options: { path: string; csrf: string; suggestedFee: number | null; justSaved?: boolean }) {
  return `<section id="gcash-transfer"><h2>Moved GCash to UnionBank</h2>
    ${options.justSaved ? '<p class="notice" role="status">Transfer saved. Its fee is in the list as Bank / Payment Fees.</p>' : ""}
    <p class="muted">Record each transfer once, even if it covers several customers. Only the fee is an expense.</p>
    <form method="post" action="${esc(options.path)}">
      ${hidden("csrf", options.csrf)}${hidden("action", "gcash_to_unionbank")}
      <div class="grid">
        <label>Date moved *<input name="expense_date" type="date" required value="${esc(philippineToday())}"></label>
        <label>Amount moved (PHP)<input name="moved_amount" type="number" min="0.01" max="999999999" step="0.01" placeholder="e.g. 2500.00"></label>
        <label>Transfer fee (PHP) *<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required placeholder="e.g. 15.00" value="${options.suggestedFee ? esc((options.suggestedFee / 100).toFixed(2)) : ""}"></label>
        <label>Reference no.<input name="reference_number" maxlength="160"></label>
      </div>
      <div class="actions"><button type="submit">Save transfer</button></div>
    </form></section>`;
}

/** One line for the shipment page: "₱15.00 UnionBank to Ni Hao · ₱15.00 GCash to UnionBank". */
export function transferFeesPaidSummary(fees: TransferFeePaid[]) {
  if (!fees.length) return "";
  return fees.map((fee) => `${pesos(fee.amount)} ${transferFeeLeg(fee.description)}`).join(" · ");
}

/** "Transfer fee" box in the green KargoDoor part of Edit shipment. */
export function transferFeeSection(options: {
  shippingCharge: unknown;
  transferFeeCollected: unknown;
  fees: TransferFeePaid[];
}) {
  const { base, fee, charge } = splitFreightCharge(options.shippingCharge, options.transferFeeCollected);
  const paid = options.fees.reduce((sum, row) => sum + row.amount, 0);
  const split = fee > 0
    ? `<p><strong>${esc(pesos(base))}</strong> KargoDoor base fee + <strong>${esc(pesos(fee))}</strong> transfer fee = ${esc(pesos(charge))} shipping fee. The customer sees one shipping fee of ${esc(pesos(charge))}.</p>`
    : `<p class="muted">No transfer fee is included in this shipment's charge.</p>`;
  const list = options.fees.length
    ? `<ul class="transfer-fee-list">${options.fees.map((row) => `<li>${esc(row.date)} · ${esc(transferFeeLeg(row.description))} · ${esc(pesos(row.amount))}</li>`).join("")}</ul>
      <p class="muted">Paid ${esc(pesos(paid))}${fee > 0 ? ` of ${esc(pesos(fee))} collected${paid > fee ? ` (${esc(pesos(paid - fee))} more than collected)` : paid < fee ? ` (${esc(pesos(fee - paid))} left over)` : ""}` : ""}.</p>`
    : `<p class="muted">No transfer fee to Ni Hao saved yet. It is saved with Mark Ni Hao paid.</p>`;
  return `<div class="shipment-pay-box" id="transfer-fee">
    <h4>Transfer fee</h4>
    ${split}${list}
    <p class="muted">GCash to UnionBank transfers are saved once per transfer on the <a href="/admin/finance/expenses#gcash-transfer">Expenses</a> page.</p>
  </div>`;
}
