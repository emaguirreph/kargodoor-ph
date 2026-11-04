import type { D1Database } from "@cloudflare/workers-types";
import {
  bankAccountDetails, bankAccountLabel, kargodoorBankAccounts, nihaoBankAccounts, nihaoPayableTo, type BankAccount,
} from "./bank-accounts";
import { cashTypes } from "./finance-cash";
import { esc, page, pesos } from "./ui";

const path = "/admin/finance/accounts";
const tabs = [["nihao", "Ni Hao Bank Accounts"], ["kargodoor", "KargoDoor Bank Accounts"]] as const;
type Tab = (typeof tabs)[number][0];

type ExpenseRow = { id: string; expense_date: string; category: string; payee: string | null; description: string; amount: string; paid_from_account: string | null; paid_to_account: string | null; reference_number: string | null };
type CashRow = { id: string; entry_date: string; entry_type: string; amount: string; bank_account: string; reference_number: string | null; notes: string; customer_name: string | null };

const style = `<style>
.bank-tabs{display:flex;flex-wrap:wrap;gap:8px;border-bottom:2px solid #c6dce9;margin:0 0 20px}
.bank-tabs a{padding:10px 18px;border:1px solid #c6dce9;border-bottom:0;border-radius:8px 8px 0 0;background:#f4f9fd;text-decoration:none;font-weight:600;margin-bottom:-2px}
.bank-tabs a[aria-current="page"]{background:white;border-color:#0753ad;border-bottom:2px solid white;color:#154876}
.bank-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.bank-card h3{margin:0 0 4px;font-size:1.15rem}.bank-card .bank-number{font:700 1.3rem/1.3 ui-monospace,Menlo,monospace;letter-spacing:.03em;margin:12px 0 4px;overflow-wrap:anywhere}
.bank-card dl{grid-template-columns:120px minmax(0,1fr);gap:6px;margin:14px 0 0;font-size:.95rem}
.bank-card .actions{margin-top:14px;gap:10px}.bank-card .actions button{padding:8px 14px}
.bank-name{margin:0;font-weight:700}.bank-hidden{display:none}.bank-in{color:#1d6b3a}.bank-out{color:#a3261f}
@media(max-width:760px){.bank-tabs a{flex:1;text-align:center;padding:10px 8px}.bank-card dl{grid-template-columns:1fr}}
</style>`;

const expenseLink = (params: Record<string, string>) => `/admin/finance/expenses?${new URLSearchParams({ new: "1", ...params }).toString()}`;
const cashLink = (params: Record<string, string>) => `/admin/finance/cash?${new URLSearchParams({ new: "1", ...params }).toString()}`;

function sum(values: string[]) {
  return values.reduce((total, value) => total + BigInt(value), BigInt(0));
}

function accountCard(account: BankAccount, stats: string, links: string, canWrite: boolean) {
  const numberId = `bank-number-${account.id}`;
  const detailsId = `bank-details-${account.id}`;
  return `<div class="card bank-card">
    <h3>${esc(account.bank)}</h3><p class="muted" style="margin:0">${esc(account.branch)}</p>
    <p class="bank-number" id="${numberId}">${esc(account.accountNumber)}</p>
    <p class="bank-name">${esc(account.accountName)}</p>
    <pre class="bank-hidden" id="${detailsId}">${esc(bankAccountDetails(account))}</pre>
    <div class="actions"><button type="button" data-copy-source="${numberId}">Copy number</button><button type="button" data-copy-source="${detailsId}">Copy all details</button></div>
    <dl>${stats}</dl>
    ${canWrite ? `<div class="actions">${links}</div>` : ""}
  </div>`;
}

