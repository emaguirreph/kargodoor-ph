import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import {
  AdminError, adminOriginAllowed, authenticate, canMutateAdmin, checkCsrf, csrfToken, isRestrictedStaff,
  type AdminEnv, type AdminUser,
} from "./security";
import { esc, page, pesos } from "./ui";
import { generatedIdentifier } from "./data";
import { airItems, itemCategories } from "./quotation-pricing";
import { manualShipmentFreight } from "./shipment-verified-pricing";
import { estimateNiHaoCost } from "./nihao-estimate";
import { niHaoFileResponse } from "./nihao-details";
import { recordShipmentPayment } from "./shipment-payment";
import { copyButton, copyScript, warehouseAddress } from "./shipping-instructions";
import { warehouses } from "./validation";
import { normalizePhMobile } from "../bookings";
import { approveSignup, rejectSignup, signupCount, signupDetail, signupsList } from "./signups";

type Row = Record<string, unknown>;
export const bookingsPath = "/admin/bookings";
const uuid = /^[\da-f-]{36}$/i;
const statuses = ["New", "Approved", "Declined"] as const;
/** Margin under this shows red on the approval calculator. */
const lowMargin = 0.15;

const date = (value: unknown) => String(value ?? "").slice(0, 10);
const kgCbm = (row: Row) => `${Number(row.est_cbm)} CBM · ${Number(row.est_weight_kg)} kg`;
const statusTag = (status: unknown) => {
  const s = String(status);
  const color = s === "New" ? "background:#fff3cd;color:#8a5a00" : s === "Approved" ? "background:#e3f5ea;color:#1d6b3a" : "background:#fde7e7;color:#a12626";
  return `<span class="booking-tag" style="${color}">${esc(s)}</span>`;
};
const proofTag = (status: unknown) => {
  const s = String(status);
  const color = s === "Pending" ? "background:#fff3cd;color:#8a5a00" : s === "Accepted" ? "background:#e3f5ea;color:#1d6b3a" : "background:#fde7e7;color:#a12626";
  return `<span class="booking-tag" style="${color}">${esc(s === "Pending" ? "To check" : s)}</span>`;
};
const csrfField = (env: AdminEnv, user: AdminUser) => `<input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, bookingsPath))}">`;

/** Counts for the red numbers in the menu: bookings to review and customer proofs of payment to check. */
export async function bookingCounts(db: D1Database) {
  const [bookings, proofs, concerns, signups] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status = 'New' AND blocked = 0").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM customer_payment_proofs WHERE status = 'Pending'").first<{ n: number }>(),
    // Portal concerns (Support page); 0 if that table is not there yet.
    db.prepare("SELECT COUNT(*) AS n FROM customer_concerns WHERE status = 'Open'").first<{ n: number }>().catch(() => null),
    // Online sign-ups waiting for approval.
    signupCount(db),
  ]);
  return { bookings: Number(bookings?.n ?? 0), proofs: Number(proofs?.n ?? 0), concerns: Number(concerns?.n ?? 0), signups };
}

/** Customers whose mobile (any format) or email matches the booking. */
async function matchingCustomers(db: D1Database, booking: Row) {
  const rows = (await db.prepare("SELECT id, customer_code, full_name, mobile, email FROM customers WHERE archived_at IS NULL").all<Row>()).results;
  // A booking from the logged-in portal already knows its customer: that one comes first.
  if (booking.customer_id) {
    const own = rows.find((row) => row.id === booking.customer_id);
    if (own) return [own];
  }
  const email = String(booking.email ?? "").trim().toLowerCase();
  return rows.filter((row) => normalizePhMobile(row.mobile) === booking.phone || (email && String(row.email ?? "").trim().toLowerCase() === email));
}

type Pricing = { item: string; category: string; cbm: number; weight: number; quantity: number | null; warehouse: string };

function pricingFrom(booking: Row, source: { get(name: string): string | null }): Pricing {
  const air = booking.service_type === "Air Freight";
  const item = String(source.get("item") ?? "").trim();
  const category = air ? item : (Object.hasOwn(itemCategories, item) ? itemCategories[item] : "");
  const number = (name: string, fallback: unknown) => {
    const raw = source.get(name);
    const value = raw === null || raw === "" ? Number(fallback) : Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : NaN;
  };
  const quantityRaw = source.get("quantity");
  const quantity = quantityRaw ? Number(quantityRaw) : null;
  const savedWarehouse = String(booking.china_warehouse);
  return {
    item, category, cbm: number("cbm", booking.est_cbm), weight: number("weight", booking.est_weight_kg),
    quantity: quantity !== null && Number.isInteger(quantity) && quantity >= 1 ? quantity : null,
    warehouse: String(source.get("warehouse") ?? (savedWarehouse === "Not sure" ? "" : savedWarehouse)),
  };
}

function priceBooking(booking: Row, pricing: Pricing) {
  if (!pricing.item || !(pricing.cbm >= 0) || !(pricing.weight > 0)) return null;
  const freight = manualShipmentFreight({
    serviceType: booking.service_type, item: pricing.item, category: pricing.category,
    quantity: pricing.quantity ?? 1, cbm: pricing.cbm, weight: pricing.weight,
  });
  if (!freight) return null;
  const nihao = estimateNiHaoCost({
    serviceType: String(booking.service_type), category: pricing.category, item: pricing.item,
    cbm: pricing.cbm, weight: pricing.weight, quantity: pricing.quantity ?? 1,
  });
  return { charge: freight.shippingCharge, basis: freight.basis, nihao };
}

function itemOptions(booking: Row, current: string) {
  if (booking.service_type === "Air Freight")
    return airItems.map((item) => `<option${item === current ? " selected" : ""}>${esc(item)}</option>`).join("");
  const groups = new Map<string, string[]>();
  for (const [item, category] of Object.entries(itemCategories)) groups.set(category, [...(groups.get(category) ?? []), item]);
  return [...groups].map(([category, items]) => `<optgroup label="${esc(category)}">${items.map((item) => `<option${item === current ? " selected" : ""}>${esc(item)}</option>`).join("")}</optgroup>`).join("");
}

