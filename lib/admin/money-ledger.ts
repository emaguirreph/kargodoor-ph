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
  /** Running Cash on Hand after this row; null before the opening balance date. */
  balance: number | null;
};

const dateOk = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export async function readLedger(db: D1Database, asOf = philippineToday()): Promise<{ rows: LedgerRow[]; openingDate: string }> {
  const [payments, cash, expenses] = await Promise.all([
    db.prepare(`SELECT p.id, p.payment_date, p.created_at, p.amount, p.payment_method, p.reference_number,
        i.id AS invoice_id, i.invoice_number, s.tracking_number, c.full_name
      FROM payments p JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN shipments s ON s.id = i.shipment_id
      LEFT JOIN customers c ON c.id = COALESCE(i.customer_id, s.customer_id)
      WHERE i.archived_at IS NULL AND p.payment_date <= ?`).bind(asOf).all<Record<string, unknown>>(),
    db.prepare(`SELECT e.id, e.entry_date, e.created_at, e.entry_type, e.amount, e.reference_number, e.notes, e.bank_account, c.full_name
      FROM finance_cash_entries e LEFT JOIN customers c ON c.id = e.customer_id
      WHERE e.entry_date <= ?`).bind(asOf).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, expense_date, created_at, category, payee, description, amount, payment_method,
        reference_number, tracking_number, paid_from_account
      FROM expenses WHERE expense_date <= ?`).bind(asOf).all<Record<string, unknown>>(),
  ]);

  const rows: LedgerRow[] = [];
  for (const p of payments.results) {
    rows.push({
      date: text(p.payment_date), created: text(p.created_at), direction: "in", type: "Customer payment",
      who: text(p.full_name), details: `Invoice ${text(p.invoice_number)}`, tracking: text(p.tracking_number),
      method: text(p.payment_method), account: "", reference: text(p.reference_number), amount: Number(p.amount),
      link: `/admin/invoices?id=${encodeURIComponent(text(p.invoice_id))}`, balance: null,
    });
  }
  for (const e of cash.results) {
    const type = text(e.entry_type);
    // A reimbursement due is a note of what a customer owes, not cash.
    const direction = cashTypes.has(type) ? "in" : type === "Adjustment Decrease" ? "out" : null;
    if (!direction) continue;
    rows.push({
      date: text(e.entry_date), created: text(e.created_at), direction, type,
      who: text(e.full_name), details: text(e.notes), tracking: "", method: "",
      account: bankAccountLabel(e.bank_account) || "", reference: text(e.reference_number), amount: Number(e.amount),
      link: "/admin/finance/cash", balance: null,
    });
  }
  for (const x of expenses.results) {
    rows.push({
      date: text(x.expense_date), created: text(x.created_at), direction: "out", type: text(x.category),
      who: text(x.payee), details: text(x.description), tracking: text(x.tracking_number),
      method: text(x.payment_method), account: bankAccountLabel(x.paid_from_account) || "", reference: text(x.reference_number),
      amount: Number(x.amount), link: `/admin/finance/expenses?edit=${encodeURIComponent(text(x.id))}`, balance: null,
    });
  }

  // Oldest first for the running balance; on the same day money in comes first.
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.direction === b.direction ? 0 : a.direction === "in" ? -1 : 1) || a.created.localeCompare(b.created));
  // Cash on Hand starts at the latest Opening Cash Balance on or before today.
  const opening = rows.filter((row) => row.type === "Opening Cash Balance").at(-1);
  const openingDate = opening?.date ?? "";
  let balance = 0;
  for (const row of rows) {
    if (row.date < openingDate) continue;
    if (row.type === "Opening Cash Balance") {
      // Only the latest opening balance resets the balance; an older one is history.
      if (row !== opening) continue;
      balance = row.amount;
    } else {
      balance += row.direction === "in" ? row.amount : -row.amount;
    }
    row.balance = balance;
  }
  return { rows, openingDate };
}

type Filters = { from: string; to: string; show: "" | "in" | "out"; q: string };

function readFilters(url: URL): Filters {
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!dateOk(from) || !dateOk(to)) throw new AdminError("Enter valid dates.");
  if (from && to && from > to) throw new AdminError("From date must not be after To date.");
  const showRaw = url.searchParams.get("show") ?? "";
  const show = showRaw === "in" || showRaw === "out" ? showRaw : "";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 160);
  return { from, to, show, q };
}

export function filterLedger(rows: LedgerRow[], filters: Filters) {
  const q = filters.q.toLowerCase();
  return rows.filter((row) => (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to)
    && (!filters.show || row.direction === filters.show)
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
  const totalIn = shown.filter((row) => row.direction === "in" && row.type !== "Opening Cash Balance").reduce((sum, row) => sum + row.amount, 0);
  const totalOut = shown.filter((row) => row.direction === "out").reduce((sum, row) => sum + row.amount, 0);
  const cashNow = [...rows].reverse().find((row) => row.balance !== null)?.balance ?? 0;

  if (url.searchParams.get("download") === "csv") {
    const header = ["Date", "In / Out", "Type", "Customer / Payee", "Details", "Tracking No.", "Method", "Account", "Reference", "Money In PHP", "Money Out PHP", "Balance PHP"];
    const lines = shown.map((row) => [row.date, row.direction === "in" ? "In" : "Out", row.type, row.who, row.details, row.tracking,
      row.method, row.account, row.reference, row.direction === "in" ? php(row.amount) : "", row.direction === "out" ? php(row.amount) : "", php(row.balance)]
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
      <td>${esc([row.method, row.account].filter(Boolean).join(" · ")) || "—"}</td>
      <td class="ledger-num ledger-in-amt">${row.direction === "in" ? esc(pesos(row.amount)) : ""}</td>
      <td class="ledger-num ledger-out-amt">${row.direction === "out" ? esc(pesos(row.amount)) : ""}</td>
      <td class="ledger-num">${row.balance === null ? '<span class="muted" title="Before the opening cash date, not in Cash on Hand">—</span>' : esc(pesos(row.balance))}</td>
    </tr>`).join("");

  return page("Money In & Out", `
    <style>
      .ledger-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
      .ledger-cards .card strong{display:block;font-size:1.4rem;margin-top:4px}
      .ledger-cards .in strong{color:#1d6b3a}.ledger-cards .out strong{color:#a3261f}
      table.ledger td,table.ledger th{vertical-align:top}
      table.ledger .ledger-tight,table.ledger .ledger-num{white-space:nowrap}
      table.ledger .ledger-num{text-align:right;font-variant-numeric:tabular-nums}
      table.ledger .ledger-wide{min-width:220px}table.ledger .ledger-wide small{display:block}
      table.ledger .ledger-in-amt{color:#1d6b3a;font-weight:600}table.ledger .ledger-out-amt{color:#a3261f;font-weight:600}
    </style>
    <section><div class="actions"><a href="/admin/finance">Money Today</a><a href="${path}"><strong>Money In &amp; Out</strong></a><a href="/admin/finance/expenses">Expenses</a><a href="/admin/finance/reports">Reports &amp; BIR</a></div>
      <p class="muted">Every peso in and out, newest first: customer payments, owner money and opening cash, Ni Hao payments, fees and all other expenses. The Balance column is Cash on Hand after each row${openingDate ? `, counted from the opening cash on ${esc(openingDate)}` : ""}. Click a row's details to open the record.</p></section>
    <section><form method="get" action="${path}" class="search">
      <label>Search<input name="q" value="${esc(filters.q)}" maxlength="160" placeholder="Name, tracking no., description"></label>
      <label>From Date<input name="from" type="date" value="${esc(filters.from)}"></label>
      <label>To Date<input name="to" type="date" value="${esc(filters.to)}"></label>
      <label>Show<select name="show">${showOption("", "Money in and out")}${showOption("in", "Money in only")}${showOption("out", "Money out only")}</select></label>
      <button type="submit">Apply Filters</button><a href="${path}">Clear Filters</a><a href="${esc(csvLink)}">Download CSV</a></form></section>
    <div class="ledger-cards">
      <div class="card in"><span class="muted">Money in${filters.from || filters.to ? " (dates shown)" : ""}</span><strong>${esc(pesos(totalIn))}</strong><small class="muted">Not counting opening cash</small></div>
      <div class="card out"><span class="muted">Money out${filters.from || filters.to ? " (dates shown)" : ""}</span><strong>${esc(pesos(totalOut))}</strong></div>
      <div class="card"><span class="muted">In minus out</span><strong>${esc(pesos(totalIn - totalOut))}</strong></div>
      <div class="card"><span class="muted">Cash on Hand now</span><strong>${esc(pesos(cashNow))}</strong></div>
    </div>
    <section>${shown.length ? `<div class="table"><table class="ledger"><thead><tr>
      <th>Date</th><th>In / Out</th><th>Type</th><th>Customer / Payee</th><th>Details</th><th>Method</th>
      <th class="ledger-num">Money in</th><th class="ledger-num">Money out</th><th class="ledger-num">Balance</th>
    </tr></thead><tbody>${body}</tbody></table></div>` : "<p>No money in or out for these filters.</p>"}</section>`, userName, 200, {}, canWrite);
}
