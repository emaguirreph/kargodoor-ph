import type { D1Database } from "@cloudflare/workers-types";
import { clientSourceIds, expenseSchema } from "./validation";
import { AdminError, type AdminUser } from "./security";
import { esc, hidden, pesos } from "./ui";
import { philippineToday } from "./finance-dates";
import { deliveryCategory, niHaoCategory, transferFeesCategory } from "./cost-breakdown";

/**
 * Partner split and referral commission (Em's policy, 2026-11-04).
 *
 * Profit of a shipment = customer payments − Ni Hao cost − transfer fees −
 * delivery paid to riders (same as the Money In & Out profit card).
 *
 * Who brought the client is set once on the customer:
 *   Archie & Em 60/40 · Patrick & Keah 40/60 · Company 50/50
 *   Referral to Archie & Em 54/36 + friend 10% · Referral to Patrick & Keah 36/54 + 10%
 *   Company referral code 45/45 + 10%
 * The friend's 10% is only on the client's first 3 shipments; from the 4th
 * the normal split resumes. The 60/40 bonus lasts 12 months from "client
 * since", then the client is 50/50.
 */
export type ClientSource = (typeof clientSourceIds)[number];
export const clientSourceLabels: Record<ClientSource, string> = {
  ae: "Archie & Em",
  pk: "Patrick & Keah",
  company: "Company",
  ref_ae: "Referral to Archie & Em",
  ref_pk: "Referral to Patrick & Keah",
  ref_company: "Company referral code",
};
export const referralCategory = "Referral Commission";
export const referralShipments = 3;
export const referralRate = 0.1;
const descriptionPrefix = "Referral for ";

export const sourceOf = (value: unknown): ClientSource =>
  (clientSourceIds as readonly string[]).includes(String(value)) ? (value as ClientSource) : "company";
export const isReferral = (source: ClientSource) => source.startsWith("ref_");

/** The day the 60/40 bonus ends: one year after client since. */
export function bonusEndDate(clientSince: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clientSince)) return "";
  const [y, m, d] = clientSince.split("-").map(Number);
  const end = new Date(Date.UTC(y + 1, m - 1, d));
  // 29 Feb + 1 year rolls to 1 Mar; keep it on 28 Feb.
  if (end.getUTCMonth() !== m - 1) end.setUTCDate(0);
  return end.toISOString().slice(0, 10);
}

export type Shares = { ae: number; pk: number; referrer: number; label: string };

/** Fractions of a shipment's profit for each couple and the friend. */
export function sharesFor(source: ClientSource, shipmentNumber: number, shipmentDate: string, clientSince: string): Shares {
  const leader = source === "ae" || source === "ref_ae" ? "ae" : source === "pk" || source === "ref_pk" ? "pk" : "";
  const end = bonusEndDate(clientSince);
  const bonus = Boolean(leader) && (!end || !shipmentDate || shipmentDate < end);
  const referrer = isReferral(source) && shipmentNumber >= 1 && shipmentNumber <= referralShipments ? referralRate : 0;
  const [ae, pk] = !bonus ? [0.5, 0.5] : leader === "ae" ? [0.6, 0.4] : [0.4, 0.6];
  const pct = (n: number) => `${Math.round(n * 100)}`;
  const label = referrer
    ? `${pct(ae * (1 - referrer))}/${pct(pk * (1 - referrer))} + friend ${pct(referrer)}`
    : `${pct(ae)}/${pct(pk)}`;
  return { ae: ae * (1 - referrer), pk: pk * (1 - referrer), referrer, label };
}

export type SplitShipment = {
  id: string;
  tracking: string;
  status: string;
  paymentStatus: string;
  shippedOn: string;
  customerId: string;
  customerName: string;
  source: ClientSource;
  referralCode: string;
  referrerName: string;
  referrerPayTo: string;
  clientSince: string;
  number: number;
  /** Profit before the friend's commission, in centavos. */
  profit: number;
  niHaoPaid: boolean;
  shares: Shares;
  /** The friend's commission: what was paid, else 10% of profit. */
  commission: number;
  commissionStatus: "none" | "paid" | "owed" | "waiting-customer" | "waiting-nihao" | "no-profit";
  referralExpense: { id: string; amount: number; date: string; method: string } | null;
  ae: number;
  pk: number;
};

