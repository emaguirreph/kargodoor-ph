// Form posts from the logged-in customer portal. Each one checks the request
// came from our own site, finds the customer's session, and only touches that
// customer's own records. Results go back to the page as ?done=1 or ?error=…
import type { D1Database } from "@cloudflare/workers-types";
import { randomUUID } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { bookingInput } from "@/lib/bookings";
import { BookingError, clientKey, readUpload, saveBooking } from "@/lib/bookings-server";
import { bookingMaxPhotos } from "@/lib/booking-rules";
import { customerSession, customerSessionCookie, requestCookie } from "@/lib/customer/security";
import { concernTopics } from "@/lib/customer/portal";

type Account = NonNullable<Awaited<ReturnType<typeof customerSession>>>;

export const back = (request: Request, path: string, params: Record<string, string>) =>
  new Response(null, { status: 303, headers: { Location: new URL(`${path}?${new URLSearchParams(params)}`, request.url).href, "Cache-Control": "no-store" } });

/** Same-site check + logged-in customer, or the response to send instead. */
export async function portalRequest(request: Request): Promise<{ db: D1Database; account: Account } | Response> {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin))
    return new Response("Invalid request origin.", { status: 403 });
  const { env } = await getCloudflareContext();
  const db = env.ADMIN_DB as unknown as D1Database;
  const account = await customerSession(db, requestCookie(request, customerSessionCookie));
  if (!account) return Response.redirect(new URL("/customer/login", request.url), 303);
  if (account.password_state === "temporary") return Response.redirect(new URL("/customer/change-password", request.url), 303);
  return { db, account };
}

const message = (error: unknown) => error instanceof BookingError ? error.message : "Something went wrong on our side. Please try again or message us on Messenger.";

export async function sendProof(request: Request) {
  const ctx = await portalRequest(request);
  if (ctx instanceof Response) return ctx;
  const { db, account } = ctx;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2 * 1024 * 1024) throw new BookingError("The file is over 1.5 MB. Please send a smaller screenshot.");
    const form = await request.formData();
    const invoiceId = String(form.get("invoice_id") ?? "");
    const file = form.get("file");
    if (!/^[\da-f-]{36}$/i.test(invoiceId)) throw new BookingError("Please choose which bill you paid.");
    if (!(file instanceof File) || !file.size) throw new BookingError("Please choose your screenshot or receipt.");
    const invoice = await db.prepare(`SELECT i.id, i.shipment_id, i.status, i.total + i.other_charge AS total,
        COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
      FROM invoices i WHERE i.id = ? AND i.customer_id = ? AND i.archived_at IS NULL`).bind(invoiceId, account.customer_id)
      .first<{ id: string; shipment_id: string; status: string; total: number; paid: number }>();
    if (!invoice || !["Unpaid", "Partial", "Paid"].includes(invoice.status)) throw new BookingError("We couldn't find that bill. Please message us on Messenger.");
    if (invoice.status === "Paid" && Number(invoice.paid) >= Number(invoice.total)) throw new BookingError("This bill is already paid. Thank you!");
    const pending = await db.prepare("SELECT COUNT(*) AS n FROM customer_payment_proofs WHERE invoice_id = ? AND status = 'Pending'").bind(invoice.id).first<{ n: number }>();
    if (Number(pending?.n ?? 0) >= 3) throw new BookingError("We already have your proof for this bill and are checking it. Please message us on Messenger if you need help.");
    const upload = await readUpload(file, "proof of payment");
    // Link it to the chat booking too when the shipment came from one, so it also shows on that booking.
    const booking = await db.prepare("SELECT id FROM bookings WHERE shipment_id = ? LIMIT 1").bind(invoice.shipment_id).first<{ id: string }>();
    await db.prepare(`INSERT INTO customer_payment_proofs (id, booking_id, customer_id, source, shipment_id, invoice_id, status, file_name, file_mime, file_size, file_data, uploaded_at)
        VALUES (?,?,?,'portal',?,?,'Pending',?,?,?,?,?)`)
      .bind(randomUUID(), booking?.id ?? null, account.customer_id, invoice.shipment_id, invoice.id, upload.name, upload.mime, upload.bytes.byteLength, upload.bytes, new Date().toISOString()).run();
    return back(request, "/customer/payments", { done: "1" });
  } catch (error) {
    if (!(error instanceof BookingError)) console.error("Portal proof upload failed", error instanceof Error ? error.message : "Unknown error");
    return back(request, "/customer/payments", { error: message(error) });
  }
}

