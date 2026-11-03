import type { D1Database } from "@cloudflare/workers-types";
import { AdminError, type AdminUser } from "./security";
import { clientPaymentMethods, createInvoice, paymentMethodLabel, recordPayment } from "./billing";
import { esc, hidden, pesos } from "./ui";
import { philippineToday } from "./finance-dates";

/**
 * "Customer payment" on the shipment page: one form that issues the invoice
 * (making it first if needed), records the money and marks the shipment Paid.
 * It goes through the same recordPayment as the invoice page, so cash,
 * balances and the Activity Log stay the same everywhere.
 */
export type ShipmentBilling = {
  invoiceId: string | null;
  invoiceNumber: string | null;
  status: string | null;
  total: number;
  paid: number;
  lastPaymentDate: string | null;
};

export async function readShipmentBilling(db: D1Database, shipmentId: string, shipment: { shipping_charge?: unknown; delivery_charge?: unknown }): Promise<ShipmentBilling> {
  const invoice = await db.prepare(`SELECT i.id, i.invoice_number, i.status, i.total + i.other_charge AS total,
      COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) AS paid,
      (SELECT MAX(payment_date) FROM payments WHERE invoice_id = i.id) AS last_payment
    FROM invoices i WHERE i.shipment_id = ? AND i.status != 'Void' AND i.archived_at IS NULL
    ORDER BY i.created_at DESC LIMIT 1`).bind(shipmentId)
    .first<{ id: string; invoice_number: string; status: string; total: number; paid: number; last_payment: string | null }>();
  if (!invoice) {
    return {
      invoiceId: null, invoiceNumber: null, status: null, paid: 0, lastPaymentDate: null,
      total: Number(shipment.shipping_charge ?? 0) + Number(shipment.delivery_charge ?? 0),
    };
  }
  return {
    invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, status: invoice.status,
    total: Number(invoice.total), paid: Number(invoice.paid), lastPaymentDate: invoice.last_payment,
  };
}

const allowedFields = ["csrf", "action", "id", "amount", "payment_method", "payment_date", "reference_number", "notes"];

export async function recordShipmentPayment(db: D1Database, form: URLSearchParams, user: AdminUser) {
  for (const key of form.keys()) {
    if (!allowedFields.includes(key) || form.getAll(key).length !== 1)
      throw new AdminError("Unexpected or repeated form field.");
  }
  const id = form.get("id") ?? "";
  if (!/^[\da-f-]{36}$/i.test(id)) throw new AdminError("Invalid shipment ID.");
  const shipment = await db.prepare("SELECT id, shipping_charge, delivery_charge, status, archived_at FROM shipments WHERE id = ?")
    .bind(id).first<{ id: string; shipping_charge: number; delivery_charge: number; status: string; archived_at: string | null }>();
  if (!shipment) throw new AdminError("Shipment not found.", 404);
  if (shipment.status === "Cancelled" || shipment.archived_at) throw new AdminError("This shipment is cancelled or archived.");
  if (!(Number(shipment.shipping_charge) > 0)) throw new AdminError("Add the KargoDoor charge before recording a payment.");

  let { invoiceId } = await readShipmentBilling(db, id, shipment);
  if (!invoiceId) {
    invoiceId = await createInvoice(db, {
      shipment_id: id,
      delivery_charge: Number(shipment.delivery_charge ?? 0),
      other_charge: 0,
      status: "Draft",
      issued_at: null,
      due_at: null,
    }, user.id);
  }
  // A Draft is issued on the payment date by recordPayment itself.
  await recordPayment(db, {
    invoice_id: invoiceId,
    amount: form.get("amount") ?? "",
    payment_method: form.get("payment_method") ?? "",
    reference_number: form.get("reference_number") ?? "",
    payment_date: form.get("payment_date") ?? "",
    notes: form.get("notes") ?? "",
  }, user.id);
  return invoiceId;
}

