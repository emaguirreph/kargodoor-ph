import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import { expenseSchema, expenseCategories, expensePaymentMethods, parseExpenseForm, type RecordData } from "./validation";
import { AdminError, canDeleteAdmin, isRestrictedStaff, type AdminUser } from "./security";
import { page, esc, pesos, input, hidden } from "./ui";
import { philippineToday } from "./finance-dates";
import { proofCell, proofCss, readProofs } from "./payment-proof";
import { deliveryCategory, niHaoCategory, transferFeesCategory } from "./cost-breakdown";
import { gcashTransferSection, lastGcashTransferFee } from "./transfer-fees";
import { costBreakdown, costBreakdownCards } from "./cost-breakdown";
import { bankAccountLabel, bankAccountSelect, kargodoorBankAccounts, nihaoBankAccounts } from "./bank-accounts";

const path = "/admin/finance/expenses";
export async function saveExpense(db: D1Database, values: z.infer<typeof expenseSchema>, createdBy?: string) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO expenses
    (id, expense_date, category, payee, description, amount, payment_method,
     reference_number, tracking_number, notes, paid_from_account, paid_to_account, created_by_admin_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), values.expense_date, values.category, values.payee,
      values.description, values.amount, values.payment_method, values.reference_number,
      values.tracking_number, values.notes, values.paid_from_account ?? null, values.paid_to_account ?? null,
      createdBy ?? null, now, now).run();
}

const expenseJson = `json_object('expense_date', expense_date, 'category', category, 'payee', payee,
  'description', description, 'amount', amount, 'payment_method', payment_method,
  'reference_number', reference_number, 'tracking_number', tracking_number, 'notes', notes,
  'paid_from_account', paid_from_account, 'paid_to_account', paid_to_account)`;

const mutationSchema = z.object({
  action: z.enum(["edit", "delete"]),
  id: z.string().uuid(),
  revision: z.string().min(1).max(40),
});

// Called only after the shared handler authenticates and checks origin and CSRF.
export async function mutateExpense(db: D1Database, form: URLSearchParams, user: AdminUser = { id: "", name: "Admin", email: "", role: "admin" }) {
  if (!form.has("action")) {
    await saveExpense(db, parseExpenseForm(form), user.id);
    return "saved";
  }
  const metadata = mutationSchema.parse(Object.fromEntries(
    ["action", "id", "revision"].map((key) => [key, form.get(key)]),
  ));
  const allowed = metadata.action === "edit"
    ? [...Object.keys(expenseSchema.shape), "csrf", "action", "id", "revision"]
    : ["csrf", "action", "id", "revision", "confirm"];
  for (const key of form.keys()) {
    if (!allowed.includes(key) || form.getAll(key).length !== 1)
      throw new AdminError("Unexpected or repeated expense field.");
  }
  if (metadata.action === "delete") {
    if (!canDeleteAdmin(user)) throw new AdminError("Only the owner can delete expenses.", 403);
    if (form.get("confirm") !== "yes") throw new AdminError("Confirm the expense deletion.");
    // The log row keeps a copy of the deleted expense for the books.
    const [, result] = await db.batch([
      db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
        SELECT ?, ?, 'delete', 'expenses', id, ${expenseJson}, NULL, 'Expense deleted.', ?
        FROM expenses WHERE id = ? AND updated_at = ?`)
        .bind(crypto.randomUUID(), user.id, new Date().toISOString(), metadata.id, metadata.revision),
      db.prepare("DELETE FROM expenses WHERE id = ? AND updated_at = ?")
        .bind(metadata.id, metadata.revision),
      // Its proof of payment goes too, but only when the expense really was deleted.
      db.prepare("DELETE FROM payment_proofs WHERE entity_type = 'expense' AND entity_id = ? AND NOT EXISTS (SELECT 1 FROM expenses WHERE id = ?)")
        .bind(metadata.id, metadata.id),
    ]);
    if (result.meta.changes !== 1) throw new AdminError("Expense changed or no longer exists. Reload Expenses before trying again.", 409);
    return "deleted";
  }
  const valuesForm = new URLSearchParams(form);
  for (const key of ["action", "id", "revision"]) valuesForm.delete(key);
  const values = parseExpenseForm(valuesForm);
  // Ensure even two edits in the same millisecond receive different revisions.
  const previousTime = Date.parse(metadata.revision);
  const now = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
  const owned = isRestrictedStaff(user) ? " AND created_by_admin_user_id = ?" : "";
  const scope = [metadata.id, metadata.revision, ...(isRestrictedStaff(user) ? [user.id] : [])];
  const [, result] = await db.batch([
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
      SELECT ?, ?, 'update', 'expenses', id, ${expenseJson}, ?, NULL, ?
      FROM expenses WHERE id = ? AND updated_at = ?${owned}`)
      .bind(crypto.randomUUID(), user.id, JSON.stringify(values), now, ...scope),
    db.prepare(`UPDATE expenses SET expense_date = ?, category = ?, payee = ?,
      description = ?, amount = ?, payment_method = ?, reference_number = ?, tracking_number = ?, notes = ?,
      paid_from_account = ?, paid_to_account = ?, updated_at = ?
      WHERE id = ? AND updated_at = ?${owned}`)
      .bind(values.expense_date, values.category, values.payee, values.description, values.amount,
        values.payment_method, values.reference_number, values.tracking_number, values.notes,
        values.paid_from_account ?? null, values.paid_to_account ?? null, now, ...scope),
  ]);
  if (result.meta.changes !== 1) throw new AdminError("Expense changed or no longer exists. Reload Expenses before trying again.", 409);
  return "updated";
}

