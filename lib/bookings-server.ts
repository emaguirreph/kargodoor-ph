// Server side of the chat assistant's bookings: create a booking, look it up
// (reference + last 4 digits of the phone), take a proof of payment and give
// back the paid invoice PDF. Every customer-facing answer uses only the
// booking's own records.
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { createHash, randomUUID } from "node:crypto";
import {
  bookingDailyLimit, bookingEstimate, bookingFileMaxBytes, bookingInput, bookingMaxPhotos,
  firstName, formatBookingRef, nextBookingNumber, type BookingInput,
} from "./bookings";
import { sniffNiHaoFile } from "./admin/nihao-details";
import { readShipmentBilling } from "./admin/shipment-payment";
import { customerInvoicePdf, readInvoicePdfData } from "./admin/invoice-pdf";

type Row = Record<string, unknown>;

export class BookingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const pesos = (centavos: number) => Math.round(centavos) / 100;
const fileName = (name: string, fallback: string) => name.replace(/[^\w.\- ]+/g, "_").trim().slice(0, 120) || fallback;

async function readUpload(file: File, label: string) {
  if (!file.size) throw new BookingError(`The ${label} is empty. Please choose it again.`);
  if (file.size > bookingFileMaxBytes) throw new BookingError(`The ${label} is over 1.5 MB. Please use a smaller photo or file.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffNiHaoFile(bytes);
  if (!mime) throw new BookingError(`Please upload the ${label} as a JPEG, PNG, WebP or PDF.`);
  return { bytes, mime, name: fileName(file.name, label) };
}

/** Hashed so the raw IP address is never stored. */
export const clientKey = (ip: string | null) => ip ? createHash("sha256").update(`kd-booking:${ip}`).digest("hex").slice(0, 32) : null;

export function parseBookingForm(form: FormData): { input: BookingInput; photos: File[]; packing: File | null } {
  // Bots fill every field; people never see this one.
  if (String(form.get("website") ?? "").trim()) throw new BookingError("We could not send your booking. Please message us on Messenger.");
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("data") ?? "")); } catch { throw new BookingError("Please fill in the booking form again."); }
  const parsed = bookingInput.safeParse(raw);
  if (!parsed.success) throw new BookingError(parsed.error.issues[0]?.message ?? "Please check your booking details.");
  const photos = form.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  const packing = form.get("packing");
  if (!photos.length) throw new BookingError("Please add at least 1 product photo.");
  if (photos.length > bookingMaxPhotos) throw new BookingError(`Please add up to ${bookingMaxPhotos} photos only.`);
  return { input: parsed.data, photos, packing: packing instanceof File && packing.size > 0 ? packing : null };
}

export async function createBooking(db: D1Database, form: FormData, ip: string | null) {
  const { input, photos, packing } = parseBookingForm(form);
  const key = clientKey(ip);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [blocked, recentByPhone, recentByClient] = await Promise.all([
    db.prepare("SELECT 1 FROM bookings WHERE phone = ? AND blocked = 1 LIMIT 1").bind(input.phone).first(),
    db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE phone = ? AND created_at >= ?").bind(input.phone, since).first<{ n: number }>(),
    key ? db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE client_key = ? AND created_at >= ?").bind(key, since).first<{ n: number }>() : null,
  ]);
  if (blocked) throw new BookingError("We could not take this booking online. Please message us on Messenger.", 403);
  if (Number(recentByPhone?.n ?? 0) >= bookingDailyLimit || Number(recentByClient?.n ?? 0) >= bookingDailyLimit + 2)
    throw new BookingError("You already sent a few bookings today. Please message us on Messenger and we'll help you right away.", 429);

  const files = [
    ...(await Promise.all(photos.map((photo, index) => readUpload(photo, `photo ${index + 1}`)))).map((file) => ({ ...file, kind: "photo" as const })),
    ...(packing ? [{ ...(await readUpload(packing, "packing list")), kind: "packing" as const }] : []),
  ];
  for (const file of files) if (file.kind === "photo" && file.mime === "application/pdf") throw new BookingError("Product photos must be images (JPEG, PNG or WebP).");

  const estimate = bookingEstimate(input.service, input.cbm, input.weight);
  const id = randomUUID();
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const refs = (await db.prepare("SELECT booking_ref FROM bookings").all<{ booking_ref: string }>()).results.map((row) => row.booking_ref);
    const ref = formatBookingRef(nextBookingNumber(refs) + attempt);
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO bookings (id, booking_ref, full_name, phone, email, service_type, delivery_mode, delivery_address, item_description,
          quantity_text, est_cbm, est_weight_kg, item_value, china_warehouse, supplier_contact, notes, estimate_amount, status, client_key, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'New',?,?,?)`)
        .bind(id, ref, input.fullName, input.phone, input.email.toLowerCase() || null, input.service === "sea" ? "Sea Freight" : "Air Freight",
          input.deliveryMode === "delivery" ? "Delivery" : "Pickup", input.deliveryMode === "delivery" ? input.deliveryAddress : null,
          input.item, input.quantity, input.cbm, input.weight, input.itemValue ? Math.round(input.itemValue * 100) : null,
          input.warehouse, input.supplier, input.notes || null, estimate.amount, key, now, now),
      ...files.map((file) => db.prepare("INSERT INTO booking_files (id, booking_id, kind, file_name, file_mime, file_size, file_data, uploaded_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(randomUUID(), id, file.kind, file.name, file.mime, file.bytes.byteLength, file.bytes, now)),
    ];
    try {
      await db.batch(statements);
      return { id, ref, input, estimate };
    } catch (error) {
      if (!String(error).includes("UNIQUE constraint")) throw error;
    }
  }
  throw new BookingError("We could not save your booking. Please try again.", 409);
}

