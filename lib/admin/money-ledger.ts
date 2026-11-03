import type { D1Database } from "@cloudflare/workers-types";
import { AdminError } from "./security";
import { esc, page, pesos } from "./ui";
import { cashTypes } from "./finance-cash";
import { philippineToday } from "./finance-dates";
import { bankAccountLabel } from "./bank-accounts";

/**
 * Money In & Out: every peso that came in or went out, in one table, like a
 * bank statement (Em, 2026-11-03). Rows come from the same records Cash on
 * Hand adds up: customer invoice payments, money-in entries (opening cash,
 * owner money, adjustments) and expenses (Ni Hao, fees, everything else).
 * The running balance starts at the latest Opening Cash Balance, so the last
 * balance always equals Cash on Hand. Nothing here writes data.
 */
const path = "/admin/finance/ledger";

export type LedgerRow = {
  date: string;
  created: string;
  direction: "in" | "out";
  type: string;
  who: string;
  details: string;
  tracking: string;
  method: string;
  account: string;
  reference: string;
  amount: number;
  link: string;
  /** Which KargoDoor account the money moved in: UnionBank, GCash, Cash (owners) or "" when unknown. */
  wallet: Wallet;
  /** Running Cash on Hand after this row; null before the opening balance date. */
  balance: number | null;
  /** Running balance of this row's account after it; null before the opening date or when the account is unknown. */
  walletBalance: number | null;
  /** Transfers between our own accounts are neither income nor expense. */
  transfer?: boolean;
};

export type Wallet = "kd-unionbank" | "kd-gcash" | "cash" | "";
export const wallets: { id: Exclude<Wallet, "">; label: string }[] = [
  { id: "kd-unionbank", label: "UnionBank" },
  { id: "kd-gcash", label: "GCash" },
  { id: "cash", label: "Cash (owners)" },
];
export const walletLabel = (wallet: string) => wallets.find((w) => w.id === wallet)?.label ?? "Not tagged";

/** The account from a tagged account, else from the payment method. */
export function walletOf(account: unknown, method: unknown): Wallet {
  if (account === "kd-unionbank" || account === "kd-gcash") return account;
  if (method === "GCash") return "kd-gcash";
  if (method === "Bank Transfer") return "kd-unionbank";
  if (method === "Cash") return "cash";
  return "";
}

