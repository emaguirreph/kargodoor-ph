import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import { expenseSchema, expenseCategories, expensePaymentMethods, parseExpenseForm, type RecordData } from "./validation";
import { AdminError } from "./security";
import { page, esc, pesos, input, hidden } from "./ui";

const path = "/admin/finance/expenses";
const fields = [
  ["expense_date", "Expense date"], ["category", "Category"],
  ["payee", "Payee"], ["description", "Description"], ["amount", "Amount"],
  ["payment_method", "Payment method"], ["reference_number", "Reference number"],
  ["notes", "Notes"],
] as const;

export async function saveExpense(db: D1Database, values: z.infer<typeof expenseSchema>) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO expenses
    (id, expense_date, category, payee, description, amount, payment_method,
     reference_number, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), values.expense_date, values.category, values.payee,
      values.description, values.amount, values.payment_method, values.reference_number,
      values.notes, now, now).run();
}

const mutationSchema = z.object({
  action: z.enum(["edit", "delete"]),
  id: z.string().uuid(),
  revision: z.string().min(1).max(40),
});

// Called only after the shared handler authenticates and checks origin and CSRF.
export async function mutateExpense(db: D1Database, form: URLSearchParams) {
  if (!form.has("action")) {
    await saveExpense(db, parseExpenseForm(form));
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
    if (form.get("confirm") !== "yes") throw new AdminError("Confirm the expense deletion.");
    const result = await db.prepare("DELETE FROM expenses WHERE id = ? AND updated_at = ?")
      .bind(metadata.id, metadata.revision).run();
    if (result.meta.changes !== 1) throw new AdminError("Expense changed or no longer exists. Reload Expenses before trying again.", 409);
    return "deleted";
  }
  const valuesForm = new URLSearchParams(form);
  for (const key of ["action", "id", "revision"]) valuesForm.delete(key);
  const values = parseExpenseForm(valuesForm);
  // Ensure even two edits in the same millisecond receive different revisions.
  const previousTime = Date.parse(metadata.revision);
  const now = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
  const result = await db.prepare(`UPDATE expenses SET expense_date = ?, category = ?, payee = ?,
    description = ?, amount = ?, payment_method = ?, reference_number = ?, notes = ?, updated_at = ?
    WHERE id = ? AND updated_at = ?`)
    .bind(values.expense_date, values.category, values.payee, values.description, values.amount,
      values.payment_method, values.reference_number, values.notes, now, metadata.id, metadata.revision).run();
  if (result.meta.changes !== 1) throw new AdminError("Expense changed or no longer exists. Reload Expenses before trying again.", 409);
  return "updated";
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

function totalPesos(rows: RecordData[]) {
  // Accumulate and format with integers, including totals beyond Number's safe range.
  const total = rows.reduce((sum, row) => sum + BigInt(String(row.amount)), BigInt(0));
  return `₱${(total / BigInt(100)).toLocaleString("en-PH")}.${(total % BigInt(100)).toString().padStart(2, "0")}`;
}

export async function expensesPage(db: D1Database, url: URL, user: string, csrf: string) {
  const edit = url.searchParams.get("edit");
  const remove = url.searchParams.get("delete");
  const add = url.searchParams.get("new") === "1";
  if ([Boolean(edit), Boolean(remove), add].filter(Boolean).length > 1)
    throw new AdminError("Choose one expense action.");
  let record: RecordData = {};
  if (edit !== null || remove !== null) {
    const id = z.string().uuid().parse(edit ?? remove);
    const found = await db.prepare(`SELECT id, expense_date, category, payee, description, amount,
      payment_method, reference_number, notes, updated_at FROM expenses WHERE id = ?`).bind(id).first<RecordData>();
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
      <a href="${path}">Cancel</a></div></form></section>`, user);
  }
  if (add || edit !== null) {
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
      + input("reference_number", "Reference number", record)
      + `<label class="wide">Notes<textarea name="notes" maxlength="4000">${esc(record.notes)}</textarea></label>`;
    return page(edit !== null ? "Edit Expense" : "Add Expense", `<section>${historical}${oldMethod}<form method="post" action="${path}">
      ${hidden("csrf", csrf)}${edit !== null ? hidden("action", "edit") + hidden("id", record.id) + hidden("revision", record.updated_at) : ""}
      <div class="grid">${form}</div><p class="muted">* Required.</p>
      <div class="actions"><button type="submit">Save expense</button><a href="${path}">Cancel</a></div>
      </form></section>`, user);
  }
  const filters = filterSchema.parse(Object.fromEntries(
    ["from", "to", "category", "payment_method", "q"].map((key) => [key, url.searchParams.get(key) ?? ""]),
  ));
  const { results } = await db.prepare(`SELECT id, expense_date, category, payee, description,
    amount, payment_method, reference_number, notes FROM expenses
    WHERE (? = '' OR expense_date >= ?) AND (? = '' OR expense_date <= ?)
      AND (? = '' OR category = ?) AND (? = '' OR payment_method = ?)
      AND (? = '' OR instr(lower(COALESCE(payee, '')), lower(?)) > 0
        OR instr(lower(description), lower(?)) > 0
        OR instr(lower(COALESCE(reference_number, '')), lower(?)) > 0
        OR instr(lower(COALESCE(notes, '')), lower(?)) > 0)
    ORDER BY expense_date DESC, created_at DESC, id DESC`)
    .bind(filters.from, filters.from, filters.to, filters.to, filters.category, filters.category,
      filters.payment_method, filters.payment_method, filters.q, filters.q, filters.q, filters.q, filters.q)
    .all<RecordData>();
  const table = results.length ? `<div class="table"><table><thead><tr>
    ${fields.map(([, label]) => `<th>${label}</th>`).join("")}<th>Actions</th></tr></thead><tbody>
    ${results.map((row) => `<tr>${fields.map(([key]) => `<td>${key === "amount" ? esc(pesos(row[key])) : esc(row[key]) || "—"}</td>`).join("")}
      <td><a href="${path}?edit=${esc(encodeURIComponent(String(row.id)))}">Edit</a> <a href="${path}?delete=${esc(encodeURIComponent(String(row.id)))}">Delete</a></td></tr>`).join("")}
    </tbody></table></div>` : "<p>No expenses found.</p>";
  const notice = url.searchParams.get("deleted") === "1" ? "Expense deleted." : url.searchParams.get("updated") === "1" ? "Expense updated." : url.searchParams.get("saved") === "1" ? "Expense saved." : "";
  return page("Expenses", `${notice ? `<p class="notice" role="status">${notice}</p>` : ""}
    <section><div class="actions"><a class="button" href="${path}?new=1">Add Expense</a>
    <a href="/admin/finance">Back to Finance</a></div></section>
    <section><form method="get" action="${path}" class="search">
      ${input("q", "Search", filters)}${input("from", "From Date", filters, "date")}${input("to", "To Date", filters, "date")}
      ${dropdown("category", "Category", expenseCategories, filters.category, "All Categories")}
      ${dropdown("payment_method", "Payment Method", expensePaymentMethods, filters.payment_method, "All Payment Methods")}
      <button type="submit">Apply Filters</button><a href="${path}">Clear Filters</a></form></section>
    <div class="card"><h2>Total Expenses</h2><strong>${esc(totalPesos(results))}</strong></div>
    <section>${table}</section>`, user);
}
