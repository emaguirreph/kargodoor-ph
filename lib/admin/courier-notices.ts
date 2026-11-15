// Courier details customers send from the portal (Em, 2026-11-15): admin →
// Bookings → Incoming. "New" ones count in the red Bookings number and on the
// Dashboard, so Em knows a shipment is on its way to the China warehouse.
import type { D1Database } from "@cloudflare/workers-types";
import { AdminError, type AdminUser } from "./security";
import { esc } from "./ui";

type Row = Record<string, unknown>;
export const courierStatuses = ["New", "Noted", "Arrived"] as const;
const uuid = /^[\da-f-]{36}$/i;

/** Courier notices Em has not looked at yet; 0 before migration 0048 is applied. */
export async function incomingCount(db: D1Database) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM customer_courier_notices WHERE status = 'New'").first<{ n: number }>().catch(() => null);
  return Number(row?.n ?? 0);
}

const tag = (status: unknown) => {
  const s = String(status);
  const style = s === "New" ? "background:#fff3cd;color:#8a5a00" : s === "Noted" ? "background:#e7f0ff;color:#1356c9" : "background:#e3f5ea;color:#1d6b3a";
  return `<span class="booking-tag" style="${style}">${esc(s === "New" ? "📦 New · incoming" : s === "Noted" ? "Watching for it" : "Arrived in China")}</span>`;
};
const when = (value: unknown) => String(value ?? "").replace("T", " ").slice(0, 16);

/** The Incoming list. `show` is New (default), Noted, Arrived or All. */
export async function incomingList(db: D1Database, url: URL, path: string, tabs: string, csrfField: string, canWrite: boolean) {
  const raw = url.searchParams.get("show") ?? "New";
  const show = ([...courierStatuses, "All"] as string[]).includes(raw) ? raw : "New";
  const rows = (await db.prepare(`SELECT n.id, n.customer_id, n.shipment_id, n.courier, n.waybill_number, n.packages, n.item, n.note, n.file_name, n.file_mime,
        n.status, n.admin_note, n.created_at, c.customer_code, c.full_name, c.mobile, s.tracking_number, s.status AS shipment_status
      FROM customer_courier_notices n JOIN customers c ON c.id = n.customer_id LEFT JOIN shipments s ON s.id = n.shipment_id
      WHERE (? = 'All' OR n.status = ?) ORDER BY n.created_at ${show === "New" ? "ASC" : "DESC"} LIMIT 200`).bind(show, show).all<Row>()).results;
  const button = (name: string, label: string) => `<a class="button${show === name ? "" : " secondary"}" href="${path}?status=Incoming${name === "New" ? "" : `&show=${name}`}">${label}</a>`;
  const action = (row: Row, value: string, label: string, secondary = false) =>
    `<form method="post" style="display:inline">${csrfField}<input type="hidden" name="action" value="courier_status"><input type="hidden" name="courier_id" value="${esc(row.id)}"><input type="hidden" name="status" value="${value}"><button${secondary ? ' class="secondary"' : ""}>${label}</button></form>`;
  return `<section>
    <p class="muted">Courier details customers sent from their portal once the supplier shipped. Each one means boxes are on the way to the China warehouse. Tap <b>Got it</b> once you've noted it (tell Ni Hao if needed), then <b>Arrived</b> when the warehouse receives it. The customer sees the status in their portal.</p>
    ${tabs}
    ${url.searchParams.get("done") ? '<p class="notice">Saved.</p>' : ""}
    <p class="actions">${button("New", "New")} ${button("Noted", "Watching")} ${button("Arrived", "Arrived")} ${button("All", "All")}</p>
    ${rows.length ? rows.map((row) => {
      const isImage = row.file_mime && row.file_mime !== "application/pdf";
      const file = `${path}?courier_file=${encodeURIComponent(String(row.id))}`;
      return `<div class="booking-proof">
      <div><p>${tag(row.status)}</p>
        <p><a href="/admin/customers?id=${esc(row.customer_id)}">${esc(row.customer_code)} · ${esc(row.full_name)}</a><br><small class="muted">${esc(row.mobile)} · sent ${esc(when(row.created_at))}</small></p>
        ${row.file_name ? isImage ? `<a href="${file}" target="_blank" rel="noopener"><img src="${file}" alt="Waybill photo" style="max-width:100%;max-height:220px;border-radius:10px;border:1px solid #c6dce9"></a>` : `<p><a href="${file}" target="_blank" rel="noopener">📄 ${esc(row.file_name)}</a></p>` : '<p class="muted">No photo</p>'}</div>
      <div><dl class="booking-details">
          <div><dt>Courier</dt><dd><strong>${esc(row.courier)}</strong></dd></div>
          <div><dt>Tracking / waybill no.</dt><dd><strong>${esc(row.waybill_number)}</strong></dd></div>
          <div><dt>Packages</dt><dd>${row.packages ? esc(row.packages) : "—"}</dd></div>
          <div><dt>Shipment</dt><dd>${row.shipment_id ? `<a href="/admin/shipments?id=${esc(row.shipment_id)}">${esc(row.tracking_number)}</a> <small class="muted">${esc(row.shipment_status)}</small>` : '<span class="booking-flag bad">New order, not booked yet</span>'}</dd></div>
          ${row.item ? `<div><dt>Item</dt><dd>${esc(row.item)}</dd></div>` : ""}
          ${row.note ? `<div><dt>Customer note</dt><dd style="white-space:pre-wrap">${esc(row.note)}</dd></div>` : ""}
          ${row.admin_note ? `<div><dt>Your note</dt><dd>${esc(row.admin_note)}</dd></div>` : ""}
        </dl>
        ${canWrite ? `${row.status !== "Arrived" ? `<form method="post" class="grid">${csrfField}<input type="hidden" name="action" value="courier_status"><input type="hidden" name="courier_id" value="${esc(row.id)}">
            <label>Note for the customer (optional)<input name="admin_note" maxlength="500" value="${esc(row.admin_note ?? "")}" placeholder="e.g. Ni Hao is watching for it."></label>
            <p class="actions" style="grid-column:1/-1">${row.status === "New" ? `<button name="status" value="Noted">👀 Got it, watching for it</button> ` : ""}<button name="status" value="Arrived"${row.status === "New" ? ' class="secondary"' : ""}>✅ Arrived at China warehouse</button></p></form>`
          : action(row, "Noted", "Undo arrived", true)}` : ""}</div></div>`;
    }).join("") : `<p class="muted">${show === "New" ? "No new courier details. 🎉" : "Nothing here yet."}</p>`}
  </section>`;
}

