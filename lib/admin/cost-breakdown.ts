import { esc, pesos } from "./ui";

/**
 * Ni Hao cost, transfer fees and delivery fees counted apart (Em,
 * 2026-11-03), so each one's total is easy to see next to the overall total.
 */
export const niHaoCategory = "Freight / Ni Hao Cost";
export const transferFeesCategory = "Bank / Payment Fees";
export const deliveryCategory = "Local Delivery / Trucking";

export type CostBreakdown = { niHao: number; transferFees: number; delivery: number; other: number; total: number };

export function costBreakdown(rows: readonly Record<string, unknown>[]): CostBreakdown {
  const out: CostBreakdown = { niHao: 0, transferFees: 0, delivery: 0, other: 0, total: 0 };
  for (const row of rows) {
    const amount = Number(row.amount ?? 0) || 0;
    out.total += amount;
    if (row.category === niHaoCategory) out.niHao += amount;
    else if (row.category === transferFeesCategory) out.transferFees += amount;
    else if (row.category === deliveryCategory) out.delivery += amount;
    else out.other += amount;
  }
  return out;
}

/** Five cards: Ni Hao cost, Transfer fees, Delivery fees, Other, Total. */
export function costBreakdownCards(breakdown: CostBreakdown, totalLabel = "Total expenses") {
  const card = (label: string, amount: number, note = "") => `<div class="card"><span class="muted">${esc(label)}</span><strong>${esc(pesos(amount))}</strong>${note ? `<small class="muted">${esc(note)}</small>` : ""}</div>`;
  return `<div class="cost-cards">
    ${card("Ni Hao cost", breakdown.niHao, "Freight paid to Ni Hao")}
    ${card("Transfer fees", breakdown.transferFees, "Bank and GCash fees")}
    ${card("Delivery fees", breakdown.delivery, "Paid to Lalamove / riders")}
    ${card("Other expenses", breakdown.other)}
    ${card(totalLabel, breakdown.total)}
  </div>
  <style>.cost-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:0 0 16px}.cost-cards .card strong{display:block;font-size:1.3rem;margin:4px 0 2px}.cost-cards .card:last-child strong{color:#a3261f}</style>`;
}