function approvalMessage(booking: Row, customerCode: string, shipment: Row | null, amount: number) {
  const name = String(booking.full_name).split(/\s+/)[0];
  const air = booking.service_type === "Air Freight";
  const warehouse = String(shipment?.china_warehouse ?? booking.china_warehouse);
  return [
    `Hi ${name}! 😊`,
    "",
    `Your KargoDoor booking ${booking.booking_ref} is approved ✅`,
    "",
    `Cargo code: ${customerCode}`,
    "Please ask your supplier to write this on EVERY box:",
    air ? `AIR ${customerCode}` : customerCode,
    `Item: ${String(booking.item_description ?? "")}`,
    `Supplier no.: ${String(booking.supplier_contact ?? "")}`,
    `PH phone: ${String(booking.phone ?? "")}`,
    "",
    `Warehouse: ${warehouse}`,
    warehouseAddress(warehouse) || "",
    "",
    `Estimated shipping fee: ${pesos(amount)}`,
    "Your final bill is based on the size we measure at the warehouse.",
    "Payment is due once your cargo arrives at our Malabon warehouse, before release or delivery (UnionBank).",
    "",
    `You can check your booking anytime in the chat on kargodoorph.com: type ${booking.booking_ref}.`,
    "",
    "Thank you for choosing KargoDoor PH! 🚚",
  ].join("\n");
}