/** Saves a status change from the Incoming list. */
export async function setCourierStatus(db: D1Database, user: AdminUser, form: FormData) {
  const id = String(form.get("courier_id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!uuid.test(id)) throw new AdminError("Invalid courier details.");
  if (!(courierStatuses as readonly string[]).includes(status)) throw new AdminError("Invalid status.");
  const note = form.has("admin_note") ? String(form.get("admin_note") ?? "").trim().slice(0, 500) || null : undefined;
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE customer_courier_notices SET status = ?, admin_note = ${note === undefined ? "admin_note" : "?"},
      reviewed_by_admin_user_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
    .bind(...[status, ...(note === undefined ? [] : [note]), user.id, now, now, id]).run();
  if (!result.meta.changes) throw new AdminError("Courier details not found.", 404);
}

/** The waybill photo or PDF, for admins only. */
export async function courierFile(db: D1Database, id: string) {
  if (!uuid.test(id)) throw new AdminError("Invalid file.");
  const row = await db.prepare("SELECT file_name, file_mime, file_data FROM customer_courier_notices WHERE id = ? AND file_data IS NOT NULL")
    .bind(id).first<{ file_name: string; file_mime: string; file_data: ArrayBuffer }>();
  if (!row) throw new AdminError("File not found.", 404);
  return row;
}

/** Incoming courier details for one shipment (shown on the admin shipment page). */
export async function shipmentCourierNotices(db: D1Database, shipmentId: string) {
  return (await db.prepare(`SELECT id, courier, waybill_number, packages, status, created_at, file_name FROM customer_courier_notices
      WHERE shipment_id = ? ORDER BY created_at DESC LIMIT 10`).bind(shipmentId).all<Row>().catch(() => ({ results: [] as Row[] }))).results;
}