// Bank Accounts page links here with the account (and for Ni Hao, the payee and
// category) already chosen. Anything not on the approved lists is ignored.
function newExpensePrefill(url: URL): RecordData {
  const pick = <T extends string>(key: string, options: readonly T[]) => {
    const value = url.searchParams.get(key) ?? "";
    return options.some((option) => option === value) ? { [key]: value } : {};
  };
  const prefill: RecordData = {
    ...pick("category", expenseCategories),
    ...pick("payment_method", expensePaymentMethods),
    ...pick("paid_from_account", kargodoorBankAccounts.map((account) => account.id)),
    ...pick("paid_to_account", nihaoBankAccounts.map((account) => account.id)),
  };
  if (prefill.paid_to_account) prefill.payee = nihaoBankAccounts[0].accountName;
  return prefill;
}

function dropdown(key: string, label: string, options: readonly string[], value: unknown, prompt: string, required = false) {
  return `<label>${esc(label)}${required ? " *" : ""}<select name="${key}"${required ? " required" : ""}>
    <option value="">${esc(prompt)}</option>${options.map((option) => `<option value="${esc(option)}"${value === option ? " selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`;
}

const filterDate = z.string().refine((value) => !value || (
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value
), "Enter a valid filter date");
const filterSchema = z.object({
  from: filterDate,
  to: filterDate,
  category: z.union([z.enum(expenseCategories), z.literal("")]),
  payment_method: z.union([z.enum(expensePaymentMethods), z.literal("")]),
  q: z.string().trim().max(160),
}).refine((v) => !v.from || !v.to || v.from <= v.to, "From Date must not be after To Date");

export async function expensesPage(db: D1Database, url: URL, user: AdminUser | string, csrf: string, canWrite = true) {
  const actor: AdminUser = typeof user === "string" ? { id: "", name: user, email: "", role: "admin" } : user;
  const staff = isRestrictedStaff(actor);
  const canDelete = canDeleteAdmin(actor);
  const edit = url.searchParams.get("edit");
  const remove = url.searchParams.get("delete");
  const add = url.searchParams.get("new") === "1";
  if (!canDelete && remove !== null) throw new AdminError("Only the owner can delete expenses.", 403);
  if ([Boolean(edit), Boolean(remove), add].filter(Boolean).length > 1)
    throw new AdminError("Choose one expense action.");
  let record: RecordData = {};
  if (edit !== null || remove !== null) {
    const id = z.string().uuid().parse(edit ?? remove);
    const found = await db.prepare(`SELECT id, expense_date, category, payee, description, amount,
      payment_method, reference_number, tracking_number, notes, paid_from_account, paid_to_account, created_at, updated_at FROM expenses WHERE id = ?${staff ? " AND created_by_admin_user_id = ?" : ""}`)
      .bind(id, ...(staff ? [actor.id] : [])).first<RecordData>();
    if (!found) throw new AdminError("Expense not found.", 404);
    record = found;
  }
  if (remove !== null) {
    return page("Delete Expense", `<section><p>Confirm deletion of this expense. This cannot be undone.</p>
      <dl><dt>Date</dt><dd>${esc(record.expense_date)}</dd><dt>Payee</dt><dd>${esc(record.payee) || "—"}</dd>
      <dt>Description</dt><dd>${esc(record.description)}</dd><dt>Amount</dt><dd>${esc(pesos(record.amount))}</dd></dl>
      <form method="post" action="${path}">${hidden("csrf", csrf)}${hidden("action", "delete")}
      ${hidden("id", record.id)}${hidden("revision", record.updated_at)}
      <div class="actions"><button type="submit" name="confirm" value="yes">Confirm Delete</button>
      <a href="${path}">Cancel</a></div></form></section>`, actor.name, 200, {}, canWrite, staff);
  }
  if (add || edit !== null) {
    if (add) record = { expense_date: philippineToday(), ...newExpensePrefill(url) };
    const historical = edit !== null && !expenseCategories.some((category) => category === record.category)
      ? `<p class="notice">Saved category: ${esc(record.category)}. Select an approved category to save changes.</p>` : "";
    const oldMethod = edit !== null && record.payment_method && !expensePaymentMethods.some((method) => method === record.payment_method)
      ? `<p class="notice">Saved payment method: ${esc(record.payment_method)}. Select a listed method or leave it blank.</p>` : "";
    const form = input("expense_date", "Expense date", record, "date", true)
      + dropdown("category", "Category", expenseCategories, record.category, "Select category", true)
      + input("payee", "Payee", record)
      + `<label class="wide">Description *<textarea name="description" required maxlength="2000">${esc(record.description)}</textarea></label>`
      + `<label>Amount (PHP) *<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required value="${record.amount === undefined ? "" : esc(`${BigInt(String(record.amount)) / BigInt(100)}.${(BigInt(String(record.amount)) % BigInt(100)).toString().padStart(2, "0")}`)}"></label>`
      + dropdown("payment_method", "Payment Method", expensePaymentMethods, record.payment_method, "Select payment method")
      + bankAccountSelect("paid_from_account", "Paid from (KargoDoor account)", kargodoorBankAccounts, record.paid_from_account, "Not recorded / cash")
      + bankAccountSelect("paid_to_account", "Paid to (Ni Hao account)", nihaoBankAccounts, record.paid_to_account, "Not a Ni Hao bank payment")
      + input("reference_number", "Reference number", record)
      + input("tracking_number", "Tracking number (Ni Hao cost for one shipment)", record)
      + `<label class="wide">Notes<textarea name="notes" maxlength="4000">${esc(record.notes)}</textarea></label>`;
    return page(edit !== null ? "Edit Expense" : "Add Expense", `<section><p class="notice"><strong>Use this form when KargoDoor pays money out</strong> for a supplier, freight partner, package cost, or operating cost. This reduces cash. If the customer must reimburse a package cost, save the expense first, then record the amount owed in <a href="/admin/finance/cash?new=1&amp;type=Customer%20Reimbursement%20Due">Cash Flow &amp; Customer Credits</a>.</p>${historical}${oldMethod}<form method="post" action="${path}">
      ${hidden("csrf", csrf)}${edit !== null ? hidden("action", "edit") + hidden("id", record.id) + hidden("revision", record.updated_at) : ""}
      <div class="grid">${form}</div><p class="muted">* Required. For a Freight / Ni Hao Cost expense, enter the shipment's tracking number if its Ni Hao cost is already saved on the shipment, so it is not counted twice. Leave it blank for lump-sum Ni Hao payments.</p>
      <div class="actions"><button type="submit">Save expense</button><a href="${path}">Cancel</a></div>
      </form></section>${edit !== null ? await (async () => {
        const id = String(record.id);
        const proof = (await readProofs(db, "expense", [id])).get(id);
        const cell = proofCell({ kind: "expense", id, proof, csrf, canWrite, back: `${path}?edit=${id}#expense-proof` });
        return `<section id="expense-proof"><h2>Proof of payment</h2>
          ${url.searchParams.get("proof") === "1" ? '<p class="notice" role="status">Proof of payment uploaded.</p>' : ""}
          <p class="muted">The receipt, GCash or bank screenshot, or PDF for this expense. Drag it onto the box or click Add proof. PDF or photo, up to 1.5 MB. Uploading again replaces it.</p>
          ${cell.inline}${proofCss}</section>`;
      })() : ""}`, actor.name, 200, {}, canWrite, staff);
  }
  const filters = filterSchema.parse(Object.fromEntries(
    ["from", "to", "category", "payment_method", "q"].map((key) => [key, url.searchParams.get(key) ?? ""]),
  ));
  const { results } = await db.prepare(`SELECT id, expense_date, category, payee, description,
    amount, payment_method, paid_from_account, paid_to_account, reference_number, tracking_number, notes FROM expenses
    WHERE (${staff ? "created_by_admin_user_id = ?" : "1 = 1"}) AND (? = '' OR expense_date >= ?) AND (? = '' OR expense_date <= ?)
      AND (? = '' OR category = ?) AND (? = '' OR payment_method = ?)
      AND (? = '' OR instr(lower(COALESCE(payee, '')), lower(?)) > 0
        OR instr(lower(description), lower(?)) > 0
        OR instr(lower(COALESCE(reference_number, '')), lower(?)) > 0
        OR instr(lower(COALESCE(notes, '')), lower(?)) > 0)
    ORDER BY expense_date DESC, created_at DESC, id DESC`)
    .bind(...(staff ? [actor.id] : []), filters.from, filters.from, filters.to, filters.to, filters.category, filters.category,
      filters.payment_method, filters.payment_method, filters.q, filters.q, filters.q, filters.q, filters.q)
    .all<RecordData>();
  // Columns Em asked for (2026-11-03): Ni Hao cost, transfer fee and delivery
  // fee each in its own column, one row per shipment, then the total. The
  // proof lives in Edit expense, not the list.
  const lines = groupExpenses(results);
  const editLink = (label: string, row: RecordData | undefined) => row ? `<a href="${path}?edit=${esc(encodeURIComponent(String(row.id)))}">${label}</a>` : "";
  const deleteLink = (label: string, row: RecordData | undefined) => row && canDelete ? `<a href="${path}?delete=${esc(encodeURIComponent(String(row.id)))}">${label}</a>` : "";
  const many = (line: ExpenseLine) => line.records.length > 1;
  const actions = (line: ExpenseLine) => {
    if (!many(line)) return [editLink("Edit", line.records[0]), deleteLink("Delete", line.records[0])].filter(Boolean).join("<br>");
    return [editLink("Edit Ni Hao", line.niHao), editLink("Edit fee", line.fee), editLink("Edit delivery", line.delivery),
      deleteLink("Delete Ni Hao", line.niHao), deleteLink("Delete fee", line.fee), deleteLink("Delete delivery", line.delivery)].filter(Boolean).join("<br>");
  };
  const money = (row: RecordData | undefined) => row ? esc(pesos(row.amount)) : '<span class="muted">—</span>';
  const accounts = (line: ExpenseLine, key: "paid_from_account" | "paid_to_account") => [...new Set(line.records.map((row) => bankAccountLabel(row[key])).filter(Boolean))].map(esc).join("<br>") || "—";
  const notes = (line: ExpenseLine) => line.records.map((row) => String(row.notes ?? "").trim()).filter(Boolean).map(esc).join("<br>") || "—";
  const table = results.length ? `<div class="table"><table class="expense-list"><thead><tr>
    ${canWrite ? '<th class="exp-tight">Actions</th>' : ""}<th class="exp-tight">Date</th><th>Category</th><th>Payee</th><th class="exp-wide">Description</th>
    <th class="exp-num">Ni Hao cost</th><th class="exp-num">Transfer fee</th><th class="exp-num">Delivery fee</th><th class="exp-num">Total</th>
    <th>Paid from</th><th>Paid to</th><th class="exp-wide">Notes</th></tr></thead><tbody>
    ${lines.map((line) => `<tr>${canWrite ? `<td class="exp-tight">${actions(line)}</td>` : ""}
      <td class="exp-tight">${esc(line.main.expense_date)}</td><td>${esc(line.main.category)}</td><td>${esc(line.main.payee) || "—"}</td>
      <td class="exp-wide">${esc(line.main.description)}</td>
      <td class="exp-num">${money(line.niHao)}</td><td class="exp-num">${money(line.fee)}</td><td class="exp-num">${money(line.delivery)}</td>
      <td class="exp-num"><strong>${esc(pesos(line.total))}</strong></td>
      <td>${accounts(line, "paid_from_account")}</td><td>${accounts(line, "paid_to_account")}</td><td class="exp-wide">${notes(line)}</td></tr>`).join("")}
    </tbody></table></div>
    <style>.expense-list .exp-tight,.expense-list .exp-num{white-space:nowrap;overflow-wrap:normal;word-break:normal}.expense-list .exp-num{text-align:right;font-variant-numeric:tabular-nums}.expense-list .exp-wide{min-width:200px}.expense-list .exp-split{display:block;font-size:.8rem}.expense-list th,.expense-list td{overflow-wrap:break-word;word-break:normal;vertical-align:top}</style>` : "<p>No expenses found.</p>";
  const notice = url.searchParams.get("deleted") === "1" ? "Expense deleted." : url.searchParams.get("updated") === "1" ? "Expense updated." : url.searchParams.get("saved") === "1" ? "Expense saved. To add its proof of payment, click Edit." : url.searchParams.get("proof") === "1" ? "Proof of payment uploaded." : "";
  // Owner money, opening cash and adjustments are not sales, but they are
  // money in, so they sit next to money out (staff only see their expenses).
  const moneyIn = staff ? [] : (await db.prepare(`SELECT id, entry_date, entry_type, amount, reference_number, notes
    FROM finance_cash_entries ORDER BY entry_date DESC, created_at DESC LIMIT 50`).all<RecordData>()).results;
  const moneyInSection = staff ? "" : `<section><div class="actions"><h2>Money In (not sales)</h2>
    ${canWrite ? `<a class="button" href="/admin/finance/cash?new=1">+ Add money in</a>` : ""}<a href="/admin/finance/cash">All records</a></div>
    <p class="muted">Opening cash, owner money, adjustments and customer credits. Customer invoice payments are under Invoices &amp; Payments.</p>
    ${moneyIn.length ? `<div class="table"><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Notes</th></tr></thead><tbody>${moneyIn.map((row) => `<tr><td>${esc(row.entry_date)}</td><td>${esc(row.entry_type)}</td><td><strong>${esc(pesos(row.amount))}</strong></td><td>${esc(row.notes) || "—"}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No money-in records yet.</p>'}</section>`;
  return page("Expenses", `${notice ? `<p class="notice" role="status">${notice}</p>` : ""}
    <section><div class="actions">${staff ? "" : `<a href="/admin/finance">Money Today</a>`}<a href="${path}"><strong>Expenses</strong></a>${staff ? "" : `<a href="/admin/finance/accounts">Bank Accounts</a>`}${canWrite ? `<a class="button" href="${path}?new=1">Add Expense</a>` : ""}</div>
    ${staff ? "" : `<p class="muted">Paying Ni Hao? Use Mark Ni Hao paid in Edit shipment › Ni Hao tab. Its transfer fee and the rider delivery show in the same row, each in its own column. Moving GCash to UnionBank? Use the box below.</p>`}</section>
    <section><form method="get" action="${path}" class="search">
      ${input("q", "Search", filters)}${input("from", "From Date", filters, "date")}${input("to", "To Date", filters, "date")}
      ${dropdown("category", "Category", expenseCategories, filters.category, "All Categories")}
      ${dropdown("payment_method", "Payment Method", expensePaymentMethods, filters.payment_method, "All Payment Methods")}
      <button type="submit">Apply Filters</button><a href="${path}">Clear Filters</a></form></section>
    ${!staff && canWrite ? gcashTransferSection({ path, csrf, suggestedFee: await lastGcashTransferFee(db), justSaved: url.searchParams.get("transfer") === "1" }) : ""}
    ${costBreakdownCards(costBreakdown(results))}
    <section>${table}</section>
    ${moneyInSection}`, actor.name, 200, {}, canWrite, staff);
}

export type ExpenseLine = {
  main: RecordData;
  records: RecordData[];
  niHao?: RecordData;
  fee?: RecordData;
  delivery?: RecordData;
  total: number;
};

/**
 * One list row per shipment: its Ni Hao payment, the transfer fee to Ni Hao
 * and the rider delivery (same tracking number) share a row, each in its own
 * column. Every other expense is its own row. The records stay separate.
 */
export function groupExpenses(results: RecordData[]): ExpenseLine[] {
  const key = (row: RecordData) => String(row.tracking_number ?? "").trim().toLowerCase();
  const isFee = (row: RecordData) => row.category === transferFeesCategory;
  const isShipmentFee = (row: RecordData) => isFee(row) && / to Ni Hao for /.test(String(row.description ?? ""));
  const isDelivery = (row: RecordData) => row.category === deliveryCategory;
  const lines: ExpenseLine[] = [];
  const byTracking = new Map<string, ExpenseLine>();
  const slot = (row: RecordData): "niHao" | "fee" | "delivery" | null =>
    row.category === niHaoCategory ? "niHao" : isFee(row) ? "fee" : isDelivery(row) ? "delivery" : null;
  for (const row of results) {
    const kind = slot(row);
    const groupable = key(row) && (kind === "niHao" || isShipmentFee(row) || (kind === "delivery" && /^Delivery for /.test(String(row.description ?? ""))));
    const existing = groupable ? byTracking.get(key(row)) : undefined;
    if (existing && kind && !existing[kind]) {
      existing[kind] = row;
      existing.records.push(row);
      existing.total += Number(row.amount ?? 0) || 0;
      if (kind === "niHao") existing.main = row;
      continue;
    }
    const line: ExpenseLine = { main: row, records: [row], total: Number(row.amount ?? 0) || 0 };
    if (kind) line[kind] = row;
    lines.push(line);
    if (groupable && !existing) byTracking.set(key(row), line);
  }
  return lines;
}