const dateOk = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export async function readLedger(db: D1Database, asOf = philippineToday()): Promise<{ rows: LedgerRow[]; openingDate: string }> {
  // Older or partial databases may miss a table; that table simply adds no rows.
  const all = async (sql: string) => {
    try {
      return (await db.prepare(sql).bind(asOf).all<Record<string, unknown>>()).results;
    } catch (error) {
      if (error instanceof Error && /no such (table|column)/i.test(error.message)) return [];
      throw error;
    }
  };
  const [transfers, payments, cash, expenses] = await Promise.all([
    all(`SELECT id, transfer_date, created_at, from_account, to_account, amount, reference_number, notes
      FROM account_transfers WHERE transfer_date <= ?`),
    all(`SELECT p.id, p.payment_date, p.created_at, p.amount, p.payment_method, p.reference_number,
        i.id AS invoice_id, i.invoice_number, s.tracking_number, c.full_name
      FROM payments p JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN shipments s ON s.id = i.shipment_id
      LEFT JOIN customers c ON c.id = COALESCE(i.customer_id, s.customer_id)
      WHERE i.archived_at IS NULL AND p.payment_date <= ?`),
    all(`SELECT e.id, e.entry_date, e.created_at, e.entry_type, e.amount, e.reference_number, e.notes, e.bank_account, c.full_name
      FROM finance_cash_entries e LEFT JOIN customers c ON c.id = e.customer_id
      WHERE e.entry_date <= ?`),
    all(`SELECT id, expense_date, created_at, category, payee, description, amount, payment_method,
        reference_number, tracking_number, paid_from_account
      FROM expenses WHERE expense_date <= ?`),
  ]);

  const rows: LedgerRow[] = [];
  for (const p of payments) {
    rows.push({
      date: text(p.payment_date), created: text(p.created_at), direction: "in", type: "Customer payment",
      who: text(p.full_name), details: `Invoice ${text(p.invoice_number)}`, tracking: text(p.tracking_number),
      method: text(p.payment_method), account: "", reference: text(p.reference_number), amount: Number(p.amount),
      link: `/admin/invoices?id=${encodeURIComponent(text(p.invoice_id))}`, balance: null,
      // Clients pay by GCash or bank transfer only, so a cash payment needs its account fixed.
      wallet: p.payment_method === "Cash" ? "" : walletOf(null, p.payment_method), walletBalance: null,
    });
  }
  for (const e of cash) {
    const type = text(e.entry_type);
    // A reimbursement due is a note of what a customer owes, not cash.
    const direction = cashTypes.has(type) ? "in" : type === "Adjustment Decrease" ? "out" : null;
    if (!direction) continue;
    rows.push({
      date: text(e.entry_date), created: text(e.created_at), direction, type,
      who: text(e.full_name), details: text(e.notes), tracking: "", method: "",
      account: bankAccountLabel(e.bank_account) || "", reference: text(e.reference_number), amount: Number(e.amount),
      link: "/admin/finance/cash", balance: null,
      // Owner money with no account is cash in hand.
      wallet: walletOf(e.bank_account, null) || "cash", walletBalance: null,
    });
  }
  for (const x of expenses) {
    rows.push({
      date: text(x.expense_date), created: text(x.created_at), direction: "out", type: text(x.category),
      who: text(x.payee), details: text(x.description), tracking: text(x.tracking_number),
      method: text(x.payment_method), account: bankAccountLabel(x.paid_from_account) || "", reference: text(x.reference_number),
      amount: Number(x.amount), link: `/admin/finance/expenses?edit=${encodeURIComponent(text(x.id))}`, balance: null,
      wallet: walletOf(x.paid_from_account, x.payment_method), walletBalance: null,
    });
  }

  for (const t of transfers) {
    const from = walletOf(t.from_account, null) || (t.from_account === "cash" ? "cash" : "");
    const to = walletOf(t.to_account, null) || (t.to_account === "cash" ? "cash" : "");
    const base = {
      date: text(t.transfer_date), created: text(t.created_at), who: "", tracking: "", method: "",
      reference: text(t.reference_number), amount: Number(t.amount), link: "/admin/finance/expenses#gcash-transfer",
      balance: null, walletBalance: null, transfer: true,
    };
    rows.push({ ...base, direction: "out", type: "Transfer", details: `Moved to ${walletLabel(to)}${t.notes ? ` · ${text(t.notes)}` : ""}`, account: walletLabel(from), wallet: from });
    rows.push({ ...base, direction: "in", type: "Transfer", details: `Moved from ${walletLabel(from)}${t.notes ? ` · ${text(t.notes)}` : ""}`, account: walletLabel(to), wallet: to });
  }

  // Oldest first for the running balance; on the same day money in comes first.
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.direction === b.direction ? 0 : a.direction === "in" ? -1 : 1) || a.created.localeCompare(b.created));
  // Cash on Hand starts at the latest Opening Cash Balance on or before today.
  const opening = rows.filter((row) => row.type === "Opening Cash Balance").at(-1);
  const openingDate = opening?.date ?? "";
  let balance = 0;
  // Every account starts at zero on the opening date; the opening balance sits in its own account.
  const walletTotals = new Map<Wallet, number>();
  for (const row of rows) {
    if (row.date < openingDate) continue;
    if (row.type === "Opening Cash Balance" && row !== opening) continue; // older openings are history
    const change = row.direction === "in" ? row.amount : -row.amount;
    balance = row === opening ? row.amount : balance + change;
    row.balance = balance;
    if (row.wallet) {
      const next = (walletTotals.get(row.wallet) ?? 0) + change;
      walletTotals.set(row.wallet, next);
      row.walletBalance = next;
    }
  }
  return { rows, openingDate };
}

