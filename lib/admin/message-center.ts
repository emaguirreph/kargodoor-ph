import type { D1Database } from "@cloudflare/workers-types";
import { esc, page } from "./ui";
import { AdminError, type AdminUser, csrfToken } from "./security";

const contactFooter = `

—
KargoDoor PH
China to PH, made SIMPLE.

+63 917 157 7370 | +63 908 889 0664
support@kargodoorph.com
www.kargodoorph.com
Messenger: https://m.me/KargoDoorPH
Instagram: @kargodoorph`;

const defaultTemplates = [
  ["welcome", "Welcome", `Hi! Welcome to KargoDoor PH.
Simple shipping from China to the Philippines.

How can we help?`],
  ["cargo-details-received", "Cargo Details Received — Quotation Being Prepared", `Hi [Customer Name]! Thank you for sending your cargo details.

We’ve received the information and are reviewing the item, dimensions, CBM, weight, and shipping route.

We’ll prepare your KargoDoor quotation and send it as soon as all details are confirmed. If we need additional information, we’ll message you here.`],
  ["quotation-ready", "Quotation Ready", `Hi [Customer Name]! Here’s your KargoDoor quotation.

Quotation No.: [Quotation Number]
Estimated Amount: [Amount]
Service: [Sea/Air Freight]
Origin Warehouse: [Warehouse]
Valid Until: [Date]

Please review the cargo details and estimated all-in rate. If you have any questions or would like to proceed, please reply to this message and we’ll guide you through the next step.

Final charges may change if the actual dimensions, CBM, weight, quantity, cargo category, or warehouse inspection results differ from the quoted information.`],
  ["shipping-instructions", "Shipping Instructions", `Hi [Customer Name]! Your KargoDoor account is ready.

Account/Cargo Code: [Account/Cargo Code]
Assigned Warehouse: [Warehouse]
Warehouse Address: [Warehouse Address]

Please ask your supplier to place [Account/Cargo Code] clearly on every package before shipping.

Once shipped, please send us the courier name, tracking/waybill number, and a receipt or package photo so we can monitor your cargo going to our warehouse.`],
  ["tracking-assigned", "Tracking Number Assigned", `Hi [Customer Name]! Your KargoDoor shipment has been assigned a tracking number.

KargoDoor Tracking Number: [Tracking Number]
Cargo Code: [Account/Cargo Code]
Service: [Sea/Air Freight]
Origin Warehouse: [Warehouse]

Track your shipment here:
https://www.kargodoorph.com/track

We’ll send you another update when your cargo is received at our warehouse.`],
  ["warehouse-received", "Cargo Received at Warehouse", `Hi [Customer Name]! We’ve received your cargo at our [Warehouse] warehouse.

Cargo Code: [Account/Cargo Code]
Supplier Waybill: [Supplier Waybill]
Courier: [Courier]
Received: [Date]

We are checking the actual cargo details. Final CBM, weight, and applicable charges may be updated after warehouse verification.

We’ll let you know once the invoice and next steps are ready.`],
  ["payment-reminder", "Payment Reminder", `Hi [Customer Name]! Your KargoDoor invoice is ready.

Invoice No.: [Invoice Number]
Amount Due: [Balance Due]
Payment Status: [Unpaid/Partial]

Please settle the invoice so we can proceed with the release or next shipment step. If you have already paid, please send us the payment receipt so we can verify it.`],
  ["ready-for-release", "Payment Confirmed — Ready for Release", `Hi [Customer Name]! We’ve confirmed your payment.

Your cargo is now ready for release from the KargoDoor warehouse.

Cargo Code: [Account/Cargo Code]
Tracking Number: [Tracking Number]
Invoice No.: [Invoice Number]
Payment Status: Paid

Please let us know whether you prefer pickup or delivery. If delivery is needed, please send us your complete delivery address and preferred schedule.`],
  ["cargo-released", "Cargo Released", `Hi [Customer Name]! Your cargo has been released by KargoDoor.

Tracking Number: [Tracking Number]
Release Date: [Date]

Thank you for choosing KargoDoor PH.
SOURCE • SHIP • RECEIVE`],
  ["get-a-quote", "Get a Quote", `Sure! Please send:

Item name
Item picture
Use / category
Dimensions (L × W × H)
Number of packages
Total CBM
Total weight (kg)
Supplier location
Sea or Air

We’ll check the applicable rate for you.

Calculator: https://www.kargodoorph.com/rates-calculator`],
  ["how-it-works", "How KargoDoor Works", `Simple lang!

SOURCE → SHIP → RECEIVE

1. Supplier sends your goods to our assigned origin warehouse using your KargoDoor cargo code.
2. KargoDoor ships the goods to the Philippines and handles customs clearance.
3. Pickup or delivery is arranged from our receiving warehouse.

China to PH, made SIMPLE.`],
  ["track-shipment", "Track Shipment", `Please send us your KargoDoor tracking number, or track it here:

https://www.kargodoorph.com/track`],
  ["thank-you", "Thank You", `Thank you for choosing KargoDoor PH.

SOURCE • SHIP • RECEIVE
China to PH, made simple.`],
] as const;

