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
  const subject = encodeHeader(oneLine(`New calculator lead ${lead.leadCode}: ${lead.fullName}`));
  const body = [
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
  ].join("\r\n");
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
  const EmailMessage = (globalThis as { __kdEmailMessage?: EmailMessageClass }).__kdEmailMessage;
  if (!binding || !EmailMessage) return;
  try {
    await binding.send(new EmailMessage(FROM, TO, leadAlertMessage(lead)));
  } catch (error) {
    console.error("Lead alert email failed", error);
  }
}