type Filters = { from: string; to: string; show: "" | "in" | "out"; q: string; account?: Wallet | "untagged" };

function readFilters(url: URL): Filters {
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!dateOk(from) || !dateOk(to)) throw new AdminError("Enter valid dates.");
  if (from && to && from > to) throw new AdminError("From date must not be after To date.");
  const showRaw = url.searchParams.get("show") ?? "";
  const show = showRaw === "in" || showRaw === "out" ? showRaw : "";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 160);
  const accountRaw = url.searchParams.get("account") ?? "";
  const account = (["kd-unionbank", "kd-gcash", "cash", "untagged"] as const).find((id) => id === accountRaw) ?? "";
  return { from, to, show, q, account };
}

export function filterLedger(rows: LedgerRow[], filters: Filters) {
  const q = filters.q.toLowerCase();
  return rows.filter((row) => (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to)
    && (!filters.show || row.direction === filters.show)
    && (!filters.account || (filters.account === "untagged" ? !row.wallet : row.wallet === filters.account))
    && (!q || [row.type, row.who, row.details, row.tracking, row.method, row.reference].some((value) => value.toLowerCase().includes(q))));
}

const csvCell = (value: unknown) => {
  const raw = text(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const php = (centavos: number | null) => (centavos === null ? "" : (centavos / 100).toFixed(2));

export async function moneyLedgerPage(db: D1Database, url: URL, userName: string, canWrite: boolean) {
  const filters = readFilters(url);
  const { rows, openingDate } = await readLedger(db);
  const shown = filterLedger(rows, filters);
  // On the All tab a transfer between our own accounts is neither in nor out.
  const counted = (row: LedgerRow) => !(row.transfer && !filters.account);
  const totalIn = shown.filter((row) => counted(row) && row.direction === "in" && row.type !== "Opening Cash Balance").reduce((sum, row) => sum + row.amount, 0);
  const totalOut = shown.filter((row) => counted(row) && row.direction === "out").reduce((sum, row) => sum + row.amount, 0);
  const cashNow = [...rows].reverse().find((row) => row.balance !== null)?.balance ?? 0;
  const tabbed = Boolean(filters.account && filters.account !== "untagged");
  const shownBalance = (row: LedgerRow) => (tabbed ? row.walletBalance : row.balance);
  const balances = walletBalances(rows);

  if (url.searchParams.get("download") === "csv") {
    const header = ["Date", "In / Out", "Type", "Customer / Payee", "Details", "Tracking No.", "Method", "Account", "Reference", "Money In PHP", "Money Out PHP", tabbed ? `${walletLabel(filters.account!)} Balance PHP` : "Balance PHP"];
    const lines = shown.map((row) => [row.date, row.direction === "in" ? "In" : "Out", row.type, row.who, row.details, row.tracking,
      row.method, walletLabel(row.wallet), row.reference, row.direction === "in" ? php(row.amount) : "", row.direction === "out" ? php(row.amount) : "", php(shownBalance(row))]
      .map(csvCell).join(","));
    return new Response(`﻿${[header.join(","), ...lines].join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="KargoDoor-Money-In-Out-${philippineToday()}.csv"`,
        "Cache-Control": "no-store, private",
      },
    });
  }

  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const csvLink = `${path}?${new URLSearchParams([...params, ["download", "csv"]])}`;
  const showOption = (value: string, label: string) => `<option value="${value}"${filters.show === value ? " selected" : ""}>${label}</option>`;
  // Newest first on screen; the balance is still the running one.
  const body = [...shown].reverse().map((row) => `<tr class="ledger-${row.direction}">
      <td class="ledger-tight">${esc(row.date)}</td>
      <td class="ledger-tight"><span class="k-pill" data-k="${row.direction === "in" ? "green" : "red"}">${row.direction === "in" ? "In" : "Out"}</span></td>
      <td>${esc(row.type)}</td>
      <td>${esc(row.who) || "—"}</td>
      <td class="ledger-wide"><a href="${esc(row.link)}">${esc(row.details) || "—"}</a>${row.tracking ? `<small class="muted">${esc(row.tracking)}</small>` : ""}</td>
      <td>${row.wallet ? esc(walletLabel(row.wallet)) : '<span class="k-pill" data-k="amber">Not tagged</span>'}${row.method ? `<small class="muted" style="display:block">${esc(row.method)}</small>` : ""}</td>
      <td class="ledger-num ledger-in-amt">${row.direction === "in" ? esc(pesos(row.amount)) : ""}</td>
      <td class="ledger-num ledger-out-amt">${row.direction === "out" ? esc(pesos(row.amount)) : ""}</td>
      <td class="ledger-num">${shownBalance(row) === null ? '<span class="muted" title="Before the opening cash date, not in Cash on Hand">—</span>' : esc(pesos(shownBalance(row)))}</td>
    </tr>`).join("");

  return page("Money In & Out", `
    <style>
      .ledger-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
      .ledger-cards .card strong{display:block;font-size:1.4rem;margin-top:4px}
      .ledger-cards .in strong{color:#1d6b3a}.ledger-cards .out strong{color:#a3261f}
      table.ledger td,table.ledger th{vertical-align:top}
      .ledger-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.ledger-tabs a{padding:9px 18px;border:1.5px solid #c6dce9;border-radius:999px;font-weight:700;text-decoration:none;background:#fff}
      .ledger-tabs a[aria-current="page"]{background:#003b9d;color:#fff;border-color:#003b9d}
      table.ledger .ledger-tight,table.ledger .ledger-num{white-space:nowrap}
      table.ledger .ledger-num{text-align:right;font-variant-numeric:tabular-nums}
      table.ledger .ledger-wide{min-width:220px}table.ledger .ledger-wide small{display:block}
      table.ledger .ledger-in-amt{color:#1d6b3a;font-weight:600}table.ledger .ledger-out-amt{color:#a3261f;font-weight:600}
    </style>
    <section><div class="actions"><a href="/admin/finance">Money Today</a><a href="${path}"><strong>Money In &amp; Out</strong></a><a href="/admin/finance/expenses">Expenses</a><a href="/admin/finance/reports">Reports &amp; BIR</a></div>
      <p class="muted">Every peso in and out, newest first: customer payments, owner money and opening cash, Ni Hao payments, fees and all other expenses. The Balance column is Cash on Hand after each row${openingDate ? `, counted from the opening cash on ${esc(openingDate)}` : ""}. Click a row's details to open the record.</p></section>
    <nav class="ledger-tabs">${[["", "All"], ...wallets.map((w) => [w.id, w.label]), ...(balances.untagged.length ? [["untagged", `Not tagged (${balances.untagged.length})`]] : [])]
      .map(([id, label]) => `<a href="${path}?${new URLSearchParams([...[...params].filter(([key]) => key !== "account"), ...(id ? [["account", id]] : [])])}"${(filters.account ?? "") === id ? ' aria-current="page"' : ""}>${esc(label!)}</a>`).join("")}</nav>
    <section><form method="get" action="${path}" class="search">${filters.account ? `<input type="hidden" name="account" value="${esc(filters.account)}">` : ""}
      <label>Search<input name="q" value="${esc(filters.q)}" maxlength="160" placeholder="Name, tracking no., description"></label>
      <label>From Date<input name="from" type="date" value="${esc(filters.from)}"></label>
      <label>To Date<input name="to" type="date" value="${esc(filters.to)}"></label>
      <label>Show<select name="show">${showOption("", "Money in and out")}${showOption("in", "Money in only")}${showOption("out", "Money out only")}</select></label>
      <button type="submit">Apply Filters</button><a href="${path}">Clear Filters</a><a href="${esc(csvLink)}">Download CSV</a></form></section>
    <div class="ledger-cards">
      <div class="card in"><span class="muted">Money in${filters.from || filters.to ? " (dates shown)" : ""}</span><strong>${esc(pesos(totalIn))}</strong><small class="muted">Not counting opening cash</small></div>
      <div class="card out"><span class="muted">Money out${filters.from || filters.to ? " (dates shown)" : ""}</span><strong>${esc(pesos(totalOut))}</strong></div>
      <div class="card"><span class="muted">In minus out</span><strong>${esc(pesos(totalIn - totalOut))}</strong></div>
      <div class="card"><span class="muted">${tabbed ? `${esc(walletLabel(filters.account!))} now` : "Cash on Hand now"}</span><strong>${esc(pesos(tabbed ? balances.byWallet[filters.account as Exclude<Wallet, "">] : cashNow))}</strong></div>
    </div>
    <section>${shown.length ? `<div class="table"><table class="ledger"><thead><tr>
      <th>Date</th><th>In / Out</th><th>Type</th><th>Customer / Payee</th><th>Details</th><th>Account</th>
      <th class="ledger-num">Money in</th><th class="ledger-num">Money out</th><th class="ledger-num">${tabbed ? `${esc(walletLabel(filters.account!))} balance` : "Balance"}</th>
    </tr></thead><tbody>${body}</tbody></table></div>` : "<p>No money in or out for these filters.</p>"}</section>`, userName, 200, {}, canWrite);
}