async function approveBooking(db: D1Database, user: AdminUser, booking: Row, form: FormData) {
  if (booking.status !== "New") throw new AdminError("This booking was already reviewed.", 409);
  const pricing = pricingFrom(booking, { get: (name) => (form.has(name) ? String(form.get(name)) : null) });
  if (!pricing.warehouse || !(warehouses as readonly string[]).includes(pricing.warehouse)) throw new AdminError("Choose the China warehouse.");
  if (!pricing.item) throw new AdminError("Choose the Item / Commodity so the rate can be computed.");
  const price = priceBooking(booking, pricing);
  if (!price) throw new AdminError("The rate could not be computed. Check the CBM, weight and item.");
  const typed = String(form.get("amount") ?? "").trim();
  if (typed && !/^\d+(\.\d{1,2})?$/.test(typed)) throw new AdminError("Type the amount as pesos, for example 2750 or 2750.50.");
  const amount = typed ? Math.round(Number(typed) * 100) : price.charge;
  if (!(amount > 0)) throw new AdminError("The amount must be more than zero.");

  const matches = await matchingCustomers(db, booking);
  const chosen = String(form.get("customer_id") ?? "");
  const existing = chosen === "new" ? null : matches.find((row) => row.id === chosen) ?? (chosen ? null : matches[0] ?? null);
  if (chosen && chosen !== "new" && !existing) throw new AdminError("Choose one of the matching customers, or New customer.");
  const now = new Date().toISOString();
  const customerId = existing ? String(existing.id) : randomUUID();
  const customerCode = existing ? String(existing.customer_code) : await generatedIdentifier(db, "customers", {});
  // The booking number is already the tracking number (KDSEA-/KDAIR-); keep it unless a shipment took it.
  const ref = String(booking.booking_ref ?? "");
  const refFree = /^KD(SEA|AIR)-\d{6}$/.test(ref) && !(await db.prepare("SELECT 1 FROM shipments WHERE tracking_number = ?").bind(ref).first());
  const trackingNumber = refFree ? ref : await generatedIdentifier(db, "shipments", { service_type: String(booking.service_type) });
  if (!customerCode || !trackingNumber) throw new AdminError("Unable to reserve an identifier. Please try again.", 409);
  const shipmentId = randomUUID();
  const air = booking.service_type === "Air Freight";
  const description = `${String(booking.item_description)} · ${String(booking.quantity_text)}`.slice(0, 200);
  const statements: D1PreparedStatement[] = [];
  if (!existing) {
    statements.push(db.prepare("INSERT INTO customers (id, customer_code, full_name, company_name, mobile, email, address, notes, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)")
      .bind(customerId, customerCode, booking.full_name, booking.phone, booking.email ?? null, booking.delivery_address ?? null, `From chat booking ${String(booking.booking_ref)}`, now, now));
  }
  statements.push(db.prepare(`INSERT INTO shipments (id, customer_id, source_quotation_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status,
      shipping_charge, shipping_charge_source, delivery_charge, payment_status, nihao_cost, nihao_cost_source, cargo_item, cargo_category, cargo_quantity, cargo_description,
      tracking_remarks, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(shipmentId, customerId, trackingNumber, booking.service_type, pricing.warehouse, pricing.cbm, pricing.weight,
      air ? "Pending Warehouse Receipt" : "Awaiting Supplier Dispatch", amount, typed ? "manual" : "rate",
      price.nihao?.cost ?? null, price.nihao ? "estimate" : null, pricing.item, pricing.category || null, pricing.quantity, description,
      `Booked in chat: ${String(booking.booking_ref)}`, now, now));
  statements.push(db.prepare("UPDATE bookings SET status = 'Approved', approved_amount = ?, customer_id = ?, shipment_id = ?, reviewed_by_admin_user_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND status = 'New'")
    .bind(amount, customerId, shipmentId, user.id, now, now, booking.id));
  statements.push(db.prepare("INSERT INTO activity_log (id, admin_user_id, action, entity_type, entity_id, old_value, new_value, notes, created_at) VALUES (?, ?, 'approve_booking', 'bookings', ?, NULL, ?, ?, ?)")
    .bind(randomUUID(), user.id, booking.id, JSON.stringify({ booking_ref: booking.booking_ref, customer_code: customerCode, customer_created: !existing, tracking_number: trackingNumber, shipping_charge: amount, basis: price.basis }), `Approved chat booking ${String(booking.booking_ref)}`, now));
  const result = await db.batch(statements);
  if (!result[statements.length - 2]?.meta.changes) throw new AdminError("This booking was already reviewed.", 409);
}

async function acceptProof(db: D1Database, user: AdminUser, booking: Row | null, form: FormData) {
  const proofId = String(form.get("proof_id") ?? "");
  if (!uuid.test(proofId)) throw new AdminError("Invalid proof.");
  const proof = booking
    ? await db.prepare("SELECT * FROM customer_payment_proofs WHERE id = ? AND booking_id = ? AND status = 'Pending'").bind(proofId, booking.id).first<Row>()
    : await db.prepare("SELECT * FROM customer_payment_proofs WHERE id = ? AND status = 'Pending'").bind(proofId).first<Row>();
  if (!proof) throw new AdminError("This proof was already checked.", 409);
  const invoiceId = await recordShipmentPayment(db, new URLSearchParams({
    id: String(proof.shipment_id),
    amount: String(form.get("amount") ?? ""),
    payment_method: "Bank Transfer",
    payment_date: String(form.get("payment_date") ?? ""),
    reference_number: String(form.get("reference_number") ?? ""),
    notes: proof.source === "portal" ? "Proof sent in the customer portal" : `Proof sent in chat (${String(booking?.booking_ref ?? "")})`,
  }), user);
  const payment = await db.prepare("SELECT id FROM payments WHERE invoice_id = ? ORDER BY created_at DESC LIMIT 1").bind(invoiceId).first<{ id: string }>();
  const now = new Date().toISOString();
  await db.batch([
    ...(payment ? [db.prepare(`INSERT INTO payment_proofs (entity_type, entity_id, file_name, file_mime, file_size, file_data, uploaded_by_admin_user_id, uploaded_at)
        SELECT 'payment', ?, file_name, file_mime, file_size, file_data, ?, ? FROM customer_payment_proofs WHERE id = ?
        ON CONFLICT(entity_type, entity_id) DO NOTHING`).bind(payment.id, user.id, now, proofId)] : []),
    db.prepare("UPDATE customer_payment_proofs SET status = 'Accepted', payment_id = ?, invoice_id = ?, reviewed_by_admin_user_id = ?, reviewed_at = ? WHERE id = ?")
      .bind(payment?.id ?? null, invoiceId, user.id, now, proofId),
  ]);
}

function bookingFlags(booking: Row, matches: Row[], recent: number) {
  const flags: string[] = [];
  if (booking.source === "portal") flags.push(`<span class="booking-flag ok">🔐 Booked in the customer portal (logged in)</span>`);
  flags.push(booking.messenger_confirmed_at
    ? `<span class="booking-flag ok">✅ Confirmed on Messenger</span>`
    : `<span class="booking-flag warn">⏳ Not confirmed on Messenger yet</span>`);
  if (matches.length) flags.push(`<span class="booking-flag ok">👤 Returning customer: ${matches.map((row) => esc(`${row.customer_code} ${row.full_name}`)).join(", ")}</span>`);
  if (recent > 1) flags.push(`<span class="booking-flag bad">⚠️ ${recent} bookings from this phone in 24 hours</span>`);
  if (Number(booking.blocked)) flags.push(`<span class="booking-flag bad">⛔ Phone blocked</span>`);
  return `<p class="booking-flags">${flags.join("")}</p>`;
}

const css = `<style>
.booking-tag{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.8rem;font-weight:800}
.booking-flags{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.booking-flag{border-radius:999px;padding:4px 12px;font-size:.88rem;font-weight:700}
.booking-flag.ok{background:#e3f5ea;color:#1d6b3a}.booking-flag.warn{background:#fff3cd;color:#8a5a00}.booking-flag.bad{background:#fde7e7;color:#a12626}
.booking-photos{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}
.booking-photos a{display:block;width:120px;height:120px;border-radius:10px;overflow:hidden;border:1px solid #c6dce9;background:#f2f7fb}
.booking-photos img{width:100%;height:100%;object-fit:cover}
.booking-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 24px;margin:0}
.booking-details div{padding:7px 0;border-bottom:1px solid #e3edf4;min-width:0}.booking-details dt{font-size:.82rem;color:#466177}.booking-details dd{margin:2px 0 0;overflow-wrap:anywhere}
.booking-calc{border:2px solid #0753ad}.booking-price{display:flex;flex-wrap:wrap;gap:10px 28px;align-items:baseline;margin:12px 0}
.booking-price strong{font-size:1.6rem}.booking-margin.low{color:#c62828;font-weight:800}.booking-margin.good{color:#1d6b3a;font-weight:800}
.booking-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.booking-tabs a{padding:7px 14px;border-radius:999px;border:1px solid #94b3c7;text-decoration:none;font-weight:700}.booking-tabs a.on{background:#0753ad;color:#fff;border-color:#0753ad}
.booking-proof{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:14px;align-items:start;border-top:1px solid #e3edf4;padding-top:12px;margin-top:12px}
.signup-link{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;border:1px dashed #94b3c7;border-radius:12px;padding:12px 14px;margin:0 0 14px;background:#f6fafd}
.signup-link>div{flex:1 1 260px}.signup-link input{width:100%;margin-top:6px}
@media(max-width:760px){.booking-details{grid-template-columns:1fr}.booking-proof{grid-template-columns:1fr}}
</style>`;

async function detailPage(db: D1Database, env: AdminEnv, user: AdminUser, id: string, url: URL) {
  const booking = await db.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<Row>();
  if (!booking) throw new AdminError("Booking not found.", 404);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [files, matches, recent, proofs, shipment] = await Promise.all([
    db.prepare("SELECT id, kind, file_name, file_mime FROM booking_files WHERE booking_id = ? ORDER BY kind DESC, uploaded_at").bind(id).all<Row>(),
    matchingCustomers(db, booking),
    db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE phone = ? AND created_at >= ?").bind(booking.phone, since).first<{ n: number }>(),
    db.prepare("SELECT id, status, file_name, uploaded_at, payment_id FROM customer_payment_proofs WHERE booking_id = ? ORDER BY uploaded_at DESC").bind(id).all<Row>(),
    booking.shipment_id ? db.prepare("SELECT s.id, s.tracking_number, s.status, s.china_warehouse, s.shipping_charge, s.delivery_charge, c.customer_code, c.id AS customer_id FROM shipments s JOIN customers c ON c.id = s.customer_id WHERE s.id = ?").bind(booking.shipment_id).first<Row>() : null,
  ]);
  const canWrite = canMutateAdmin(user);
  const notice = url.searchParams.get("done");
  const notices: Record<string, string> = {
    approved: "Approved. The customer and shipment are created. Copy the message below and send it on Messenger.",
    declined: "Booking declined.", confirmed: "Saved.", paid: "Payment recorded. The invoice is updated and the customer can now download the paid invoice in the chat.", rejected: "Proof marked as not accepted.",
  };
  const photos = files.results.filter((file) => file.kind === "photo");
  const packing = files.results.filter((file) => file.kind === "packing");
  const detail = (label: string, value: unknown) => `<div><dt>${esc(label)}</dt><dd>${esc(value === null || value === undefined || value === "" ? "—" : value)}</dd></div>`;
  let html = `${css}<section><div class="actions"><a class="button" href="${bookingsPath}">← Back</a></div>
    ${notice && notices[notice] ? `<p class="notice">${esc(notices[notice])}</p>` : ""}
    <h2>${esc(booking.booking_ref)} · ${esc(booking.full_name)} ${statusTag(booking.status)}</h2>
    ${bookingFlags(booking, matches, Number(recent?.n ?? 0))}
    <dl class="booking-details">
      ${detail("Mobile", booking.phone)}${detail("Email", booking.email)}
      ${detail("Service", booking.service_type)}${detail("China warehouse", booking.china_warehouse)}
      ${detail("Item", booking.item_description)}${detail("Quantity", booking.quantity_text)}
      ${detail("Estimated size", kgCbm(booking))}${detail("Item value", booking.item_value ? pesos(booking.item_value) : "")}
      ${detail("Supplier", booking.supplier_contact)}${detail("In the Philippines", booking.delivery_mode === "Delivery" ? `Delivery · ${String(booking.delivery_address ?? "")}` : "Pickup at Malabon")}
      ${detail("Website estimate", pesos(booking.estimate_amount))}${detail("Booked", String(booking.created_at).replace("T", " ").slice(0, 16))}
      ${booking.notes ? detail("Notes", booking.notes) : ""}
    </dl>
    <h3>Product photos</h3><div class="booking-photos">${photos.map((file) => `<a href="${bookingsPath}?file=${esc(file.id)}" target="_blank" rel="noopener"><img src="${bookingsPath}?file=${esc(file.id)}" alt="${esc(file.file_name)}"></a>`).join("") || '<span class="muted">No photos.</span>'}</div>
    ${packing.length ? `<p>📎 ${packing.map((file) => `<a href="${bookingsPath}?file=${esc(file.id)}" target="_blank" rel="noopener">${esc(file.file_name)}</a>`).join(", ")}</p>` : ""}
    ${canWrite && booking.status !== "Declined" ? `<form method="post" class="actions">${csrfField(env, user)}<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="action" value="messenger"><button>${booking.messenger_confirmed_at ? "Undo Messenger confirmed" : "✅ Mark confirmed on Messenger"}</button></form>` : ""}
  </section>`;

  if (booking.status === "New" && canWrite) {
    const pricing = pricingFrom(booking, url.searchParams);
    const price = priceBooking(booking, pricing);
    const margin = price && price.nihao ? (price.charge - price.nihao.cost) / price.charge : null;
    const warehouseChoices = (warehouses as readonly string[]).map((w) => `<option${w === pricing.warehouse ? " selected" : ""}>${esc(w)}</option>`).join("");
    const customerChoice = matches.length
      ? `<label>Customer<select name="customer_id">${matches.map((row) => `<option value="${esc(row.id)}">${esc(`${row.customer_code} · ${row.full_name}`)} (existing)</option>`).join("")}<option value="new">New customer</option></select></label>`
      : `<p class="muted">A new customer with a KDOOR code will be created.</p>`;
    html += `<section class="booking-calc"><h2>🧮 Rate and approval</h2>
      <p class="muted">Pick the Item / Commodity and check the size, then tap Calculate. Approve creates the customer and the shipment; the bill is made when the cargo arrives and is measured.</p>
      <form method="get" class="grid"><input type="hidden" name="id" value="${esc(id)}">
        <label>Item / Commodity<select name="item" required><option value="">Choose…</option>${itemOptions(booking, pricing.item)}</select></label>
        <label>China warehouse<select name="warehouse" required><option value="">Choose…</option>${warehouseChoices}</select></label>
        <label>CBM<input name="cbm" type="number" min="0" step="0.0001" value="${esc(pricing.cbm)}"></label>
        <label>Weight (kg)<input name="weight" type="number" min="0" step="0.01" value="${esc(pricing.weight)}"></label>
        ${booking.service_type === "Air Freight" ? `<label>Pieces (phones, tablets, laptops)<input name="quantity" type="number" min="1" step="1" value="${esc(pricing.quantity ?? "")}"></label>` : ""}
        <p class="actions" style="grid-column:1/-1"><button>Calculate</button></p>
      </form>
      ${price ? `<div class="booking-price"><span>KargoDoor charge <strong>${pesos(price.charge)}</strong></span><span class="muted">${esc(price.basis)} · ₱30 transfer fee included</span>
        ${price.nihao ? `<span>Ni Hao estimate ${pesos(price.nihao.cost)}</span><span class="booking-margin ${margin !== null && margin < lowMargin ? "low" : "good"}">Margin ${pesos(price.charge - price.nihao.cost)} (${margin === null ? "—" : `${Math.round(margin * 100)}%`})${margin !== null && margin < lowMargin ? " · below 15%" : ""}</span>` : '<span class="muted">No Ni Hao estimate for this item.</span>'}</div>
      <form method="post" class="grid">${csrfField(env, user)}<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="action" value="approve">
        <input type="hidden" name="item" value="${esc(pricing.item)}"><input type="hidden" name="warehouse" value="${esc(pricing.warehouse)}">
        <input type="hidden" name="cbm" value="${esc(pricing.cbm)}"><input type="hidden" name="weight" value="${esc(pricing.weight)}"><input type="hidden" name="quantity" value="${esc(pricing.quantity ?? "")}">
        ${customerChoice}
        <label>Amount (₱) <span class="muted">leave blank to use ${pesos(price.charge)}</span><input name="amount" inputmode="decimal" placeholder="${esc((price.charge / 100).toFixed(2))}"></label>
        <p class="actions" style="grid-column:1/-1"><button>✅ Approve → create customer + shipment</button></p>
      </form>` : `<p class="notice">Choose the Item / Commodity and warehouse, then tap Calculate.</p>`}
    </section>
    <section><h2>Decline</h2><form method="post" class="grid">${csrfField(env, user)}<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="action" value="decline">
      <label>Reason (for your records)<input name="reason" maxlength="300"></label>
      <label><input type="checkbox" name="block" value="1" style="width:auto"> Block this phone number from booking again</label>
      <p class="actions" style="grid-column:1/-1"><button>✕ Decline booking</button></p></form></section>`;
  }

  if (booking.status === "Approved" && shipment) {
    const messageId = `booking-message-${id}`;
    html += `<section><h2>Approved</h2>
      <p>Customer <a href="/admin/customers?id=${esc(shipment.customer_id)}">${esc(shipment.customer_code)}</a> · Shipment <a href="/admin/shipments?id=${esc(shipment.id)}">${esc(shipment.tracking_number)}</a> (${esc(shipment.status)}) · Approved amount ${pesos(booking.approved_amount)}</p>
      <details class="customer-notification" open><summary>Message for the customer (Messenger)</summary><textarea id="${esc(messageId)}" style="min-height:300px;white-space:pre-wrap">${esc(approvalMessage(booking, String(shipment.customer_code), shipment, Number(booking.approved_amount ?? 0)))}</textarea><div class="actions">${copyButton(messageId, "Copy message")}</div></details>${copyScript()}
      <p class="muted">The supplier shipping instructions are on the shipment page under Customer Notifications.</p></section>`;
  }
  if (booking.status === "Declined") html += `<section><h2>Declined</h2><p>${esc(booking.decline_reason || "No reason saved.")}</p></section>`;

  if (proofs.results.length) {
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    html += `<section><h2>Proof of payment from the customer</h2>${proofs.results.map((proof) => `<div class="booking-proof">
      <div><p><a href="${bookingsPath}?proof=${esc(proof.id)}" target="_blank" rel="noopener">📄 ${esc(proof.file_name)}</a></p><p class="muted">Sent ${esc(String(proof.uploaded_at).replace("T", " ").slice(0, 16))} · ${proofTag(proof.status)}</p></div>
      <div>${proof.status === "Pending" && canWrite ? `<p>Check UnionBank first. Then record the payment; the proof is attached to it.</p>
        <form method="post" class="grid">${csrfField(env, user)}<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="action" value="accept_proof"><input type="hidden" name="proof_id" value="${esc(proof.id)}">
          <label>Amount received (₱)<input name="amount" required inputmode="decimal" placeholder="2750.00"></label>
          <label>Payment date<input name="payment_date" type="date" required value="${today}"></label>
          <label>UnionBank reference<input name="reference_number" maxlength="80"></label>
          <p class="actions" style="grid-column:1/-1"><button>✅ Record payment</button></p></form>
        <form method="post">${csrfField(env, user)}<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="action" value="reject_proof"><input type="hidden" name="proof_id" value="${esc(proof.id)}"><button class="secondary">Not received — reject</button></form>` : proof.payment_id ? '<p class="muted">Recorded as a payment.</p>' : ""}</div></div>`).join("")}</section>`;
  }
  return page(String(booking.booking_ref), html, user.name, 200, {}, canWrite);
}

async function listPage(db: D1Database, env: AdminEnv, user: AdminUser, url: URL) {
  const tab = url.searchParams.get("status") ?? "New";
  if (tab === "Concerns") return concernsPage(db, env, user, url);
  if (tab === "Signups") return signupsPage(db, user, url);
  if (![...statuses, "All"].includes(tab)) throw new AdminError("Invalid filter.");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const rows = (await db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM customer_payment_proofs p WHERE p.booking_id = b.id AND p.status = 'Pending') AS pending_proofs
      FROM bookings b WHERE (? = 'All' OR b.status = ?) AND (? = '' OR instr(lower(b.full_name), lower(?)) > 0 OR instr(b.phone, ?) > 0 OR instr(lower(b.booking_ref), lower(?)) > 0)
      ORDER BY b.created_at DESC LIMIT 200`).bind(tab, tab, q, q, q, q).all<Row>()).results;
  const counts = await bookingCounts(db);
  const tabLink = (name: string, label: string) => `<a class="${tab === name ? "on" : ""}" href="${bookingsPath}?status=${encodeURIComponent(name)}">${label}</a>`;
  const body = `${css}<section>
    <p class="muted">Shipments booked in the website chat or by logged-in customers in the portal (🔐). Check the photos and details, confirm the customer on Messenger, then approve to create the shipment.</p>
    <div class="booking-tabs">${tabLink("New", `New${counts.bookings ? ` <span class="nav-count">${counts.bookings}</span>` : ""}`)}${tabLink("Approved", "Approved")}${tabLink("Declined", "Declined")}${tabLink("All", "All")}${concernsTabLink(tab, counts.concerns)}${signupsTabLink(tab, counts.signups)}</div>
    <form method="get" class="search"><input type="hidden" name="status" value="${esc(tab)}"><label>Search name, phone or booking no.<input name="q" value="${esc(q)}"></label><button>Search</button></form>
    ${rows.length ? `<div class="table"><table><thead><tr><th>Booking</th><th>Date</th><th>Customer</th><th>Cargo</th><th>Mode</th><th>Estimate</th><th>Status</th></tr></thead><tbody>
      ${rows.map((row) => `<tr class="inv-row" data-href="${bookingsPath}?id=${esc(row.id)}" tabindex="0"><td><a href="${bookingsPath}?id=${esc(row.id)}"><strong>${esc(row.booking_ref)}</strong></a>${row.source === "portal" ? '<br><small class="muted">🔐 Portal</small>' : ""}</td><td>${esc(date(row.created_at))}</td>
        <td>${esc(row.full_name)}<br><small class="muted">${esc(row.phone)}</small></td><td>${esc(row.item_description)}<br><small class="muted">${esc(row.quantity_text)} · ${esc(kgCbm(row))}</small></td>
        <td>${esc(String(row.service_type).replace(" Freight", ""))}<br><small class="muted">${esc(row.china_warehouse)}</small></td><td>${pesos(row.approved_amount ?? row.estimate_amount)}</td>
        <td>${statusTag(row.status)}${row.messenger_confirmed_at ? ' <span title="Confirmed on Messenger">✅</span>' : ""}${Number(row.pending_proofs) ? ' <span class="nav-count" title="Proof of payment to check">₱</span>' : ""}</td></tr>`).join("")}
    </tbody></table></div><script src="/admin-row-link.js" defer></script>` : '<p class="muted">No bookings here yet.</p>'}
  </section>`;
  return page("Bookings", body, user.name, 200, {}, canMutateAdmin(user));
}

const concernsTabLink = (tab: string, open: number) =>
  `<a class="${tab === "Concerns" ? "on" : ""}" href="${bookingsPath}?status=Concerns">Customer concerns${open ? ` <span class="nav-count">${open}</span>` : ""}</a>`;

const signupsTabLink = (tab: string, waiting: number) =>
  `<a class="${tab === "Signups" ? "on" : ""}" href="${bookingsPath}?status=Signups">Sign-ups${waiting ? ` <span class="nav-count">${waiting}</span>` : ""}</a>`;

/** Online sign-ups from kargodoorph.com/customer/signup. */
async function signupsPage(db: D1Database, user: AdminUser, url: URL) {
  const counts = await bookingCounts(db);
  const tabLink = (name: string, label: string) => `<a href="${bookingsPath}?status=${encodeURIComponent(name)}">${label}</a>`;
  const tabs = `<div class="booking-tabs">${tabLink("New", `New${counts.bookings ? ` <span class="nav-count">${counts.bookings}</span>` : ""}`)}${tabLink("Approved", "Approved")}${tabLink("Declined", "Declined")}${tabLink("All", "All")}${concernsTabLink("Signups", counts.concerns)}${signupsTabLink("Signups", counts.signups)}</div>`;
  return page("Customer sign-ups", css + await signupsList(db, url, tabs), user.name, 200, {}, canMutateAdmin(user));
}

/** Concerns sent from the portal's Support page. */
async function concernsPage(db: D1Database, env: AdminEnv, user: AdminUser, url: URL) {
  const counts = await bookingCounts(db);
  const show = url.searchParams.get("show") === "done" ? "Done" : "Open";
  const rows = (await db.prepare(`SELECT k.*, c.customer_code, c.full_name, c.mobile, s.tracking_number FROM customer_concerns k
      JOIN customers c ON c.id = k.customer_id LEFT JOIN shipments s ON s.id = k.shipment_id
      WHERE k.status = ? ORDER BY k.created_at ${show === "Open" ? "ASC" : "DESC"} LIMIT 200`).bind(show).all<Row>()).results;
  const canWrite = canMutateAdmin(user);
  const tabLink = (name: string, label: string) => `<a href="${bookingsPath}?status=${encodeURIComponent(name)}">${label}</a>`;
  const body = `${css}<section>
    <p class="muted">Concerns customers sent from the Support page of their portal. Reply on Messenger or call them, then mark it done (your note shows to the customer).</p>
    <div class="booking-tabs">${tabLink("New", `New${counts.bookings ? ` <span class="nav-count">${counts.bookings}</span>` : ""}`)}${tabLink("Approved", "Approved")}${tabLink("Declined", "Declined")}${tabLink("All", "All")}${concernsTabLink("Concerns", counts.concerns)}${signupsTabLink("Concerns", counts.signups)}</div>
    ${url.searchParams.get("done") ? '<p class="notice">Saved.</p>' : ""}
    <p class="actions"><a class="button${show === "Open" ? "" : " secondary"}" href="${bookingsPath}?status=Concerns">Open</a> <a class="button${show === "Done" ? "" : " secondary"}" href="${bookingsPath}?status=Concerns&show=done">Done</a></p>
    ${rows.length ? rows.map((row) => `<div class="booking-proof">
      <div><p><strong>${esc(row.topic)}</strong>${row.tracking_number ? ` · <a href="/admin/shipments?id=${esc(row.shipment_id)}">${esc(row.tracking_number)}</a>` : ""}</p>
        <p><a href="/admin/customers?id=${esc(row.customer_id)}">${esc(row.customer_code)} · ${esc(row.full_name)}</a><br><small class="muted">${esc(row.mobile)} · ${esc(String(row.created_at).replace("T", " ").slice(0, 16))}</small></p></div>
      <div><p style="white-space:pre-wrap">${esc(row.message)}</p>
        ${row.status === "Open" && canWrite ? `<form method="post" class="grid">${csrfField(env, user)}<input type="hidden" name="action" value="concern_done"><input type="hidden" name="concern_id" value="${esc(row.id)}">
          <label>Note for the customer (optional)<input name="admin_note" maxlength="500" placeholder="e.g. Called you, your cargo is at Manila Port."></label>
          <p class="actions" style="grid-column:1/-1"><button>✅ Mark done</button></p></form>`
        : `${row.admin_note ? `<p class="muted">Note: ${esc(row.admin_note)}</p>` : ""}${canWrite ? `<form method="post">${csrfField(env, user)}<input type="hidden" name="action" value="concern_reopen"><input type="hidden" name="concern_id" value="${esc(row.id)}"><button class="secondary">Reopen</button></form>` : ""}`}</div></div>`).join("")
      : `<p class="muted">${show === "Open" ? "No open concerns. 🎉" : "No finished concerns yet."}</p>`}
  </section>`;
  return page("Customer concerns", body, user.name, 200, {}, canWrite);
}

/** A proof of payment sent from the customer portal (not tied to a chat booking). */
async function proofReviewPage(db: D1Database, env: AdminEnv, user: AdminUser, proofId: string, url: URL) {
  const proof = await db.prepare(`SELECT p.id, p.status, p.file_name, p.uploaded_at, p.payment_id, p.booking_id, p.shipment_id, p.invoice_id,
      c.id AS customer_id, c.customer_code, c.full_name, s.tracking_number, i.invoice_number, i.total + i.other_charge AS total,
      COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) AS paid
    FROM customer_payment_proofs p LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN shipments s ON s.id = p.shipment_id
    LEFT JOIN invoices i ON i.id = p.invoice_id WHERE p.id = ?`).bind(proofId).first<Row>();
  if (!proof) throw new AdminError("Proof not found.", 404);
  const canWrite = canMutateAdmin(user);
  const done = url.searchParams.get("done");
  const balance = Math.max(0, Number(proof.total ?? 0) - Number(proof.paid ?? 0));
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const isImage = !/\.pdf$/i.test(String(proof.file_name));
  const body = `${css}<section><div class="actions"><a class="button" href="/admin/invoices">← Back</a></div>
    ${done === "paid" ? '<p class="notice">Payment recorded. The bill is updated and the customer sees it as paid in their portal.</p>' : done === "rejected" ? '<p class="notice">Proof marked as not accepted. The customer sees that they need to send it again.</p>' : ""}
    <h2>Proof of payment · ${esc(proof.full_name)} ${proofTag(proof.status)}</h2>
    <p class="booking-flags"><span class="booking-flag ok">🔐 Sent in the customer portal</span></p>
    <dl class="booking-details">
      <div><dt>Customer</dt><dd><a href="/admin/customers?id=${esc(proof.customer_id)}">${esc(proof.customer_code)} · ${esc(proof.full_name)}</a></dd></div>
      <div><dt>Shipment</dt><dd><a href="/admin/shipments?id=${esc(proof.shipment_id)}">${esc(proof.tracking_number)}</a></dd></div>
      <div><dt>Bill</dt><dd>${esc(proof.invoice_number ?? "—")}</dd></div>
      <div><dt>Balance</dt><dd>${pesos(balance)}</dd></div>
      <div><dt>Sent</dt><dd>${esc(String(proof.uploaded_at).replace("T", " ").slice(0, 16))}</dd></div>
      ${proof.booking_id ? `<div><dt>Chat booking</dt><dd><a href="${bookingsPath}?id=${esc(proof.booking_id)}">Open booking</a></dd></div>` : ""}
    </dl>
    <div class="booking-proof">
      <div>${isImage ? `<a href="${bookingsPath}?proof=${esc(proof.id)}" target="_blank" rel="noopener"><img src="${bookingsPath}?proof=${esc(proof.id)}" alt="Proof of payment" style="max-width:100%;border-radius:10px;border:1px solid #c6dce9"></a>` : ""}
        <p><a href="${bookingsPath}?proof=${esc(proof.id)}" target="_blank" rel="noopener">📄 ${esc(proof.file_name)}</a></p></div>
      <div>${proof.status === "Pending" && canWrite ? `<p>Check UnionBank or GCash first. Then record the payment; the proof is attached to it.</p>
        <form method="post" class="grid">${csrfField(env, user)}<input type="hidden" name="action" value="portal_accept_proof"><input type="hidden" name="proof_id" value="${esc(proof.id)}">
          <label>Amount received (₱)<input name="amount" required inputmode="decimal" placeholder="${esc((balance / 100).toFixed(2))}"></label>
          <label>Payment date<input name="payment_date" type="date" required value="${today}"></label>
          <label>Bank reference<input name="reference_number" maxlength="80"></label>
          <p class="actions" style="grid-column:1/-1"><button>✅ Record payment</button></p></form>
        <form method="post">${csrfField(env, user)}<input type="hidden" name="action" value="portal_reject_proof"><input type="hidden" name="proof_id" value="${esc(proof.id)}"><button class="secondary">Not received — reject</button></form>` : proof.payment_id ? '<p class="muted">Recorded as a payment.</p>' : ""}</div>
    </div></section>`;
  return page("Proof of payment", body, user.name, 200, {}, canWrite);
}

export async function bookingsPage(request: Request, envOverride?: AdminEnv): Promise<Response> {
  try {
    const env = envOverride ?? ((await getCloudflareContext()).env as unknown as AdminEnv);
    const user = await authenticate(request, env);
    const db = env.ADMIN_DB;
    const url = new URL(request.url);
    if (isRestrictedStaff(user)) throw new AdminError("This account can access only Quotations and Expenses.", 403);
    if (request.method === "GET" && url.searchParams.get("count") === "1") {
      return new Response(JSON.stringify(await bookingCounts(db)), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
    const fileId = url.searchParams.get("file") ?? url.searchParams.get("proof");
    if (request.method === "GET" && fileId) {
      if (!uuid.test(fileId)) throw new AdminError("Invalid file.");
      const table = url.searchParams.has("file") ? "booking_files" : "customer_payment_proofs";
      const row = await db.prepare(`SELECT file_name, file_mime, file_data FROM ${table} WHERE id = ?`).bind(fileId).first<{ file_name: string; file_mime: string; file_data: ArrayBuffer }>();
      if (!row) throw new AdminError("File not found.", 404);
      return niHaoFileResponse(row);
    }
    if (request.method === "POST") {
      if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
      if (!adminOriginAllowed(env, url.origin)) throw new AdminError("Admin request origin is invalid.", 403);
      const form = await request.formData();
      checkCsrf(env, user.id, bookingsPath, String(form.get("csrf") ?? ""));
      const directAction = String(form.get("action") ?? "");
      // Portal proofs and concerns are not tied to a chat booking.
      if (directAction === "portal_accept_proof" || directAction === "portal_reject_proof") {
        const proofId = String(form.get("proof_id") ?? "");
        if (!uuid.test(proofId)) throw new AdminError("Invalid proof.");
        if (directAction === "portal_accept_proof") await acceptProof(db, user, null, form);
        else await db.prepare("UPDATE customer_payment_proofs SET status = 'Rejected', reviewed_by_admin_user_id = ?, reviewed_at = ? WHERE id = ? AND status = 'Pending'").bind(user.id, new Date().toISOString(), proofId).run();
        return page("Saved", "", user.name, 303, { Location: `${bookingsPath}?review_proof=${encodeURIComponent(proofId)}&done=${directAction === "portal_accept_proof" ? "paid" : "rejected"}` }, true);
      }
      if (directAction === "signup_approve" || directAction === "signup_reject") {
        const signupId = String(form.get("signup_id") ?? "");
        if (!uuid.test(signupId)) throw new AdminError("Invalid sign-up.");
        if (directAction === "signup_approve") await approveSignup(db, user, signupId, form);
        else await rejectSignup(db, user, signupId, form);
        return page("Saved", "", user.name, 303, { Location: `${bookingsPath}?signup=${encodeURIComponent(signupId)}&done=${directAction === "signup_approve" ? "approved" : "rejected"}` }, true);
      }
      if (directAction === "concern_done" || directAction === "concern_reopen") {
        const concernId = String(form.get("concern_id") ?? "");
        if (!uuid.test(concernId)) throw new AdminError("Invalid concern.");
        const now = new Date().toISOString();
        if (directAction === "concern_done")
          await db.prepare("UPDATE customer_concerns SET status = 'Done', admin_note = ?, resolved_by_admin_user_id = ?, resolved_at = ? WHERE id = ?")
            .bind(String(form.get("admin_note") ?? "").trim().slice(0, 500) || null, user.id, now, concernId).run();
        else await db.prepare("UPDATE customer_concerns SET status = 'Open', resolved_by_admin_user_id = NULL, resolved_at = NULL WHERE id = ?").bind(concernId).run();
        return page("Saved", "", user.name, 303, { Location: `${bookingsPath}?status=Concerns&done=1` }, true);
      }
      const id = String(form.get("id") ?? "");
      if (!uuid.test(id)) throw new AdminError("Invalid booking ID.");
      const booking = await db.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<Row>();
      if (!booking) throw new AdminError("Booking not found.", 404);
      const action = String(form.get("action") ?? "");
      const now = new Date().toISOString();
      let done = "";
      if (action === "approve") { await approveBooking(db, user, booking, form); done = "approved"; }
      else if (action === "decline") {
        if (booking.status !== "New") throw new AdminError("This booking was already reviewed.", 409);
        const block = form.get("block") === "1" ? 1 : 0;
        await db.batch([
          db.prepare("UPDATE bookings SET status = 'Declined', decline_reason = ?, blocked = ?, reviewed_by_admin_user_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?")
            .bind(String(form.get("reason") ?? "").trim().slice(0, 300) || null, block, user.id, now, now, id),
          ...(block ? [db.prepare("UPDATE bookings SET blocked = 1 WHERE phone = ?").bind(booking.phone)] : []),
          db.prepare("INSERT INTO activity_log (id, admin_user_id, action, entity_type, entity_id, new_value, created_at) VALUES (?, ?, 'decline_booking', 'bookings', ?, ?, ?)")
            .bind(randomUUID(), user.id, id, JSON.stringify({ booking_ref: booking.booking_ref, blocked: Boolean(block) }), now),
        ]);
        done = "declined";
      } else if (action === "messenger") {
        await db.prepare("UPDATE bookings SET messenger_confirmed_at = ?, updated_at = ? WHERE id = ?").bind(booking.messenger_confirmed_at ? null : now, now, id).run();
        done = "confirmed";
      } else if (action === "accept_proof") { await acceptProof(db, user, booking, form); done = "paid"; }
      else if (action === "reject_proof") {
        const proofId = String(form.get("proof_id") ?? "");
        if (!uuid.test(proofId)) throw new AdminError("Invalid proof.");
        await db.prepare("UPDATE customer_payment_proofs SET status = 'Rejected', reviewed_by_admin_user_id = ?, reviewed_at = ? WHERE id = ? AND booking_id = ? AND status = 'Pending'").bind(user.id, now, proofId, id).run();
        done = "rejected";
      } else throw new AdminError("Unknown action.");
      return page("Saved", "", user.name, 303, { Location: `${bookingsPath}?id=${encodeURIComponent(id)}&done=${done}` }, true);
    }
    const id = url.searchParams.get("id") ?? "";
    if (id) {
      if (!uuid.test(id)) throw new AdminError("Invalid booking ID.");
      return await detailPage(db, env, user, id, url);
    }
    const signupId = url.searchParams.get("signup") ?? "";
    if (signupId) {
      if (!uuid.test(signupId)) throw new AdminError("Invalid sign-up.");
      const canWrite = canMutateAdmin(user);
      return page("Customer sign-up", css + await signupDetail(db, env, user, signupId, url, canWrite), user.name, 200, {}, canWrite);
    }
    const reviewProof = url.searchParams.get("review_proof") ?? "";
    if (reviewProof) {
      if (!uuid.test(reviewProof)) throw new AdminError("Invalid proof.");
      return await proofReviewPage(db, env, user, reviewProof, url);
    }
    return await listPage(db, env, user, url);
  } catch (error) {
    const err = error instanceof AdminError ? error : new AdminError("Bookings are unavailable.", 500);
    if (!(error instanceof AdminError)) console.error("KargoDoor bookings failed", error instanceof Error ? error.message : "Unknown error");
    return page("Bookings", `<p class="notice">${esc(err.message)}</p><p><a href="${bookingsPath}">Back to Bookings</a></p>`, "", err.status);
  }
}
