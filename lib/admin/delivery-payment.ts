import type { D1Database } from "@cloudflare/workers-types";
import { expenseSchema } from "./validation";
import { AdminError, type AdminUser } from "./security";
import { esc, hidden, pesos } from "./ui";
import { philippineToday } from "./finance-dates";
import { deliveryCategory } from "./cost-breakdown";

/**
 * Paying the rider (Lalamove etc.) for a shipment's delivery, from the
 * shipment page (Em, 2026-11-03). The customer pays the delivery charge to
 * KargoDoor; what KargoDoor pays the rider is an expense, saved with the
 * shipment's tracking number so Expenses, Money In & Out and the account
 * balances count it. One delivery payment per shipment.
 */
export const deliveryExpenseCategory = deliveryCategory;
const descriptionPrefix = "Delivery for ";
const paidFrom = {
  UnionBank: { method: "Bank Transfer", account: "kd-unionbank" },
  GCash: { method: "GCash", account: "kd-gcash" },
  Cash: { method: "Cash", account: "" },
} as const;
type PaidFrom = keyof typeof paidFrom;

export type DeliveryPayment = { id: string; date: string; amount: number; payee: string; method: string };

export async function readDeliveryPayment(db: D1Database, trackingNumber: unknown): Promise<DeliveryPayment | null> {
  const tracking = String(trackingNumber ?? "").trim();
  if (!tracking) return null;
  const row = await db.prepare(`SELECT id, expense_date, amount, payee, payment_method FROM expenses
    WHERE category = ? AND tracking_number = ? COLLATE NOCASE AND description LIKE ?
    ORDER BY expense_date DESC, created_at DESC LIMIT 1`)
    .bind(deliveryExpenseCategory, tracking, `${descriptionPrefix}%`)
    .first<{ id: string; expense_date: string; amount: number; payee: string | null; payment_method: string | null }>();
  return row ? { id: row.id, date: row.expense_date, amount: Number(row.amount), payee: row.payee ?? "", method: row.payment_method ?? "" } : null;
}

const allowedFields = ["csrf", "action", "id", "expense_date", "amount", "payee", "paid_from", "reference_number"];

export async function recordDeliveryPayment(db: D1Database, form: URLSearchParams, user: AdminUser) {
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
  if (!shipment.tracking_number) throw new AdminError("Add a tracking number before recording the delivery payment.");
  const from = (form.get("paid_from") ?? "") as PaidFrom;
  if (!Object.hasOwn(paidFrom, from)) throw new AdminError("Choose where the money was paid from.");
  const values = expenseSchema.parse({
    expense_date: form.get("expense_date") ?? "",
    category: deliveryExpenseCategory,
    payee: (form.get("payee") ?? "").trim() || "Lalamove",
    description: `${descriptionPrefix}${shipment.tracking_number}`,
    amount: form.get("amount") ?? "",
    payment_method: paidFrom[from].method,
    reference_number: form.get("reference_number") ?? "",
    tracking_number: shipment.tracking_number,
    notes: "",
    paid_from_account: paidFrom[from].account,
    paid_to_account: "",
  });
  const now = new Date().toISOString();
  const expenseId = crypto.randomUUID();
  const [insert] = await db.batch([
    db.prepare(`INSERT INTO expenses
      (id, expense_date, category, payee, description, amount, payment_method,
       reference_number, tracking_number, notes, paid_from_account, created_by_admin_user_id, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE category = ? AND tracking_number = ? COLLATE NOCASE AND description LIKE ?)`)
      .bind(expenseId, values.expense_date, values.category, values.payee, values.description, values.amount,
        values.payment_method, values.reference_number, values.tracking_number, values.paid_from_account,
        user.id || null, now, now, deliveryExpenseCategory, shipment.tracking_number, `${descriptionPrefix}%`),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
      SELECT ?, ?, 'delivery_paid', 'shipments', ?, NULL, ?, 'Delivery payment to the rider saved as an expense.', ?
      WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ?)`)
      .bind(crypto.randomUUID(), user.id || null, id,
        JSON.stringify({ expense_id: expenseId, amount: values.amount, paid_from: from, payee: values.payee }), now, expenseId),
  ]);
  if (insert.meta.changes !== 1) throw new AdminError("The delivery is already marked paid for this shipment. Check Expenses.", 409);
  return expenseId;
}

/** "Delivery paid" box in the Edit shipment page. */
export function deliveryPaymentSection(options: {
  path: string;
  csrf: string;
  shipmentId: string;
  trackingNumber: unknown;
  deliveryCharge: unknown;
  payment: DeliveryPayment | null;
  canWrite: boolean;
  justPaid?: boolean;
}) {
  // A compact row right under the Delivery charge field.
  const open = `<div class="shipment-pay-box shipment-pay-compact" id="delivery-payment"><h4>Delivery paid to rider</h4>`;
  const charge = Number(options.deliveryCharge ?? 0) || 0;
  if (options.payment) {
    const diff = charge - options.payment.amount;
    return `${open}
      ${options.justPaid ? '<p class="notice" role="status">Delivery payment saved to Expenses.</p>' : ""}
      <p><strong>Paid</strong> · ${esc(pesos(options.payment.amount))} to ${esc(options.payment.payee || "rider")} on ${esc(options.payment.date)}${options.payment.method ? ` (${esc(options.payment.method)})` : ""}.
      ${charge ? `Customer was charged ${esc(pesos(charge))}${diff ? `, so ${esc(pesos(Math.abs(diff)))} ${diff > 0 ? "extra kept" : "more than charged"}` : ""}.` : ""}
      <a href="/admin/finance/expenses?edit=${encodeURIComponent(options.payment.id)}">Edit in Expenses</a></p>
    </div>`;
  }
  if (!options.canWrite || !String(options.trackingNumber ?? "").trim()) {
    return `${open}<p class="muted">Not paid yet.${String(options.trackingNumber ?? "").trim() ? "" : " Add a tracking number first."}</p></div>`;
  }
  const accounts = (Object.keys(paidFrom) as PaidFrom[]).map((key) => `<option value="${key}"${key === "GCash" ? " selected" : ""}>${key === "Cash" ? "Cash (owners)" : key}</option>`).join("");
  return `${open}
    <details class="shipment-record-payment"${options.justPaid ? " open" : ""}><summary>Mark delivery paid${charge ? ` · ${esc(pesos(charge))}` : ""}</summary>
    <p class="muted">Saved to Expenses and Money In &amp; Out with this tracking number.</p>
    <form method="post" action="${esc(options.path)}">
      ${hidden("csrf", options.csrf)}${hidden("action", "delivery_paid")}${hidden("id", options.shipmentId)}
      <div class="grid">
        <label>Date paid *<input name="expense_date" type="date" required value="${esc(philippineToday())}"></label>
        <label>Amount paid (PHP) *<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required value="${charge ? esc((charge / 100).toFixed(2)) : ""}"></label>
        <label>Paid to<input name="payee" maxlength="160" value="Lalamove"></label>
        <label>Paid from *<select name="paid_from" required>${accounts}</select></label>
        <label>Reference no.<input name="reference_number" maxlength="160"></label>
      </div>
      <div class="actions"><button type="submit">Mark delivery paid</button></div>
    </form>
    </details>
  </div>`;
}