const amount = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").replace(/[₱,\s]/g, "");
  return text ? Number(text) : undefined;
};

export async function sendBooking(request: Request) {
  const ctx = await portalRequest(request);
  if (ctx instanceof Response) return ctx;
  const { db, account } = ctx;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 10 * 1024 * 1024) throw new BookingError("Your photos are too big. Please use smaller photos (up to 1.5 MB each).");
    const form = await request.formData();
    const customer = await db.prepare("SELECT full_name, mobile, email FROM customers WHERE id = ?").bind(account.customer_id).first<{ full_name: string; mobile: string; email: string | null }>();
    if (!customer) throw new BookingError("We couldn't find your account. Please message us on Messenger.");
    const parsed = bookingInput.safeParse({
      fullName: customer.full_name, phone: customer.mobile, email: customer.email ?? "",
      service: String(form.get("service") ?? ""), deliveryMode: String(form.get("deliveryMode") ?? "pickup"),
      deliveryAddress: String(form.get("deliveryAddress") ?? ""), item: String(form.get("item") ?? ""), quantity: String(form.get("quantity") ?? ""),
      cbm: amount(form.get("cbm")) ?? 0, weight: amount(form.get("weight")) ?? 0, itemValue: amount(form.get("itemValue")),
      warehouse: String(form.get("warehouse") ?? ""), supplier: String(form.get("supplier") ?? ""), notes: String(form.get("notes") ?? ""), consent: true,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new BookingError(issue?.path[0] === "phone" ? "Your mobile number on file is not a PH mobile number. Please message us so we can update it." : issue?.message ?? "Please check your booking details.");
    }
    const photos = form.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
    const packing = form.get("packing");
    if (!photos.length) throw new BookingError("Please add at least 1 product photo.");
    if (photos.length > bookingMaxPhotos) throw new BookingError(`Please add up to ${bookingMaxPhotos} photos only.`);
    const saved = await saveBooking(db, {
      input: parsed.data, photos, packing: packing instanceof File && packing.size > 0 ? packing : null,
      key: clientKey(request.headers.get("cf-connecting-ip")), customerId: account.customer_id, source: "portal",
    });
    return back(request, "/customer/book", { done: "1", ref: saved.ref });
  } catch (error) {
    if (!(error instanceof BookingError)) console.error("Portal booking failed", error instanceof Error ? error.message : "Unknown error");
    return back(request, "/customer/book", { error: message(error) });
  }
}

export async function sendConcern(request: Request) {
  const ctx = await portalRequest(request);
  if (ctx instanceof Response) return ctx;
  const { db, account } = ctx;
  try {
    const form = await request.formData();
    const topic = String(form.get("topic") ?? "");
    const text = String(form.get("message") ?? "").trim();
    const shipmentId = String(form.get("shipment_id") ?? "");
    if (!(concernTopics as readonly string[]).includes(topic)) throw new BookingError("Please choose what your concern is about.");
    if (text.length < 3 || text.length > 2000) throw new BookingError("Please tell us your concern (up to 2,000 characters).");
    const shipment = shipmentId
      ? await db.prepare("SELECT id FROM shipments WHERE id = ? AND customer_id = ?").bind(shipmentId, account.customer_id).first<{ id: string }>()
      : null;
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recent = await db.prepare("SELECT COUNT(*) AS n FROM customer_concerns WHERE customer_id = ? AND created_at >= ?").bind(account.customer_id, since).first<{ n: number }>();
    if (Number(recent?.n ?? 0) >= 10) throw new BookingError("You already sent a few concerns today. Please message us on Messenger and we'll help you right away.");
    await db.prepare("INSERT INTO customer_concerns (id, customer_id, topic, shipment_id, message, status, created_at) VALUES (?,?,?,?,?,'Open',?)")
      .bind(randomUUID(), account.customer_id, topic, shipment?.id ?? null, text, new Date().toISOString()).run();
    return back(request, "/customer/support", { done: "1" });
  } catch (error) {
    if (!(error instanceof BookingError)) console.error("Portal concern failed", error instanceof Error ? error.message : "Unknown error");
    return back(request, "/customer/support", { error: message(error) });
  }
}