async function nihaoTab(db: D1Database, canWrite: boolean) {
  const { results } = await db.prepare(`SELECT id, expense_date, category, payee, description, CAST(amount AS TEXT) AS amount,
      paid_from_account, paid_to_account, reference_number
    FROM expenses WHERE paid_to_account IN (${nihaoBankAccounts.map(() => "?").join(",")})
    ORDER BY expense_date DESC, created_at DESC, id DESC`)
    .bind(...nihaoBankAccounts.map((account) => account.id)).all<ExpenseRow>();
  const cards = nihaoBankAccounts.map((account) => {
    const rows = results.filter((row) => row.paid_to_account === account.id);
    const stats = `<dt>Paid so far</dt><dd>${esc(pesos(sum(rows.map((row) => row.amount)).toString()))}</dd>
      <dt>Payments</dt><dd>${rows.length}</dd><dt>Last payment</dt><dd>${esc(rows[0]?.expense_date ?? "—")}</dd>`;
    const link = expenseLink({ category: "Freight / Ni Hao Cost", payment_method: "Bank Transfer", paid_to_account: account.id });
    return accountCard(account, stats, `<a class="button" href="${esc(link)}">+ Record payment to Ni Hao</a>`, canWrite);
  }).join("");
  const table = results.length ? `<div class="table"><table><thead><tr><th>Date</th><th>Paid to</th><th>Paid from</th><th>Category</th><th>Description</th><th>Amount</th><th>Reference</th></tr></thead><tbody>
    ${results.map((row) => `<tr><td>${esc(row.expense_date)}</td><td>${esc(bankAccountLabel(row.paid_to_account))}</td><td>${esc(bankAccountLabel(row.paid_from_account)) || "—"}</td>
      <td>${esc(row.category)}</td><td>${esc(row.description)}</td><td>${esc(pesos(row.amount))}</td><td>${esc(row.reference_number) || "—"}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">No payments to Ni Hao bank accounts recorded yet. Use <strong>Record payment to Ni Hao</strong> on an account above, or pick a Ni Hao account under <em>Paid to</em> when you add an expense.</p>`;
  return `<section><p class="notice"><strong>All checks and payments are addressed to ${esc(nihaoPayableTo)}.</strong> 2026 bank account details.</p>
    <div class="bank-cards">${cards}</div></section>
    <section><div class="actions" style="margin-top:0"><h2 style="margin:0">Payments to Ni Hao</h2>
    <strong>Total: ${esc(pesos(sum(results.map((row) => row.amount)).toString()))}</strong></div>
    <p class="muted">Expenses with a Ni Hao account under <em>Paid to</em>. They already count in Expenses and Cash on Hand; this list only groups them by account.</p>${table}</section>`;
}