/**
 * Every active shipment with its profit, its number for that customer
 * (1st, 2nd …) and the split. Optional customer filter.
 */
export async function readSplitShipments(db: D1Database, customerId = ""): Promise<SplitShipment[]> {
  let rows: Record<string, unknown>[];
  try {
    rows = (await db.prepare(`SELECT * FROM (
        SELECT s.id, s.tracking_number, s.status, s.payment_status, substr(s.created_at, 1, 10) AS shipped_on,
          s.customer_id, c.full_name, c.client_source, c.referral_code, c.referrer_name, c.referrer_pay_to,
          COALESCE(NULLIF(c.client_since, ''), substr(c.created_at, 1, 10)) AS client_since,
          ROW_NUMBER() OVER (PARTITION BY s.customer_id ORDER BY s.created_at, s.id) AS n,
          (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN invoices i ON i.id = p.invoice_id
            WHERE i.shipment_id = s.id AND i.archived_at IS NULL) AS paid_in,
          (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE s.tracking_number IS NOT NULL
            AND e.tracking_number = s.tracking_number COLLATE NOCASE AND e.category IN (?, ?, ?)) AS costs,
          EXISTS (SELECT 1 FROM expenses e WHERE s.tracking_number IS NOT NULL AND e.category = ?
            AND e.tracking_number = s.tracking_number COLLATE NOCASE) AS nihao_paid,
          (SELECT e.id || '|' || e.amount || '|' || e.expense_date || '|' || COALESCE(e.payment_method, '')
            FROM expenses e WHERE s.tracking_number IS NOT NULL AND e.category = ?
            AND e.tracking_number = s.tracking_number COLLATE NOCASE
            ORDER BY e.created_at LIMIT 1) AS referral_expense
        FROM shipments s JOIN customers c ON c.id = s.customer_id
        WHERE s.status != 'Cancelled' AND s.archived_at IS NULL
      ) WHERE (? = '' OR customer_id = ?)
      ORDER BY shipped_on DESC, n DESC`)
      .bind(niHaoCategory, transferFeesCategory, deliveryCategory, niHaoCategory, referralCategory, customerId, customerId)
      .all<Record<string, unknown>>()).results;
  } catch (error) {
    // Before migration 0041 the customer columns do not exist yet.
    if (error instanceof Error && /no such column/i.test(error.message)) return [];
    throw error;
  }
  return rows.map((row) => {
    const source = sourceOf(row.client_source);
    const number = Number(row.n);
    const shippedOn = String(row.shipped_on ?? "");
    const clientSince = String(row.client_since ?? "");
    const shares = sharesFor(source, number, shippedOn, clientSince);
    const profit = Number(row.paid_in ?? 0) - Number(row.costs ?? 0);
    const [expenseId, amount, date, method] = String(row.referral_expense ?? "").split("|");
    const referralExpense = expenseId ? { id: expenseId, amount: Number(amount), date, method } : null;
    const niHaoPaid = Boolean(Number(row.nihao_paid));
    const paymentStatus = String(row.payment_status ?? "");
    let commission = 0;
    let commissionStatus: SplitShipment["commissionStatus"] = "none";
    if (referralExpense) {
      commission = referralExpense.amount;
      commissionStatus = "paid";
    } else if (shares.referrer) {
      commission = Math.max(0, Math.round(profit * shares.referrer));
      commissionStatus = paymentStatus !== "Paid" ? "waiting-customer" : !niHaoPaid ? "waiting-nihao" : commission > 0 ? "owed" : "no-profit";
    }
    // The couples share what is left after the friend's commission.
    const rest = profit - commission;
    const partners = shares.ae + shares.pk || 1;
    const ae = Math.round((rest * shares.ae) / partners);
    return {
      id: String(row.id), tracking: String(row.tracking_number ?? ""), status: String(row.status ?? ""), paymentStatus, shippedOn,
      customerId: String(row.customer_id), customerName: String(row.full_name ?? ""), source,
      referralCode: String(row.referral_code ?? ""), referrerName: String(row.referrer_name ?? ""), referrerPayTo: String(row.referrer_pay_to ?? ""),
      clientSince, number, profit, niHaoPaid, shares, commission, commissionStatus, referralExpense, ae, pk: rest - ae,
    };
  });
}