export type MessageTemplate = { template_key: string; title: string; body: string };

const withFooter = (body: string) => `${body}${contactFooter}`;

async function ensureDefaults(db: D1Database, userId: string) {
  const now = new Date().toISOString();
  for (const [key, title, body] of defaultTemplates) {
    await db.prepare(`INSERT OR IGNORE INTO message_templates (template_key,title,body,updated_by_admin_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
      .bind(key, title, withFooter(body), userId, now, now).run();
  }
}

async function loadTemplates(db: D1Database, userId: string): Promise<MessageTemplate[]> {
  await ensureDefaults(db, userId);
  const result = await db.prepare("SELECT template_key,title,body FROM message_templates ORDER BY rowid").all<MessageTemplate>();
  return result.results;
}

export async function saveMessageTemplate(db: D1Database, user: AdminUser, form: URLSearchParams) {
  if (user.role !== "owner") throw new AdminError("Only the owner can edit Message Library templates.", 403);
  const key = form.get("template_key") ?? "";
  const title = (form.get("title") ?? "").trim();
  const body = (form.get("body") ?? "").trim();
  if (!/^[a-z0-9-]{1,80}$/.test(key) || !title || title.length > 120 || !body || body.length > 8000) {
    throw new AdminError("Enter a valid template title and message.");
  }
  await db.prepare("UPDATE message_templates SET title=?, body=?, updated_by_admin_user_id=?, updated_at=? WHERE template_key=?")
    .bind(title, body, user.id, new Date().toISOString(), key).run();
}

export async function resetMessageTemplate(db: D1Database, user: AdminUser, key: string) {
  if (user.role !== "owner") throw new AdminError("Only the owner can reset Message Library templates.", 403);
  const template = defaultTemplates.find(([templateKey]) => templateKey === key);
  if (!template) throw new AdminError("Message template not found.", 404);
  await db.prepare("UPDATE message_templates SET title=?, body=?, updated_by_admin_user_id=?, updated_at=? WHERE template_key=?")
    .bind(template[1], withFooter(template[2]), user.id, new Date().toISOString(), key).run();
}

export async function messageLibraryPage(db: D1Database, user: AdminUser, path: string, env: Parameters<typeof csrfToken>[0], canWrite = true) {
  const templates = await loadTemplates(db, user.id);
  const owner = user.role === "owner";
  const cards = templates.map((template, index) => {
    const id = `message-template-${index}`;
    const csrf = csrfToken(env, user.id, path);
    return `<section class="message-template"><div class="message-template-header"><h2>${esc(template.title)}</h2><button type="button" class="copy-message" data-copy-source="${id}">Copy message</button></div>${owner ? `<form method="post" action="${path}"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="action" value="message_save"><input type="hidden" name="template_key" value="${esc(template.template_key)}"><label>Template name<input name="title" maxlength="120" value="${esc(template.title)}" required></label><label>Message<textarea id="${id}" name="body" maxlength="8000" required>${esc(template.body)}</textarea></label><div class="actions"><button type="submit">Save template</button></div></form><form method="post" action="${path}"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="action" value="message_reset"><input type="hidden" name="template_key" value="${esc(template.template_key)}"><div class="actions"><button type="submit">Reset to default</button></div></form>` : `<textarea id="${id}" readonly aria-label="${esc(template.title)} message">${esc(template.body)}</textarea>`}</section>`;
  }).join("");
  return page("Message Library", `<p class="notice">Use this library for customer communication. Copy a message, review it, then paste it into Messenger, WhatsApp, or email. ${owner ? "You are the owner, so you can edit and reset templates." : "Only the owner can edit these templates."}</p><div class="message-center">${cards}</div><script>document.querySelectorAll('.copy-message').forEach((button)=>button.addEventListener('click',async()=>{const textarea=document.getElementById(button.dataset.copySource)||button.closest('.message-template').querySelector('textarea');if(!textarea)return;textarea.select();try{await navigator.clipboard.writeText(textarea.value);button.textContent='Copied!'}catch{document.execCommand('copy');button.textContent='Copied!'}setTimeout(()=>button.textContent='Copy message',1600)}))</script><style>.message-center{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.message-template{margin:0}.message-template-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.message-template-header h2{margin:0}.message-template textarea{min-height:250px;white-space:pre-wrap}.message-template form textarea{min-height:250px}.message-template form label{display:block;margin-top:12px}.copy-message{white-space:nowrap}@media(max-width:760px){.message-center{grid-template-columns:1fr}.message-template-header{align-items:flex-start;flex-direction:column}}</style>`, user.name, 200, {}, canWrite);
}

export { contactFooter, defaultTemplates, loadTemplates };
