/** Emails a new calculator lead to KargoDoor through the Cloudflare send_email binding. Never throws. */
type SendEmailBinding = { send(message: unknown): Promise<void> };
type EmailMessageClass = new (from: string, to: string, raw: string) => unknown;

export type LeadAlert = {
  leadCode: string;
  fullName: string;
  phone: string;
  email: string;
  service: "Sea Freight" | "Air Freight";
  cbm: number;
  weightKg: number;
  estimate: string;
  tier?: string;
};

const FROM = "leads@kargodoorph.com";
const TO = "kargodoorph@gmail.com";

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
const encodeHeader = (value: string) =>
  /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

export function leadAlertMessage(lead: LeadAlert, now = new Date()) {
  return alertMessage(`New calculator lead ${lead.leadCode}: ${lead.fullName}`, [
    `A customer just used the shipping calculator on kargodoorph.com.`,
    ``,
    `Lead: ${lead.leadCode}`,
    `Name: ${oneLine(lead.fullName)}`,
    `Phone: ${oneLine(lead.phone)}`,
    `Email: ${oneLine(lead.email) || "—"}`,
    `Service: ${lead.service}`,
    `CBM: ${lead.cbm}`,
    `Weight: ${lead.weightKg} kg`,
    `Estimate: ${lead.estimate}${lead.tier ? ` (${lead.tier})` : ""}`,
    ``,
    `Open Leads in admin: https://kargodoorph.com/admin/leads`,
  ], now);
}

export type BookingAlert = { bookingRef: string; fullName: string; phone: string; service: string; item: string; quantity: string; size: string; warehouse: string; estimate: string };

export function bookingAlertMessage(booking: BookingAlert, now = new Date()) {
  return alertMessage(`New shipment booking ${booking.bookingRef}: ${booking.fullName}`, [
    `A customer booked a shipment in the chat assistant on kargodoorph.com.`,
    ``,
    `Booking: ${booking.bookingRef}`,
    `Name: ${oneLine(booking.fullName)}`,
    `Phone: ${oneLine(booking.phone)}`,
    `Service: ${booking.service}`,
    `Item: ${oneLine(booking.item)} (${oneLine(booking.quantity)})`,
    `Size: ${booking.size}`,
    `Warehouse: ${booking.warehouse}`,
    `Website estimate: ${booking.estimate}`,
    ``,
    `Review it in admin: https://kargodoorph.com/admin/bookings`,
  ], now);
}

function alertMessage(subjectText: string, lines: string[], now: Date) {
  const subject = encodeHeader(oneLine(subjectText));
  const body = lines.join("\r\n");
  return [
    `From: KargoDoor Website <${FROM}>`,
    `To: ${TO}`,
    `Subject: ${subject}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@kargodoorph.com>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
}

export async function sendLeadAlert(binding: SendEmailBinding | undefined, lead: LeadAlert) {
  await sendAlert(binding, leadAlertMessage(lead));
}

export async function sendBookingAlert(binding: SendEmailBinding | undefined, booking: BookingAlert) {
  await sendAlert(binding, bookingAlertMessage(booking));
}

async function sendAlert(binding: SendEmailBinding | undefined, raw: string) {
  const EmailMessage = (globalThis as { __kdEmailMessage?: EmailMessageClass }).__kdEmailMessage;
  if (!binding || !EmailMessage) return;
  try {
    await binding.send(new EmailMessage(FROM, TO, raw));
  } catch (error) {
    console.error("Alert email failed", error);
  }
}