/** Commissions ready to pay: client paid in full and Ni Hao paid. */
export async function readReferralsToPay(db: D1Database) {
  return (await readSplitShipments(db)).filter((row) => row.commissionStatus === "owed");
}

const paidFrom = {
  UnionBank: { method: "Bank Transfer", account: "kd-unionbank" },
  GCash: { method: "GCash", account: "kd-gcash" },
  Cash: { method: "Cash", account: "" },
} as const;
type PaidFrom = keyof typeof paidFrom;

const allowedFields = ["csrf", "action", "customer_id", "shipment_id", "expense_date", "amount", "paid_from", "reference_number", "back"];

/** "Paid" on a referral: saves a Referral Commission expense with the tracking number. */
export async function recordReferralPayment(db: D1Database, form: URLSearchParams, user: AdminUser) {
  for (const key of form.keys()) {
    if (!allowedFields.includes(key) || form.getAll(key).length !== 1)
      throw new AdminError("Unexpected or repeated form field.");
  }
  const customerId = form.get("customer_id") ?? "";
  const shipmentId = form.get("shipment_id") ?? "";
  if (!/^[\da-f-]{36}$/i.test(customerId) || !/^[\da-f-]{36}$/i.test(shipmentId)) throw new AdminError("Invalid customer or shipment.");
  const row = (await readSplitShipments(db, customerId)).find((item) => item.id === shipmentId);
  if (!row) throw new AdminError("Shipment not found for this customer.", 404);
  if (row.commissionStatus === "paid") throw new AdminError("This referral is already paid. Check Expenses.", 409);
  if (row.commissionStatus !== "owed") throw new AdminError("This referral is not ready to pay yet. The customer must pay in full and Ni Hao must be paid first.");
  const from = (form.get("paid_from") ?? "") as PaidFrom;
  if (!Object.hasOwn(paidFrom, from)) throw new AdminError("Choose where the money was paid from.");
  const values = expenseSchema.parse({
    expense_date: form.get("expense_date") || philippineToday(),
    category: referralCategory,
    payee: row.referrerName || row.referralCode || "Referrer",
    description: `${descriptionPrefix}${row.tracking}${row.referralCode ? ` (${row.referralCode})` : ""}`,
    amount: form.get("amount") || (row.commission / 100).toFixed(2),
    payment_method: paidFrom[from].method,
    reference_number: form.get("reference_number") ?? "",
    tracking_number: row.tracking,
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
      WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE category = ? AND tracking_number = ? COLLATE NOCASE)`)
      .bind(expenseId, values.expense_date, values.category, values.payee, values.description, values.amount,
        values.payment_method, values.reference_number, values.tracking_number, values.paid_from_account,
        user.id || null, now, now, referralCategory, row.tracking),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
      SELECT ?, ?, 'referral_paid', 'customers', ?, NULL, ?, 'Referral commission saved as an expense.', ?
      WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ?)`)
      .bind(crypto.randomUUID(), user.id || null, customerId,
        JSON.stringify({ expense_id: expenseId, shipment_id: shipmentId, tracking_number: row.tracking, amount: values.amount, paid_from: from, payee: values.payee }), now, expenseId),
  ]);
  if (insert.meta.changes !== 1) throw new AdminError("This referral is already paid. Check Expenses.", 409);
  return expenseId;
}

const nth = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