export function shipmentPaymentSection(options: {
  path: string;
  csrf: string;
  shipmentId: string;
  billing: ShipmentBilling;
  canWrite: boolean;
  justPaid?: boolean;
  /** Set when the box sits inside the Edit shipment form: a card with this heading, not a page section. */
  title?: string;
  /** Payments already received, with their proof of payment boxes (already detached). */
  paymentsList?: string;
}) {
  const open = options.title ? `<div class="shipment-pay-box" id="customer-payment">` : `<section class="shipment-payment">`;
  const close = options.title ? "</div>" : "</section>";
  const heading = options.title ? `<h4>${esc(options.title)}</h4>` : "<h2>Customer payment</h2>";
  const { billing } = options;
  const balance = Math.max(billing.total - billing.paid, 0);
  const invoiceLink = billing.invoiceId
    ? `<a href="/admin/invoices?id=${encodeURIComponent(billing.invoiceId)}">${esc(billing.invoiceNumber)}</a>`
    : "";
  const saved = options.justPaid ? '<p class="notice" role="status">Payment recorded. The invoice is issued and the shipment is updated.</p>' : "";
  if (billing.status === "Paid" || (billing.invoiceId && balance === 0 && billing.paid > 0)) {
    return `${open}${heading}${saved}
      <p><strong>Paid</strong> · ${esc(pesos(billing.paid))}${billing.lastPaymentDate ? ` on ${esc(billing.lastPaymentDate)}` : ""}. Invoice ${invoiceLink}. Counted in Money we have now.</p>${options.paymentsList ?? ""}${close}`;
  }
  const summary = billing.invoiceId
    ? `Invoice ${invoiceLink} (${esc(billing.status)}) · ${esc(pesos(billing.paid))} paid of ${esc(pesos(billing.total))}.`
    : "No invoice yet. Recording a payment makes and issues it.";
  if (!options.canWrite || billing.total <= 0) {
    return `${open}${heading}${saved}<p class="muted">${summary}${billing.total <= 0 ? " Add the KargoDoor charge first." : ""}</p>${options.paymentsList ?? ""}${close}`;
  }
  const methods = clientPaymentMethods.map((method) => `<option value="${esc(method)}"${method === "GCash" ? " selected" : ""}>${esc(paymentMethodLabel(method))}</option>`).join("");
  return `${open}
    ${heading}${saved}
    <p class="muted">${summary} When the customer pays, save it here: the invoice is issued, the money is added to Money we have now and the shipment's Payment status updates.</p>
    <form method="post" action="${esc(options.path)}">
      ${hidden("csrf", options.csrf)}${hidden("action", "customer_paid")}${hidden("id", options.shipmentId)}
      <div class="grid">
        <label>Amount received (PHP) *<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required value="${esc((balance / 100).toFixed(2))}"></label>
        <label>Payment method *<select name="payment_method" required>${methods}</select></label>
        <label>Date received *<input name="payment_date" type="date" required value="${esc(philippineToday())}"></label>
        <label>Reference no.<input name="reference_number" maxlength="160" placeholder="GCash or bank reference"></label>
      </div>
      <div class="actions"><button type="submit">Record payment</button></div>
    </form>
    ${options.paymentsList ?? ""}
  ${close}`;
}

export type ShipmentPaymentRow = { id: string; payment_date: string; amount: number; payment_method: string; reference_number: string | null };

export async function readShipmentPayments(db: D1Database, invoiceId: string | null) {
  if (!invoiceId) return [];
  return (await db.prepare(`SELECT id, payment_date, amount, payment_method, reference_number FROM payments
    WHERE invoice_id = ? ORDER BY payment_date DESC, created_at DESC, id`).bind(invoiceId).all<ShipmentPaymentRow>()).results;
}

/** "Payments received" list for the Customer payment box: one row per payment, each with its proof box. */
export function shipmentPaymentsList(rows: ShipmentPaymentRow[], proofCells: string[]) {
  if (!rows.length) return "";
  return `<div class="shipment-payments-received"><h5>Payments received · proof of payment</h5>
    <p class="muted">Drag the GCash or bank screenshot (or PDF) onto a payment's box, or click Add proof.</p>
    <div class="table"><table><thead><tr><th>Date</th><th>Amount</th><th>Proof</th><th>Method</th><th>Reference</th></tr></thead><tbody>
    ${rows.map((row, index) => `<tr><td>${esc(row.payment_date)}</td><td>${esc(pesos(row.amount))}</td><td>${proofCells[index] ?? ""}</td><td>${esc(row.payment_method)}</td><td>${esc(row.reference_number) || "—"}</td></tr>`).join("")}
    </tbody></table></div></div>`;
}
