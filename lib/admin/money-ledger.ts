import { costBreakdown } from "./cost-breakdown";
import { clientSourceLabels, nth, readSplitShipments, referralCategory, splitTotals } from "./partner-split";
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
      // Clients pay by GCash or UnionBank; a cash payment is owner money (e.g. Archie paying Ni Hao directly).
      wallet: walletOf(null, p.payment_method), walletBalance: null,
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
  // Before the opening cash, the owners paid KargoDoor's costs from their own
  // pockets (even when they used their own GCash). Those count under Cash
  // (owners), which goes negative: what KargoDoor owes the owners, to be paid
  // back from UnionBank (Em, 2026-11-03).
  for (const row of rows) {
    if (openingDate && row.date < openingDate && row.direction === "out" && !row.transfer && row.link.startsWith("/admin/finance/expenses")) {
      row.wallet = "cash";
      row.account = "Paid by owners";
    }
  }
  let balance = 0;
  // Every account starts at zero on the opening date; the opening balance sits in its own account.
  const walletTotals = new Map<Wallet, number>();
  for (const row of rows) {
    if (row.date < openingDate) {
      // Not in Cash on Hand, but it is in the owners' Cash balance.
      if (row.wallet === "cash") {
        const next = (walletTotals.get("cash") ?? 0) - row.amount;
        walletTotals.set("cash", next);
        row.walletBalance = next;
      }
      continue;
    }
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
  // Profit ignores the in/out and account filters: it always uses every customer payment and shipment cost in the dates shown.
  const profit = shipmentProfit(filterLedger(rows, { ...filters, show: "", account: "" }));

  if (url.searchParams.get("download") === "csv") {
    const header = ["Date", "In / Out", "Category", "Customer / Payee", "Description", "Tracking No.", "Method", "Account", "Reference", "Money In PHP", "Money Out PHP", tabbed ? `${walletLabel(filters.account!)} Balance PHP` : "Balance PHP"];
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
  const splitView = url.searchParams.get("view") === "split";
  const datesShown = Boolean(filters.from || filters.to);
  const costs = costBreakdown(shown.filter((row) => counted(row) && row.direction === "out" && !row.transfer).map((row) => ({ category: row.type, amount: row.amount })));
  const referralsOut = shown.filter((row) => counted(row) && row.direction === "out" && row.type === referralCategory).reduce((sum, row) => sum + row.amount, 0);
  const outNote = [["Ni Hao", costs.niHao], ["Fees", costs.transferFees], ["Delivery", costs.delivery], ["Referrals", referralsOut], ["Other", costs.other - referralsOut]]
    .filter(([, amount]) => Number(amount) > 0).map(([label, amount]) => `${label} ${pesos(amount)}`).join(" · ");
  const tabLink = (extra: [string, string][]) => `${path}?${new URLSearchParams([...[...params].filter(([key]) => key === "from" || key === "to"), ...extra])}`;
  const tabs = [["", "All"], ...wallets.map((w) => [w.id, w.label]), ...(balances.untagged.length ? [["untagged", `Not tagged (${balances.untagged.length})`]] : [])]
    .map(([id, label]) => `<a href="${esc(tabLink(id ? [["account", id!]] : []))}"${!splitView && (filters.account ?? "") === id ? ' aria-current="page"' : ""}>${esc(label!)}</a>`).join("")
    + `<a href="${esc(tabLink([["view", "split"]]))}"${splitView ? ' aria-current="page"' : ""}>Profit &amp; Split</a>`;
  const toolbar = `<section class="ledger-bar"><nav class="ledger-tabs">${tabs}</nav>
    <form method="get" action="${path}" class="ledger-dates">${filters.account ? `<input type="hidden" name="account" value="${esc(filters.account)}">` : ""}${splitView ? '<input type="hidden" name="view" value="split">' : ""}
      <label>From<input name="from" type="date" value="${esc(filters.from)}"></label>
      <label>To<input name="to" type="date" value="${esc(filters.to)}"></label>
      <button type="submit">Show</button>${datesShown ? `<a href="${esc(splitView ? `${path}?view=split` : path)}">All dates</a>` : ""}
      <a href="${esc(splitView ? `${path}?${new URLSearchParams([...[...params].filter(([key]) => key === "from" || key === "to"), ["view", "split"], ["download", "csv"]])}` : csvLink)}">Download CSV</a></form></section>`;
  const cards = `<div class="ledger-cards">
      <div class="card in"><span class="muted">Money in${datesShown ? " (dates shown)" : ""}</span><strong>${esc(pesos(totalIn))}</strong><small class="muted">Not counting opening cash</small></div>
      <div class="card out"><span class="muted">Money out${datesShown ? " (dates shown)" : ""}</span><strong>${esc(pesos(totalOut))}</strong>${outNote ? `<small class="muted">${esc(outNote)}</small>` : ""}</div>
      <div class="card profit"><span class="muted">Profit${datesShown ? " (dates shown)" : ""}</span><strong>${esc(pesos(profit.profit))}</strong><small class="muted">From shipments, after referrals</small></div>
      <div class="card"><span class="muted">${tabbed ? `${esc(walletLabel(filters.account!))} now` : "Cash on Hand now"}</span><strong>${esc(pesos(tabbed ? balances.byWallet[filters.account as Exclude<Wallet, "">] : cashNow))}</strong><small class="muted">${tabbed ? "This account" : "UnionBank + GCash + Cash"}</small></div>
    </div>`;
  const style = `<style>
      .ledger-bar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px}
      .ledger-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0}.ledger-tabs a{padding:9px 18px;border:1.5px solid #c6dce9;border-radius:999px;font-weight:700;text-decoration:none;background:#fff}
      .ledger-tabs a:hover{border-color:#ff9a4d}.ledger-tabs a[aria-current="page"]{background:#003b9d;color:#fff;border-color:#003b9d}
      .ledger-dates{display:flex;flex-wrap:wrap;align-items:end;gap:10px}.ledger-dates label{font-size:.85rem}.ledger-dates input{margin-top:2px;padding:7px 10px;width:auto}.ledger-dates button{padding:8px 16px}
      .ledger-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px}
      .ledger-cards .card strong{display:block;font-size:1.4rem;margin-top:4px}.ledger-cards .card small{display:block}
      .ledger-cards .in strong,.ledger-cards .profit strong{color:#1d6b3a}.ledger-cards .out strong{color:#a3261f}
      table.ledger td,table.ledger th{vertical-align:top}table.ledger tr.ledger-row{cursor:pointer}table.ledger tr.ledger-row:hover td{background:#f1f7ff}
      table.ledger .ledger-tight,table.ledger .ledger-num{white-space:nowrap}
      table.ledger .ledger-num{text-align:right;font-variant-numeric:tabular-nums}
      table.ledger .ledger-wide{min-width:220px}table.ledger .ledger-wide small{display:block}
      table.ledger .ledger-in-amt{color:#1d6b3a;font-weight:600}table.ledger .ledger-out-amt{color:#a3261f;font-weight:600}
      .split-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.split-cards .card strong{font-size:1.4rem;margin-top:4px}
    </style>`;

  if (splitView) {
    const splitRows = (await readSplitShipments(db)).filter((row) => (!filters.from || row.shippedOn >= filters.from) && (!filters.to || row.shippedOn <= filters.to));
    if (url.searchParams.get("download") === "csv") {
      const header = ["Shipment date", "Tracking No.", "Customer", "Who brought this client", "Shipment no.", "Split", "Profit PHP", "Referrer PHP", "Referral status", "Archie & Em PHP", "Patrick & Keah PHP"];
      const lines = splitRows.map((row) => [row.shippedOn, row.tracking, row.customerName, clientSourceLabels[row.source], row.number, row.shares.label, php(row.profit),
        row.commission ? php(row.commission) : "", row.commissionStatus === "none" ? "" : row.commissionStatus, php(row.ae), php(row.pk)].map(csvCell).join(","));
      return new Response(`﻿${[header.join(","), ...lines].join("\r\n")}\r\n`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="KargoDoor-Partner-Split-${philippineToday()}.csv"`,
          "Cache-Control": "no-store, private",
        },
      });
    }
    const totals = splitTotals(splitRows);
    const splitCard = (label: string, amount: number) => `<div class="card"><span class="muted">${esc(label)}</span><strong>${esc(pesos(amount))}</strong></div>`;
    const rowsHtml = splitRows.map((row) => `<tr>
        <td><a href="/admin/shipments?id=${encodeURIComponent(row.id)}">${esc(row.tracking || "No tracking yet")}</a><small class="muted" style="display:block">${esc(row.customerName)} · ${esc(row.shippedOn)}</small></td>
        <td>${esc(clientSourceLabels[row.source])}<small class="muted" style="display:block">${esc(row.shares.label)}${row.shares.referrer ? ` · ${nth(row.number)} shipment` : ""}</small></td>
        <td class="ledger-num">${esc(pesos(row.profit))}</td>
        <td class="ledger-num">${row.commission ? esc(pesos(row.commission)) : "—"}${row.commissionStatus === "owed" ? ' <span class="k-pill" data-k="amber">Owed</span>' : row.commissionStatus.startsWith("waiting") ? ' <span class="k-pill" data-k="gray">Not yet</span>' : ""}</td>
        <td class="ledger-num">${esc(pesos(row.ae))}</td>
        <td class="ledger-num">${esc(pesos(row.pk))}</td>
      </tr>`).join("");
    return page("Money In & Out", `${style}${toolbar}${cards}
      <section><h2>Partner split</h2>
        <div class="split-cards">${splitCard("Archie & Em", totals.ae)}${splitCard("Patrick & Keah", totals.pk)}${splitCard("Referrers", totals.referrers)}</div>
        <p class="muted">Each shipment's profit (customer payments − Ni Hao − transfer fees − delivery) split by who brought the client. Set that on the customer page. A friend's 10% comes off the top on the client's first 3 shipments. Startup costs the owners paid are not taken from profit.</p></section>
      <section><h2>Split per shipment</h2>${splitRows.length ? `<div class="table"><table class="ledger"><thead><tr><th>Shipment</th><th>Source</th><th class="ledger-num">Profit</th><th class="ledger-num">Referrer</th><th class="ledger-num">Archie &amp; Em</th><th class="ledger-num">Patrick &amp; Keah</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>` : "<p>No shipments for these dates.</p>"}</section>`, userName, 200, {}, canWrite);
  }

  // Newest first on screen; the balance is still the running one.
  const body = [...shown].reverse().map((row) => `<tr class="ledger-${row.direction} ledger-row" data-href="${esc(row.link)}" tabindex="0" title="Click to open">
      <td class="ledger-tight">${esc(row.date)}</td>
      <td>${esc(row.type)}</td>
      <td>${esc(row.who) || "—"}</td>
      <td class="ledger-wide"><a href="${esc(row.link)}">${esc(row.details) || "—"}</a>${row.tracking ? `<small class="muted">${esc(row.tracking)}</small>` : ""}</td>
      <td>${row.wallet ? esc(walletLabel(row.wallet)) : '<span class="k-pill" data-k="amber">Not tagged</span>'}${row.method ? `<small class="muted" style="display:block">${esc(row.method)}</small>` : ""}</td>
      <td class="ledger-num ledger-in-amt">${row.direction === "in" ? esc(pesos(row.amount)) : ""}</td>
      <td class="ledger-num ledger-out-amt">${row.direction === "out" ? esc(pesos(row.amount)) : ""}</td>
      <td class="ledger-num">${shownBalance(row) === null ? '<span class="muted" title="Before the opening cash date, not in Cash on Hand">—</span>' : esc(pesos(shownBalance(row)))}</td>
    </tr>`).join("");

  return page("Money In & Out", `${style}${toolbar}${cards}
    <section><h2>Every peso in and out</h2>${openingDate ? `<p class="muted">Balance counts from the opening cash on ${esc(openingDate)}. Click a row to open it.</p>` : ""}${shown.length ? `<div class="table"><table class="ledger"><thead><tr>
      <th>Date</th><th>Category</th><th>Customer / Payee</th><th>Description</th><th>Account</th>
      <th class="ledger-num">Money in</th><th class="ledger-num">Money out</th><th class="ledger-num">${tabbed ? `${esc(walletLabel(filters.account!))} balance` : "Balance"}</th>
    </tr></thead><tbody>${body}</tbody></table></div><script src="/admin-row-link.js" defer></script>` : "<p>No money in or out for these dates.</p>"}</section>`, userName, 200, {}, canWrite);
}

export type ShipmentProfit = { customerPayments: number; niHao: number; transferFees: number; delivery: number; referrals: number; profit: number; otherCosts: number };

/**
 * Profit from shipments (Em, 2026-11-03): customer payments minus Ni Hao
 * cost, transfer fees and delivery paid to riders. Owner money (opening cash,
 * owner contributions) and paying the owners back are not income or cost, so
 * they are left out. Other costs (marketing, permits, website) are shown
 * apart, not subtracted. Referral commissions paid to friends are subtracted
 * (Em, 2026-11-04).
 */
export function shipmentProfit(rows: LedgerRow[]): ShipmentProfit {
  const customerPayments = rows.filter((row) => row.direction === "in" && row.type === "Customer payment").reduce((sum, row) => sum + row.amount, 0);
  const costs = costBreakdown(rows.filter((row) => row.direction === "out" && !row.transfer && row.link.startsWith("/admin/finance/expenses")).map((row) => ({ category: row.type, amount: row.amount })));
  const referrals = rows.filter((row) => row.direction === "out" && !row.transfer && row.type === referralCategory).reduce((sum, row) => sum + row.amount, 0);
  return {
    customerPayments, niHao: costs.niHao, transferFees: costs.transferFees, delivery: costs.delivery, referrals,
    profit: customerPayments - costs.niHao - costs.transferFees - costs.delivery - referrals, otherCosts: costs.other - referrals,
  };
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
  const { byWallet, untagged } = walletBalances(rows);
  const untaggedTotal = untagged.reduce((sum, row) => sum + (row.direction === "in" ? row.amount : -row.amount), 0);
  const card = (label: string, amount: number, note: string, link: string) => `<a class="card wallet-card" href="${esc(link)}"><span class="k-pill">${esc(label)}</span><strong>${esc(pesos(amount))}</strong><small class="muted">${esc(note)}</small></a>`;
  return `<section id="finance-accounts">
    <div class="actions"><h2>Money we have now, by account</h2><a href="${path}">Money In &amp; Out</a></div>
    <div class="wallet-cards">
      ${card("UnionBank", byWallet["kd-unionbank"], openingDate ? `Since ${openingDate}` : "", `${path}?account=kd-unionbank`)}
      ${card("GCash", byWallet["kd-gcash"], openingDate ? `Since ${openingDate}` : "", `${path}?account=kd-gcash`)}
      ${card("Cash (owners)", byWallet.cash, byWallet.cash < 0 ? "KargoDoor owes the owners this. Pay it back from UnionBank." : "Owner money in, owner spending out", `${path}?account=cash`)}
      ${card("UnionBank + GCash", byWallet["kd-unionbank"] + byWallet["kd-gcash"], "Money KargoDoor has now", path)}
    </div>
    ${untagged.length ? `<p class="notice wallet-warn" role="status"><strong>${untagged.length} record${untagged.length === 1 ? "" : "s"} need${untagged.length === 1 ? "s" : ""} an account</strong> (${esc(pesos(untaggedTotal))} in the total but not in any account). Open each one and choose UnionBank, GCash or Cash. <a href="${path}?account=untagged">See them</a></p>` : ""}
    <p class="muted">Compare each card with your UnionBank and GCash apps. If one doesn't match, something wasn't recorded.</p>
    <style>.wallet-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.wallet-card{display:block;text-decoration:none;color:inherit}.wallet-card strong{display:block;font-size:1.5rem;margin:6px 0 2px}.wallet-warn{background:#fff8e6!important;border-color:#f3d38a!important;color:#6b4a00!important}</style>
  </section>`;
}
