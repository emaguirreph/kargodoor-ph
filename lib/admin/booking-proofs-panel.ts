import type { D1Database } from "@cloudflare/workers-types";
import { esc } from "./ui";

type Row = Record<string, unknown>;
const bookingsPath = "/admin/bookings";

/** Pending customer proofs, shown at the top of Invoices & Payments. */
export async function pendingProofsPanel(db: D1Database) {
  // Never break Invoices & Payments if the bookings tables are not there yet.
  const rows = await db.prepare(`SELECT p.id, p.source, p.uploaded_at, b.id AS booking_id, b.booking_ref, COALESCE(c.full_name, b.full_name) AS full_name, c.customer_code, s.tracking_number
      FROM customer_payment_proofs p LEFT JOIN bookings b ON b.id = p.booking_id LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN shipments s ON s.id = p.shipment_id
      WHERE p.status = 'Pending' ORDER BY p.uploaded_at`).all<Row>().then((r) => r.results, () => [] as Row[]);
  if (!rows.length) return "";
  // Portal proofs open their own review page; chat proofs open the booking, as before.
  const link = (row: Row) => row.source === "portal" || !row.booking_id
    ? `<a href="${bookingsPath}?review_proof=${esc(row.id)}">🔐 ${esc(row.customer_code ?? "")} · ${esc(row.full_name)}</a>`
    : `<a href="${bookingsPath}?id=${esc(row.booking_id)}">${esc(row.booking_ref)} · ${esc(row.full_name)}</a>`;
  return `<section style="border:2px solid #e5383b"><h2>Proof of payment to check <span class="nav-count">${rows.length}</span></h2>
    <p class="muted">Sent by customers in the website chat or their portal (🔐). Check UnionBank or GCash, then open it to record the payment.</p>
    <ul>${rows.map((row) => `<li>${link(row)}${row.tracking_number ? ` · ${esc(row.tracking_number)}` : ""} <span class="muted">(${esc(String(row.uploaded_at).replace("T", " ").slice(0, 16))})</span></li>`).join("")}</ul></section>`;
}