/** Small form with a Paid button for one owed referral. */
export function referralPayForm(row: SplitShipment, options: { path: string; csrf: string; back?: string }) {
  const accounts = (Object.keys(paidFrom) as PaidFrom[]).map((key) => `<option value="${key}"${key === "GCash" ? " selected" : ""}>${key === "Cash" ? "Cash (owners)" : key}</option>`).join("");
  return `<form method="post" action="${esc(options.path)}" class="referral-pay">
    ${hidden("csrf", options.csrf)}${hidden("action", "referral_paid")}${hidden("customer_id", row.customerId)}${hidden("shipment_id", row.id)}${options.back ? hidden("back", options.back) : ""}
    <select name="paid_from" aria-label="Paid from">${accounts}</select>
    <button type="submit">Paid ${esc(pesos(row.commission))}</button>
  </form>`;
}

const statusPill = (row: SplitShipment) => {
  const pill = (tone: string, text: string) => `<span class="k-pill" data-k="${tone}">${esc(text)}</span>`;
  switch (row.commissionStatus) {
    case "paid": return pill("green", `Paid ${row.referralExpense?.date ?? ""}${row.referralExpense?.method ? ` · ${row.referralExpense.method}` : ""}`);
    case "owed": return pill("amber", "Owed");
    case "waiting-customer": return pill("gray", "Waiting for customer payment");
    case "waiting-nihao": return pill("gray", "Waiting for Ni Hao payment");
    case "no-profit": return pill("gray", "No profit");
    default: return "";
  }
};

/** Customer page: who brought this client, the friend, and the commission per shipment. */
export async function clientSourceSection(db: D1Database, record: Record<string, unknown>, options: { path: string; csrf: string; canWrite: boolean; justPaid?: boolean }) {
  const customerId = String(record.id ?? "");
  const source = sourceOf(record.client_source);
  const clientSince = String(record.client_since || String(record.created_at ?? "").slice(0, 10));
  const end = bonusEndDate(clientSince);
  const leader = source !== "company" && source !== "ref_company";
  const item = (label: string, value: string, note = "") => `<div class="customer-detail-item"><dt>${esc(label)}</dt><dd>${esc(value) || "—"}${note ? `<small class="muted" style="display:block">${esc(note)}</small>` : ""}</dd></div>`;
  let table = "";
  if (isReferral(source)) {
    const shipments = (await readSplitShipments(db, customerId)).sort((a, b) => a.number - b.number);
    const commissioned = shipments.filter((row) => row.shares.referrer || row.referralExpense);
    const friend = String(record.referrer_name || record.referral_code || "Friend");
    table = commissioned.length
      ? `<div class="table"><table><thead><tr><th>Shipment</th><th>Count</th><th class="finance-number">Profit</th><th class="finance-number">${esc(friend)} 10%</th><th>Status</th><th></th></tr></thead><tbody>
        ${commissioned.map((row) => `<tr><td><a href="/admin/shipments?id=${encodeURIComponent(row.id)}">${esc(row.tracking || "No tracking yet")}</a></td><td>${nth(row.number)}</td><td class="finance-number">${esc(pesos(row.profit))}</td><td class="finance-number">${esc(pesos(row.commission))}</td><td>${statusPill(row)}</td>
          <td>${row.commissionStatus === "owed" && options.canWrite ? referralPayForm(row, { path: options.path, csrf: options.csrf, back: "customer" }) : row.referralExpense ? `<a href="/admin/finance/expenses?edit=${encodeURIComponent(row.referralExpense.id)}">Expense</a>` : ""}</td></tr>`).join("")}
        </tbody></table></div>
        <p class="muted">${esc(friend)} earns 10% of the profit on this client's first ${referralShipments} shipments. Paid saves a "Referral Commission" expense. From the 4th shipment: no commission.</p>`
      : `<p class="muted">No shipments yet. ${esc(friend)} earns 10% of the profit on the first ${referralShipments} shipments.</p>`;
  }
  return `<style>.referral-pay{display:inline-flex;gap:6px;align-items:center;margin:0}.referral-pay select{width:auto;margin:0;padding:5px 8px}.referral-pay button{padding:6px 14px;white-space:nowrap}</style><section class="client-source" id="referral">
    <div class="actions" style="justify-content:space-between;margin-top:0"><h2 style="margin:0">Client source &amp; referral</h2>${options.canWrite ? `<a href="/admin/customers?id=${encodeURIComponent(customerId)}&amp;edit=1#client-source">Change</a>` : ""}</div>
    ${options.justPaid ? '<p class="notice" role="status">Referral paid and saved to Expenses.</p>' : ""}
    <dl class="customer-detail-grid">
      ${item("Who brought this client", clientSourceLabels[source])}
      ${isReferral(source) ? item("Referral code", String(record.referral_code ?? "")) + item("Referred by (friend)", String(record.referrer_name ?? "")) + item("Pay friend to", String(record.referrer_pay_to ?? "")) : ""}
      ${item("Client since", clientSince, leader && end ? `60/40 until ${end}, then 50/50` : "50/50")}
    </dl>
    ${table}
  </section>`;
}