async function kargodoorTab(db: D1Database, canWrite: boolean) {
  const ids = kargodoorBankAccounts.map((account) => account.id);
  const marks = ids.map(() => "?").join(",");
  const { results: expenses } = await db.prepare(`SELECT id, expense_date, category, payee, description, CAST(amount AS TEXT) AS amount,
      paid_from_account, paid_to_account, reference_number
    FROM expenses WHERE paid_from_account IN (${marks}) ORDER BY expense_date DESC, created_at DESC, id DESC`)
    .bind(...ids).all<ExpenseRow>();
  const { results: entries } = await db.prepare(`SELECT e.id, e.entry_date, e.entry_type, CAST(e.amount AS TEXT) AS amount, e.bank_account,
      e.reference_number, e.notes, c.full_name AS customer_name
    FROM finance_cash_entries e LEFT JOIN customers c ON c.id = e.customer_id
    WHERE e.bank_account IN (${marks}) ORDER BY e.entry_date DESC, e.created_at DESC`)
    .bind(...ids).all<CashRow>();
  const moneyIn = entries.filter((entry) => cashTypes.has(entry.entry_type));
  const moneyOutEntries = entries.filter((entry) => entry.entry_type === "Adjustment Decrease");
  const cards = kargodoorBankAccounts.map((account) => {
    const inTotal = sum(moneyIn.filter((entry) => entry.bank_account === account.id).map((entry) => entry.amount));
    const outTotal = sum([
      ...expenses.filter((row) => row.paid_from_account === account.id).map((row) => row.amount),
      ...moneyOutEntries.filter((entry) => entry.bank_account === account.id).map((entry) => entry.amount),
    ]);
    const stats = `<dt>Money in</dt><dd class="bank-in">${esc(pesos(inTotal.toString()))}</dd>
      <dt>Money out</dt><dd class="bank-out">${esc(pesos(outTotal.toString()))}</dd>
      <dt>Net recorded</dt><dd><b>${esc(pesos((inTotal - outTotal).toString()))}</b></dd>`;
    const method = account.id === "kd-gcash" ? "GCash" : "Bank Transfer";
    const links = `<a class="button" href="${esc(expenseLink({ payment_method: method, paid_from_account: account.id }))}">+ Expense from this account</a>
      <a href="${esc(cashLink({ bank_account: account.id }))}">+ Money in</a>`;
    return accountCard(account, stats, links, canWrite);
  }).join("");
  const activity = [
    ...expenses.map((row) => ({ date: row.expense_date, account: row.paid_from_account, kind: "out" as const, type: row.category,
      detail: [row.payee, row.description].filter(Boolean).join(" — "), amount: row.amount, reference: row.reference_number })),
    ...entries.filter((entry) => entry.entry_type !== "Customer Reimbursement Due").map((entry) => ({ date: entry.entry_date, account: entry.bank_account,
      kind: entry.entry_type === "Adjustment Decrease" ? "out" as const : "in" as const, type: entry.entry_type,
      detail: [entry.customer_name, entry.notes].filter(Boolean).join(" — "), amount: entry.amount, reference: entry.reference_number })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const table = activity.length ? `<div class="table"><table><thead><tr><th>Date</th><th>Account</th><th>In / Out</th><th>Type</th><th>Details</th><th>Amount</th><th>Reference</th></tr></thead><tbody>
    ${activity.map((row) => `<tr><td>${esc(row.date)}</td><td>${esc(bankAccountLabel(row.account))}</td>
      <td class="${row.kind === "in" ? "bank-in" : "bank-out"}"><strong>${row.kind === "in" ? "Money in" : "Money out"}</strong></td>
      <td>${esc(row.type)}</td><td>${esc(row.detail) || "—"}</td><td>${esc(pesos(row.amount))}</td><td>${esc(row.reference) || "—"}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">Nothing recorded against a KargoDoor account yet. Pick the account under <em>Paid from</em> when you add an expense, or under <em>KargoDoor account</em> when you add a Cash Flow record.</p>`;
  return `<section><p class="notice"><strong>These are the accounts customers pay into</strong> (the same details sent in the payment instructions message).</p>
    <div class="bank-cards">${cards}</div>
    <p class="muted">Money in and out here are only the records tagged with the account, so the net is not a bank balance. Invoice payments from Billing are not tagged yet and are not included.</p></section>
    <section><h2>Account activity</h2>${table}</section>`;
}

export async function financeAccountsPage(db: D1Database, url: URL, user: string, canWrite = true) {
  const requested = url.searchParams.get("tab");
  const tab: Tab = requested === "kargodoor" ? "kargodoor" : "nihao";
  const tabBar = `<nav class="bank-tabs" aria-label="Bank accounts">${tabs.map(([key, label]) =>
    `<a href="${path}?tab=${key}"${key === tab ? ' aria-current="page"' : ""}>${esc(label)}</a>`).join("")}</nav>`;
  const body = tab === "kargodoor" ? await kargodoorTab(db, canWrite) : await nihaoTab(db, canWrite);
  return page("Bank Accounts", `${style}<script src="/admin-copy.js" defer></script>
    <section><div class="actions" style="margin-top:0"><a href="/admin/finance/ledger">Money In &amp; Out</a><a href="/admin/finance/expenses">Expenses</a><a href="/admin/finance/cash">Cash Flow &amp; Customer Credits</a></div></section>
    ${tabBar}${body}`, user, 200, {}, canWrite);
}