async function findBooking(db: D1Database, lookup: { ref: string; last4: string }) {
  const booking = await db.prepare("SELECT * FROM bookings WHERE booking_ref = ?").bind(lookup.ref).first<Row>();
  // Same answer for a wrong reference and wrong digits, so neither can be guessed one at a time.
  if (!booking || String(booking.phone).slice(-4) !== lookup.last4)
    throw new BookingError("We couldn't find that booking. Please check the booking number and the last 4 digits of your mobile number.", 404);
  return booking;
}

export async function bookingStatus(db: D1Database, lookup: { ref: string; last4: string }) {
  const booking = await findBooking(db, lookup);
  const base = {
    ref: String(booking.booking_ref),
    name: firstName(booking.full_name),
    status: String(booking.status) as "New" | "Approved" | "Declined",
    messengerConfirmed: Boolean(booking.messenger_confirmed_at),
    service: String(booking.service_type),
    warehouse: String(booking.china_warehouse),
    estimate: pesos(Number(booking.estimate_amount ?? 0)),
  };
  if (booking.status !== "Approved" || !booking.shipment_id) return { ...base, shipment: null, bill: null, proof: null };
  const shipment = await db.prepare(`SELECT s.id, s.tracking_number, s.status, s.service_type, s.china_warehouse, s.shipping_charge, s.delivery_charge, c.customer_code
      FROM shipments s JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`).bind(booking.shipment_id).first<Row>();
  if (!shipment) return { ...base, shipment: null, bill: null, proof: null };
  const billing = await readShipmentBilling(db, String(shipment.id), shipment);
  const proof = await db.prepare("SELECT status, uploaded_at FROM customer_payment_proofs WHERE booking_id = ? ORDER BY uploaded_at DESC LIMIT 1")
    .bind(booking.id).first<{ status: string; uploaded_at: string }>();
  return {
    ...base,
    shipment: {
      cargoCode: String(shipment.customer_code),
      trackingNumber: String(shipment.tracking_number),
      status: String(shipment.status),
      warehouse: String(shipment.china_warehouse),
      approvedAmount: pesos(Number(booking.approved_amount ?? shipment.shipping_charge ?? 0)),
    },
    bill: billing.invoiceId ? {
      invoiceNumber: String(billing.invoiceNumber),
      total: pesos(billing.total),
      paid: pesos(billing.paid),
      balance: pesos(Math.max(0, billing.total - billing.paid)),
      status: String(billing.status),
    } : null,
    proof: proof ? { status: proof.status, uploadedAt: proof.uploaded_at } : null,
  };
}

export async function saveCustomerProof(db: D1Database, lookup: { ref: string; last4: string }, file: File) {
  const booking = await findBooking(db, lookup);
  if (booking.status !== "Approved" || !booking.shipment_id) throw new BookingError("You can send your proof of payment once your booking is approved and your bill is ready.", 409);
  const shipment = await db.prepare("SELECT id, shipping_charge, delivery_charge FROM shipments WHERE id = ?").bind(booking.shipment_id).first<Row>();
  if (!shipment) throw new BookingError("Your shipment is not ready yet. Please message us on Messenger.", 409);
  const billing = await readShipmentBilling(db, String(shipment.id), shipment);
  if (!billing.invoiceId) throw new BookingError("Your bill is not ready yet. We'll send it once your cargo arrives in Malabon.", 409);
  if (billing.status === "Paid") throw new BookingError("This bill is already paid. Thank you!", 409);
  const pending = await db.prepare("SELECT COUNT(*) AS n FROM customer_payment_proofs WHERE booking_id = ? AND status = 'Pending'").bind(booking.id).first<{ n: number }>();
  if (Number(pending?.n ?? 0) >= 3) throw new BookingError("We already have your proof of payment and are checking it. Please message us on Messenger if you need help.", 429);
  const upload = await readUpload(file, "proof of payment");
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO customer_payment_proofs (id, booking_id, shipment_id, invoice_id, status, file_name, file_mime, file_size, file_data, uploaded_at)
      VALUES (?,?,?,?,'Pending',?,?,?,?,?)`)
    .bind(randomUUID(), booking.id, shipment.id, billing.invoiceId, upload.name, upload.mime, upload.bytes.byteLength, upload.bytes, now).run();
}

/** The customer's invoice PDF, only once it is fully paid. */
export async function paidInvoicePdf(db: D1Database, lookup: { ref: string; last4: string }) {
  const booking = await findBooking(db, lookup);
  if (!booking.shipment_id) throw new BookingError("There is no paid invoice for this booking yet.", 404);
  const shipment = await db.prepare("SELECT id, shipping_charge, delivery_charge FROM shipments WHERE id = ?").bind(booking.shipment_id).first<Row>();
  const billing = shipment ? await readShipmentBilling(db, String(shipment.id), shipment) : null;
  if (!billing?.invoiceId || billing.status !== "Paid") throw new BookingError("There is no paid invoice for this booking yet.", 404);
  const data = await readInvoicePdfData(db, billing.invoiceId);
  return { pdf: customerInvoicePdf(data), name: `Invoice-${String(data.invoice.invoice_number).replace(/[^A-Za-z0-9-]/g, "")}.pdf` };
}