/** Edit customer: the dropdown and the referral fields (shown only for a referral, no script needed). */
export function clientSourceFields(record: Record<string, unknown>) {
  const source = sourceOf(record.client_source);
  const options = (Object.keys(clientSourceLabels) as ClientSource[])
    .map((id) => `<option value="${id}"${id === source ? " selected" : ""}>${esc(clientSourceLabels[id])}</option>`).join("");
  const input = (name: string, label: string, max: number, placeholder = "") =>
    `<label class="referral-only">${esc(label)}<input name="${name}" maxlength="${max}" value="${esc(record[name])}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""}></label>`;
  return `<fieldset class="wide client-source-fields" id="client-source">
      <legend>Who brought this client?</legend>
      <div class="grid">
        <label>Who brought this client<select name="client_source">${options}</select></label>
        <label>Client since<input name="client_since" type="date" value="${esc(record.client_since)}"><small class="muted">Starts the 12-month 60/40. Blank = the day the customer was added.</small></label>
        ${input("referral_code", "Referral code", 40, "REF-MARIA")}
        ${input("referrer_name", "Referred by (friend)", 160, "Maria Santos")}
        ${input("referrer_pay_to", "Pay friend to", 160, "GCash 0918 123 4567")}
      </div>
      <style>
        .client-source-fields{border:1px solid #e1e8f3;border-radius:14px;padding:14px 16px}
        .client-source-fields legend{font-weight:800;padding:0 6px}
        .client-source-fields .referral-only{display:none}
        .client-source-fields:has(select[name="client_source"] option[value^="ref_"]:checked) .referral-only{display:block}
      </style>
    </fieldset>`;
}

/** Shipment page: two read-only lines under Internal finance. */
export function shipmentSourceLines(record: Record<string, unknown> | null, line: (label: string, value: string) => string) {
  if (!record) return "";
  const source = sourceOf(record.client_source);
  return line("Who brought this client", esc(clientSourceLabels[source])) +
    (isReferral(source) ? line("Referral code", esc([record.referral_code, record.referrer_name].filter(Boolean).join(" · ")) || "—") : "");
}

/** The customer's source for a shipment page (null before migration 0041). */
export async function readCustomerSource(db: D1Database, customerId: unknown) {
  if (!customerId) return null;
  try {
    return await db.prepare("SELECT client_source, referral_code, referrer_name FROM customers WHERE id = ?").bind(String(customerId)).first<Record<string, unknown>>();
  } catch (error) {
    if (error instanceof Error && /no such column/i.test(error.message)) return null;
    throw error;
  }
}

/** Totals for the Profit & Split tab (shipments whose dates fall in the range). */
export function splitTotals(rows: SplitShipment[]) {
  return rows.reduce((sum, row) => ({
    profit: sum.profit + row.profit,
    ae: sum.ae + row.ae,
    pk: sum.pk + row.pk,
    referrers: sum.referrers + row.commission,
  }), { profit: 0, ae: 0, pk: 0, referrers: 0 });
}

export { nth };