/** Balance of each account now, plus the records whose account is unknown. */
export function walletBalances(rows: LedgerRow[]) {
  const byWallet: Record<Exclude<Wallet, "">, number> = { "kd-unionbank": 0, "kd-gcash": 0, cash: 0 };
  for (const row of rows) if (row.wallet && row.walletBalance !== null) byWallet[row.wallet] = row.walletBalance;
  const untagged = rows.filter((row) => !row.wallet && row.balance !== null);
  const total = [...rows].reverse().find((row) => row.balance !== null)?.balance ?? 0;
  return { byWallet, untagged, total };
}

/** "Money we have now" per account, for Money Today. */
export async function walletBalancesSection(db: D1Database) {
  const { rows, openingDate } = await readLedger(db);
  const { byWallet, untagged, total } = walletBalances(rows);
  const untaggedTotal = untagged.reduce((sum, row) => sum + (row.direction === "in" ? row.amount : -row.amount), 0);
  const card = (label: string, amount: number, note: string, link: string) => `<a class="card wallet-card" href="${esc(link)}"><span class="k-pill">${esc(label)}</span><strong>${esc(pesos(amount))}</strong><small class="muted">${esc(note)}</small></a>`;
  return `<section id="finance-accounts">
    <div class="actions"><h2>Money we have now, by account</h2><a href="${path}">Money In &amp; Out</a></div>
    <div class="wallet-cards">
      ${card("UnionBank", byWallet["kd-unionbank"], openingDate ? `Since ${openingDate}` : "", `${path}?account=kd-unionbank`)}
      ${card("GCash", byWallet["kd-gcash"], openingDate ? `Since ${openingDate}` : "", `${path}?account=kd-gcash`)}
      ${card("Cash (owners)", byWallet.cash, "Owner money in, owner spending out", `${path}?account=cash`)}
      ${card("Total", total, "Same as Cash on Hand", path)}
    </div>
    ${untagged.length ? `<p class="notice wallet-warn" role="status"><strong>${untagged.length} record${untagged.length === 1 ? "" : "s"} need${untagged.length === 1 ? "s" : ""} an account</strong> (${esc(pesos(untaggedTotal))} in the total but not in any account). Clients pay by GCash or UnionBank only. <a href="${path}?account=untagged">See them</a></p>` : ""}
    <p class="muted">Compare each card with your UnionBank and GCash apps. If one doesn't match, something wasn't recorded.</p>
    <style>.wallet-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.wallet-card{display:block;text-decoration:none;color:inherit}.wallet-card strong{display:block;font-size:1.5rem;margin:6px 0 2px}.wallet-warn{background:#fff8e6!important;border-color:#f3d38a!important;color:#6b4a00!important}</style>
  </section>`;
}
