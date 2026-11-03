import type { D1Database } from "@cloudflare/workers-types";
import { esc } from "./ui";

type Row = Record<string, unknown>;
const bookingsPath = "/admin/bookings";

/** Pending customer proofs, shown at the top of Invoices & Payments. */
export async function pendingProofsPanel(db: D1Database) {
  // Never break Invoices & Payments if the bookings tables are not there yet.
  const rows = await db.prepare(`SELECT p.uploaded_at, b.id AS booking_id, b.booking_ref, b.full_name, s.tracking_number
      FROM customer_payment_proofs p JOIN bookings b ON b.id = p.booking_id LEFT JOIN shipments s ON s.id = p.shipment_id
      WHERE p.status = 'Pending' ORDER BY p.uploaded_at`).all<Row>().then((r) => r.results, () => [] as Row[]);
  if (!rows.length) return "";
  return `<section style="border:2px solid #e5383b"><h2>Proof of payment to check <span class="nav-count">${rows.length}</span></h2>
    <p class="muted">Sent by customers in the website chat. Check UnionBank, then open the booking to record the payment.</p>
    <ul>${rows.map((row) => `<li><a href="${bookingsPath}?id=${esc(row.booking_id)}">${esc(row.booking_ref)} · ${esc(row.full_name)}</a>${row.tracking_number ? ` · ${esc(row.tracking_number)}` : ""} <span class="muted">(${esc(String(row.uploaded_at).replace("T", " ").slice(0, 16))})</span></li>`).join("")}</ul></section>`;
}

