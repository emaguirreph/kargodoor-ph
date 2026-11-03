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
  if (!(/^\d{1,9}(\.\d{1,2})?$/.test(movedRaw) && Number(movedRaw) > 0))
    throw new AdminError("Enter the amount moved in pesos, like 2500.00.");
  const moved = Math.round(Number(movedRaw) * 100);
  const feeRaw = (form.get("amount") ?? "").trim();
  const reference = (form.get("reference_number") ?? "").trim().slice(0, 160) || null;
  const notes = (form.get("notes") ?? "").trim().slice(0, 4000) || null;
  const date = form.get("expense_date") ?? "";
  // The fee is a business expense paid from GCash; the money moved is not.
  const fee = feeRaw && Number(feeRaw) !== 0 ? expenseSchema.parse({
    expense_date: date,
    category: transferFeeCategory,
    payee: "GCash",
    description: `Transfer fee: ${gcashToUnionBankLabel} (moved ${pesos(moved)})`,
    amount: feeRaw,
    payment_method: "GCash",
    reference_number: reference ?? "",
    tracking_number: "",
    notes: notes ?? "",
    paid_from_account: "kd-gcash",
    paid_to_account: "",
  }) : null;
  const transferDate = fee?.expense_date ?? expenseSchema.shape.expense_date.parse(date);
  const now = new Date().toISOString();
  const transferId = crypto.randomUUID();
  const expenseId = fee ? crypto.randomUUID() : null;
  await db.batch([
    ...(fee ? [db.prepare(`INSERT INTO expenses
      (id, expense_date, category, payee, description, amount, payment_method,
       reference_number, tracking_number, notes, paid_from_account, created_by_admin_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`)
      .bind(expenseId, fee.expense_date, fee.category, fee.payee, fee.description, fee.amount,
        fee.payment_method, fee.reference_number, fee.notes, fee.paid_from_account, user.id || null, now, now)] : []),
    db.prepare(`INSERT INTO account_transfers (id, transfer_date, from_account, to_account, amount, fee_expense_id, reference_number, notes, created_by_admin_user_id, created_at)
      VALUES (?, ?, 'kd-gcash', 'kd-unionbank', ?, ?, ?, ?, ?, ?)`)
      .bind(transferId, transferDate, moved, expenseId, reference, notes, user.id || null, now),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
      VALUES (?, ?, 'gcash_to_unionbank', 'account_transfers', ?, NULL, ?, 'GCash moved to UnionBank.', ?)`)
      .bind(crypto.randomUUID(), user.id || null, transferId,
        JSON.stringify({ moved, fee: fee?.amount ?? 0, fee_expense_id: expenseId, transfer_date: transferDate }), now),
  ]);
  return transferId;
}

/** "Moved GCash to UnionBank" box on the Expenses page. */
export function gcashTransferSection(options: { path: string; csrf: string; suggestedFee: number | null; justSaved?: boolean }) {
  return `<section id="gcash-transfer"><h2>Moved GCash to UnionBank</h2>
    ${options.justSaved ? '<p class="notice" role="status">Transfer saved. GCash went down and UnionBank went up; the fee is in the list as Bank / Payment Fees.</p>' : ""}
    <p class="muted">Record each transfer once, even if it covers several customers. GCash goes down by the amount plus the fee, UnionBank goes up by the amount. Only the fee is an expense.</p>
    <form method="post" action="${esc(options.path)}">
      ${hidden("csrf", options.csrf)}${hidden("action", "gcash_to_unionbank")}
      <div class="grid">
        <label>Date moved *<input name="expense_date" type="date" required value="${esc(philippineToday())}"></label>
        <label>Amount moved (PHP) *<input name="moved_amount" type="number" min="0.01" max="9999999" step="0.01" required placeholder="e.g. 2500.00"></label>
        <label>Transfer fee (PHP)<input name="amount" type="number" min="0" max="1000000" step="0.01" placeholder="e.g. 15.00" value="${options.suggestedFee ? esc((options.suggestedFee / 100).toFixed(2)) : ""}"></label>
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

/**
 * The customer's charge in one summary at the top of the green KargoDoor part
 * of Edit shipment: base fee (automatic), the standard transfer fee, the
 * delivery fee and the total. The actual fee KargoDoor pays is saved with
 * Mark Ni Hao paid (Ni Hao tab).
 */
export function transferFeeSection(options: {
  shippingCharge: unknown;
  transferFeeCollected: unknown;
  deliveryCharge?: unknown;
  /** Small "Auto from rates" / "Typed in" tag, already HTML. */
  sourceTag?: string;
}) {
  const entered = options.shippingCharge !== null && options.shippingCharge !== undefined && String(options.shippingCharge).trim() !== "";
  const { base, fee, charge } = splitFreightCharge(options.shippingCharge, options.transferFeeCollected);
  const delivery = Number(options.deliveryCharge ?? 0) || 0;
  const row = (label: string, value: string, cls = "") => `<dt${cls}>${label}</dt><dd${cls}>${value}</dd>`;
  return `<div class="shipment-fee-summary" id="transfer-fee"><dl>
    ${row(`Base fee ${options.sourceTag ?? ""}`, entered ? esc(pesos(base)) : "Not entered")}
    ${row("Transfer fee (standard)", entered && fee > 0 ? esc(pesos(fee)) : `${esc(pesos(0))}${entered ? ' <small class="muted">older shipment</small>' : ""}`)}
    ${row("Delivery fee", esc(pesos(delivery)))}
    ${row("Total customer pays", entered ? esc(pesos(charge + delivery)) : "—", ' class="total"')}
  </dl>${entered ? `<p class="muted">Customer sees one shipping fee${fee > 0 ? ` (${esc(pesos(charge))})` : ""} plus delivery.</p>` : ""}</div>`;
}
