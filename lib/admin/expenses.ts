import type { D1Database } from "@cloudflare/workers-types";
import type { z } from "zod";
import { expenseSchema, expenseCategories, expensePaymentMethods, type RecordData } from "./validation";
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

export async function expensesPage(db: D1Database, url: URL, user: string, csrf: string) {
  if (url.searchParams.get("new") === "1") {
    const form = input("expense_date", "Expense date", {}, "date", true)
      + `<label>Category *<select name="category" required><option value="">Select category</option>${expenseCategories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}</select></label>`
      + input("payee", "Payee", {})
      + '<label class="wide">Description *<textarea name="description" required maxlength="2000"></textarea></label>'
      + '<label>Amount (PHP) *<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required></label>'
      + `<label>Payment Method<select name="payment_method"><option value="">Select payment method</option>${expensePaymentMethods.map((method) => `<option value="${esc(method)}">${esc(method)}</option>`).join("")}</select></label>`
      + input("reference_number", "Reference number", {})
      + '<label class="wide">Notes<textarea name="notes" maxlength="4000"></textarea></label>';
    return page("Add Expense", `<section><form method="post" action="${path}">
      ${hidden("csrf", csrf)}<div class="grid">${form}</div><p class="muted">* Required.</p>
      <div class="actions"><button type="submit">Save expense</button><a href="${path}">Cancel</a></div>
      </form></section>`, user);
  }
  const { results } = await db.prepare(`SELECT expense_date, category, payee, description,
    amount, payment_method, reference_number, notes FROM expenses
    ORDER BY expense_date DESC, created_at DESC, id DESC`).all<RecordData>();
  const table = results.length ? `<div class="table"><table><thead><tr>
    ${fields.map(([, label]) => `<th>${label}</th>`).join("")}</tr></thead><tbody>
    ${results.map((row) => `<tr>${fields.map(([key]) => `<td>${key === "amount" ? esc(pesos(row[key])) : esc(row[key]) || "—"}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div>` : "<p>No expenses yet.</p>";
  return page("Expenses", `${url.searchParams.get("saved") === "1" ? '<p class="notice" role="status">Expense saved.</p>' : ""}
    <section><div class="actions"><a class="button" href="${path}?new=1">Add Expense</a>
    <a href="/admin/finance">Back to Finance</a></div></section><section>${table}</section>`, user);
}
