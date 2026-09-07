import { randomUUID } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { z, ZodError } from "zod";
import { authenticate, AdminError, canonicalOrigin, checkCsrf, csrfToken, type AdminEnv } from "./security";
import type { RecordData } from "./validation";
import { esc, hidden, page, pesos } from "./ui";

const route = "/admin/invoices";
const invoiceStatuses = ["Draft", "Unpaid", "Partial", "Paid"] as const;
const paymentMethods = ["Cash", "Bank Transfer", "GCash", "Maya", "Other"] as const;
const required = (max: number) => z.string().trim().min(1).max(max);
const optionalDate = z.string().trim().refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v).toISOString().slice(0, 10) === v), "Enter a valid date").transform((v) => v || null);
const money = required(30).regex(/^\d+(\.\d{1,2})?$/, "Use a non-negative peso amount with at most 2 decimals").transform((v) => {
  const [whole, fraction = ""] = v.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}).refine((v) => Number.isSafeInteger(v) && v <= 100000000000, "Amount is too large");
const invoiceSchema = z.object({
  shipment_id: z.string().uuid(), delivery_charge: money, other_charge: money,
  status: z.enum(["Draft", "Unpaid"]), issued_at: optionalDate, due_at: optionalDate,
}).strict().superRefine((v, ctx) => {
  if (v.status === "Unpaid" && !v.issued_at) ctx.addIssue({ code: "custom", path: ["issued_at"], message: "Issue date is required for an unpaid invoice" });
  if (v.issued_at && v.due_at && v.due_at < v.issued_at) ctx.addIssue({ code: "custom", path: ["due_at"], message: "Due date cannot be before the issue date" });
});
const paymentSchema = z.object({
  invoice_id: z.string().uuid(), amount: money.refine((v) => v > 0, "Payment must be greater than zero"),
  payment_method: z.enum(paymentMethods), reference_number: z.string().trim().max(160).transform((v) => v || null),
  payment_date: optionalDate.refine((v) => v !== null, "Payment date is required"),
  notes: z.string().trim().max(1000).transform((v) => v || null),
}).strict();
const issueSchema = z.object({
  invoice_id: z.string().uuid(),
  issued_at: optionalDate.refine((v) => v !== null, "Issue date is required"),
  due_at: optionalDate,
}).strict().superRefine((v, ctx) => {
  if (v.due_at && v.issued_at && v.due_at < v.issued_at) ctx.addIssue({ code: "custom", path: ["due_at"], message: "Due date cannot be before the issue date" });
});
const invoiceKeys = ["shipment_id", "delivery_charge", "other_charge", "status", "issued_at", "due_at"];
const paymentKeys = ["invoice_id", "amount", "payment_method", "reference_number", "payment_date", "notes"];
const issueKeys = ["invoice_id", "issued_at", "due_at"];

function parse(form: URLSearchParams, action: "invoice" | "payment" | "issue") {
  const keys = action === "invoice" ? invoiceKeys : action === "payment" ? paymentKeys : issueKeys;
  const allowed = new Set(["csrf", "action", ...keys]);
  for (const key of form.keys()) if (!allowed.has(key) || form.getAll(key).length !== 1) throw new AdminError("Unexpected or repeated form field.");
  const raw = Object.fromEntries(keys.map((key) => [key, form.get(key) ?? ""]));
  return action === "invoice" ? invoiceSchema.parse(raw) : action === "payment" ? paymentSchema.parse(raw) : issueSchema.parse(raw);
}

async function readForm(request: Request, env: AdminEnv, userId: string) {
  if (request.headers.get("origin") !== canonicalOrigin(env) || request.headers.get("sec-fetch-site") === "cross-site") throw new AdminError("Cross-site form submission rejected.", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") throw new AdminError("Unsupported form format.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AdminError("Form is empty.");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length; if (length > 24000) { await reader.cancel(); throw new AdminError("Form is too large.", 413); }
    chunks.push(value);
  }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  checkCsrf(env, userId, route, form.get("csrf") ?? "");
  return form;
}

export async function createInvoice(db: D1Database, raw: unknown, adminId: string) {
  const values = typeof (raw as { delivery_charge?: unknown })?.delivery_charge === "number"
    ? raw as z.infer<typeof invoiceSchema>
    : invoiceSchema.parse(raw);
  const shipment = await db.prepare(`SELECT s.id,s.customer_id,s.tracking_number,s.shipping_charge,c.customer_code,c.full_name FROM shipments s JOIN customers c ON c.id=s.customer_id WHERE s.id=? LIMIT 1`).bind(values.shipment_id).first<RecordData>();
  if (!shipment) throw new AdminError("Choose an existing shipment.", 404);
  const id = randomUUID(), timestamp = new Date().toISOString();
  const number = `INV-${timestamp.slice(0, 10).replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`;
  const baseTotal = Number(shipment.shipping_charge) + values.delivery_charge;
  const snapshot = { invoice_number: number, customer_id: shipment.customer_id, shipment_id: shipment.id, tracking_number: shipment.tracking_number, customer_code: shipment.customer_code, customer_name: shipment.full_name, kargodoor_charge: shipment.shipping_charge, delivery_charge: values.delivery_charge, other_charge: values.other_charge, invoice_total: baseTotal + values.other_charge, status: values.status, issued_at: values.issued_at, due_at: values.due_at };
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO invoices (id,invoice_number,customer_id,shipment_id,subtotal,delivery_charge,total,status,issued_at,due_at,created_at,updated_at,other_charge) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, number, shipment.customer_id, shipment.id, shipment.shipping_charge, values.delivery_charge, baseTotal, values.status, values.issued_at, values.due_at, timestamp, timestamp, values.other_charge),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) VALUES (?,?,?,?,?,NULL,?,?,?)`).bind(randomUUID(), adminId, "create_invoice", "invoices", id, JSON.stringify(snapshot), null, timestamp),
  ];
  if (values.status === "Unpaid") statements.push(
    db.prepare("UPDATE shipments SET payment_status='Unpaid',updated_at=? WHERE id=?").bind(timestamp, shipment.id),
  );
  try { await db.batch(statements); }
  catch (error) { if (String(error).includes("UNIQUE constraint")) throw new AdminError("This shipment already has an invoice.", 409); throw error; }
  return id;
}

export async function recordPayment(db: D1Database, raw: unknown, adminId: string) {
  const values = typeof (raw as { amount?: unknown })?.amount === "number"
    ? raw as z.infer<typeof paymentSchema>
    : paymentSchema.parse(raw);
  const invoice = await db.prepare(`SELECT i.*,COALESCE(SUM(p.amount),0) AS amount_paid FROM invoices i LEFT JOIN payments p ON p.invoice_id=i.id WHERE i.id=? GROUP BY i.id`).bind(values.invoice_id).first<RecordData>();
  if (!invoice) throw new AdminError("Invoice not found.", 404);
  if (invoice.status === "Draft") throw new AdminError("Issue the invoice before recording a payment.", 409);
  const grandTotal = Number(invoice.total) + Number(invoice.other_charge), remaining = grandTotal - Number(invoice.amount_paid);
  if (values.amount > remaining) throw new AdminError("Payment cannot exceed the remaining balance.", 409);
  const id = randomUUID(), timestamp = new Date().toISOString();
  const payment = { ...values, id, customer_id: invoice.customer_id };
  const statements = [
    db.prepare(`INSERT INTO payments (id,invoice_id,customer_id,amount,payment_method,reference_number,payment_date,notes,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM invoices i WHERE i.id=? AND i.status IN ('Unpaid','Partial') AND ? <= (i.total+i.other_charge-COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0)))`).bind(id, invoice.id, invoice.customer_id, values.amount, values.payment_method, values.reference_number, values.payment_date, values.notes, timestamp, invoice.id, values.amount),
    db.prepare(`UPDATE invoices SET status=CASE WHEN COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=?),0) >= total+other_charge THEN 'Paid' ELSE 'Partial' END,updated_at=? WHERE id=? AND status IN ('Unpaid','Partial')`).bind(invoice.id, timestamp, invoice.id),
    db.prepare(`UPDATE shipments SET payment_status=CASE WHEN COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=?),0) >= (SELECT total+other_charge FROM invoices WHERE id=?) THEN 'Paid' ELSE 'Partial' END,updated_at=? WHERE id=?`).bind(invoice.id, invoice.id, timestamp, invoice.shipment_id),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) SELECT ?,?,?,?,?,?,?,NULL,? WHERE EXISTS (SELECT 1 FROM payments WHERE id=?)`).bind(randomUUID(), adminId, "record_payment", "payments", id, null, JSON.stringify(payment), timestamp, id),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) SELECT ?,?,?,?,?,?,json_object('status',(SELECT status FROM invoices WHERE id=?)),NULL,? WHERE EXISTS (SELECT 1 FROM payments WHERE id=?)`).bind(randomUUID(), adminId, "change_invoice_status", "invoices", invoice.id, JSON.stringify({ status: invoice.status }), invoice.id, timestamp, id),
  ];
  const result = await db.batch(statements);
  if (!result[0]?.meta.changes) throw new AdminError("Invoice changed while the payment was being saved. Reload and try again.", 409);
  return String(invoice.id);
}

export async function issueInvoice(db: D1Database, raw: unknown, adminId: string) {
  const values = issueSchema.parse(raw), timestamp = new Date().toISOString();
  const result = await db.batch([
    db.prepare("UPDATE invoices SET status='Unpaid',issued_at=?,due_at=?,updated_at=? WHERE id=? AND status='Draft'").bind(values.issued_at, values.due_at, timestamp, values.invoice_id),
    db.prepare("UPDATE shipments SET payment_status='Unpaid',updated_at=? WHERE id=(SELECT shipment_id FROM invoices WHERE id=? AND status='Unpaid')").bind(timestamp, values.invoice_id),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) SELECT ?,?,?,?,?,?,?,NULL,? WHERE EXISTS (SELECT 1 FROM invoices WHERE id=? AND status='Unpaid' AND updated_at=?)`).bind(randomUUID(),adminId,"issue_invoice","invoices",values.invoice_id,JSON.stringify({status:"Draft"}),JSON.stringify({status:"Unpaid",issued_at:values.issued_at,due_at:values.due_at}),timestamp,values.invoice_id,timestamp),
  ]);
  if (!result[0]?.meta.changes) throw new AdminError("Only a Draft invoice can be issued.",409);
  return values.invoice_id;
}

function paymentForm(env: AdminEnv, userId: string, invoice: RecordData) {
  if (invoice.status === "Draft" || invoice.status === "Paid") return "";
  return `<section><h2>Record payment</h2><form method="post" action="${route}">${hidden("csrf", csrfToken(env,userId,route))}${hidden("action","payment")}${hidden("invoice_id",invoice.id)}<div class="grid"><label>Payment date *<input type="date" name="payment_date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Amount (PHP) *<input name="amount" inputmode="decimal" required></label><label>Method *<select name="payment_method">${paymentMethods.map((v)=>`<option>${esc(v)}</option>`).join("")}</select></label><label>Reference number<input name="reference_number" maxlength="160"></label><label class="wide">Notes<textarea name="notes" maxlength="1000"></textarea></label></div><div class="actions"><button>Record payment</button></div></form></section>`;
}

function issueForm(env: AdminEnv, userId: string, invoice: RecordData) {
  if (invoice.status !== "Draft") return "";
  const today = new Date().toISOString().slice(0,10);
  return `<section><h2>Issue invoice</h2><form method="post" action="${route}">${hidden("csrf",csrfToken(env,userId,route))}${hidden("action","issue")}${hidden("invoice_id",invoice.id)}<div class="grid"><label>Issue date *<input type="date" name="issued_at" value="${today}" required></label><label>Due date<input type="date" name="due_at"></label></div><div class="actions"><button>Issue invoice</button></div></form></section>`;
}

async function detail(db: D1Database, env: AdminEnv, user: {id:string;name:string}, id: string, saved: string) {
  if (!/^[\da-f-]{36}$/i.test(id)) throw new AdminError("Invalid invoice ID.");
  const invoice = await db.prepare(`SELECT i.*,c.customer_code,c.full_name,c.company_name,s.tracking_number,s.service_type,s.china_warehouse,COALESCE(SUM(p.amount),0) AS amount_paid FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN shipments s ON s.id=i.shipment_id LEFT JOIN payments p ON p.invoice_id=i.id WHERE i.id=? GROUP BY i.id`).bind(id).first<RecordData>();
  if (!invoice) throw new AdminError("Invoice not found.",404);
  const grand = Number(invoice.total)+Number(invoice.other_charge), paid=Number(invoice.amount_paid), remaining=grand-paid;
  const payments=(await db.prepare(`SELECT payment_date,amount,payment_method,reference_number FROM payments WHERE invoice_id=? ORDER BY payment_date DESC,created_at DESC,id`).bind(id).all<RecordData>()).results;
  return page(`Invoice ${invoice.invoice_number}`,`${saved?'<p class="notice" role="status">Changes saved.</p>':""}<div class="cards"><div class="card">Invoice total<strong>${esc(pesos(grand))}</strong></div><div class="card">Amount paid<strong>${esc(pesos(paid))}</strong></div><div class="card">Balance<strong>${esc(pesos(remaining))}</strong></div><div class="card">Status<strong>${esc(invoice.status)}</strong></div></div><section><h2>Connected records</h2><dl><dt>Customer</dt><dd><a href="/admin/customers?id=${esc(invoice.customer_id)}">${esc(invoice.customer_code)} — ${esc(invoice.full_name)}</a></dd><dt>Shipment</dt><dd><a href="/admin/shipments?id=${esc(invoice.shipment_id)}">${esc(invoice.tracking_number)}</a><br>${esc(invoice.service_type)} · ${esc(invoice.china_warehouse)}</dd><dt>KargoDoor charge</dt><dd>${esc(pesos(invoice.subtotal))}</dd><dt>Delivery charge</dt><dd>${esc(pesos(invoice.delivery_charge))}</dd><dt>Other charge</dt><dd>${esc(pesos(invoice.other_charge))}</dd><dt>Issued</dt><dd>${esc(invoice.issued_at)||"Draft"}</dd><dt>Due</dt><dd>${esc(invoice.due_at)||"—"}</dd></dl><div class="actions"><a href="/admin/activity?entity_type=invoices&entity_id=${esc(invoice.id)}">View invoice activity</a></div></section><section><h2>Payment history</h2>${payments.length?`<div class="table"><table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead><tbody>${payments.map((p)=>`<tr><td>${esc(p.payment_date)}</td><td>${esc(pesos(p.amount))}</td><td>${esc(p.payment_method)}</td><td>${esc(p.reference_number)||"—"}</td></tr>`).join("")}</tbody></table></div>`:"<p>No payments recorded.</p>"}</section>${issueForm(env,user.id,invoice)}${paymentForm(env,user.id,invoice)}`,user.name);
}

async function createView(db:D1Database,env:AdminEnv,user:{id:string;name:string},url:URL){
  const q=(url.searchParams.get("shipment_search")??"").trim(), selected=url.searchParams.get("shipment_id")??"";
  if(q.length>160||(selected&&!/^[\da-f-]{36}$/i.test(selected)))throw new AdminError("Invalid shipment search.");
  const shipments=(await db.prepare(`SELECT s.id,s.tracking_number,s.shipping_charge,s.delivery_charge,c.customer_code,c.full_name FROM shipments s JOIN customers c ON c.id=s.customer_id LEFT JOIN invoices i ON i.shipment_id=s.id WHERE i.id IS NULL AND ((?!='' AND (instr(lower(s.tracking_number),lower(?))>0 OR instr(lower(c.full_name),lower(?))>0 OR instr(lower(c.customer_code),lower(?))>0)) OR s.id=?) ORDER BY CASE WHEN s.id=? THEN 0 ELSE 1 END,s.updated_at DESC LIMIT 50`).bind(q,q,q,q,selected,selected).all<RecordData>()).results;
  const chosen=shipments.find((s)=>s.id===selected);
  return page("Create invoice",`<section><form method="get" action="${route}" class="search">${hidden("new","1")}<label>Find shipment or customer<input name="shipment_search" maxlength="160" value="${esc(q)}"></label><button>Find shipment</button></form><p class="muted">Only shipments without an invoice appear. Customer and shipment information comes from connected records.</p></section><section><form method="post" action="${route}">${hidden("csrf",csrfToken(env,user.id,route))}${hidden("action","invoice")}<div class="grid"><label class="wide">Shipment *<select name="shipment_id" required><option value="">Choose an existing shipment</option>${shipments.map((s)=>`<option value="${esc(s.id)}"${selected===s.id?" selected":""}>${esc(s.tracking_number)} — ${esc(s.customer_code)} — ${esc(s.full_name)}</option>`).join("")}</select></label>${chosen?`<div class="wide notice"><strong>Auto-filled from connected records</strong><br>Customer: ${esc(chosen.customer_code)} — ${esc(chosen.full_name)}<br>KargoDoor charge: ${esc(pesos(chosen.shipping_charge))}</div>`:""}<label>Delivery charge (PHP)<input name="delivery_charge" inputmode="decimal" value="${chosen?Number(chosen.delivery_charge)/100:0}" required></label><label>Other charge (PHP)<input name="other_charge" inputmode="decimal" value="0" required></label><label>Status *<select name="status"><option>Draft</option><option>Unpaid</option></select></label><label>Issue date<input type="date" name="issued_at"></label><label>Due date<input type="date" name="due_at"></label></div><p class="muted">The invoice number and total are generated when saved. Issue date is required for Unpaid status.</p><div class="actions"><button>Create invoice</button><a href="${route}">Cancel</a></div></form></section>`,user.name);
}

async function list(db:D1Database,user:{name:string},url:URL){
  const q=(url.searchParams.get("q")??"").trim(),status=url.searchParams.get("status")??"",number=Number(url.searchParams.get("page")??1);
  if(q.length>160||(status&&!invoiceStatuses.includes(status as never))||!Number.isSafeInteger(number)||number<1||number>100000)throw new AdminError("Invalid invoice search.");
  const rows=(await db.prepare(`SELECT i.id,i.invoice_number,i.status,i.issued_at,i.total+i.other_charge AS invoice_total,COALESCE(SUM(p.amount),0) AS amount_paid,c.full_name,s.tracking_number FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN shipments s ON s.id=i.shipment_id LEFT JOIN payments p ON p.invoice_id=i.id WHERE (instr(lower(i.invoice_number),lower(?))>0 OR instr(lower(c.full_name),lower(?))>0 OR instr(lower(s.tracking_number),lower(?))>0) AND (?='' OR i.status=?) GROUP BY i.id ORDER BY i.updated_at DESC,i.id LIMIT 26 OFFSET ?`).bind(q,q,q,status,status,(number-1)*25).all<RecordData>()).results;
  const link=(n:number)=>{const p=new URLSearchParams(url.searchParams);p.set("page",String(n));return `${route}?${esc(p.toString())}`;};
  return page("Invoices",`<section><form method="get" action="${route}" class="search"><label>Search invoice, shipment or customer<input name="q" maxlength="160" value="${esc(q)}"></label><label>Status<select name="status"><option value="">All statuses</option>${invoiceStatuses.map((v)=>`<option${status===v?" selected":""}>${v}</option>`).join("")}</select></label><button>Search</button><a href="${route}">Clear</a></form><div class="actions"><a class="button" href="${route}?new=1">Create invoice</a></div></section><section>${rows.length?`<div class="table"><table><thead><tr><th>Invoice</th><th>Customer / shipment</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>${rows.slice(0,25).map((r)=>`<tr><td><a href="${route}?id=${esc(r.id)}">${esc(r.invoice_number)}</a><br><span class="muted">${esc(r.issued_at)||"Draft"}</span></td><td>${esc(r.full_name)}<br><span class="muted">${esc(r.tracking_number)}</span></td><td>${esc(r.status)}</td><td>${esc(pesos(r.invoice_total))}</td><td>${esc(pesos(r.amount_paid))}</td><td>${esc(pesos(Number(r.invoice_total)-Number(r.amount_paid)))}</td></tr>`).join("")}</tbody></table></div>`:"<p>No matching invoices.</p>"}<div class="actions">${number>1?`<a href="${link(number-1)}">Previous</a>`:""}<span>Page ${number}</span>${rows.length>25?`<a href="${link(number+1)}">Next</a>`:""}</div></section>`,user.name);
}

export async function handleBilling(request:Request){let localChallenge=false;try{
  const{env:cf}=await getCloudflareContext();const env=cf as unknown as AdminEnv;localChallenge=env.ADMIN_LOCAL_DEV==="true"&&["localhost","127.0.0.1"].includes(new URL(canonicalOrigin(env)).hostname);const user=await authenticate(request,env),db=env.ADMIN_DB,url=new URL(request.url);if(url.pathname!==route&&url.pathname!==route+"/")throw new AdminError("Admin page not found.",404);
  if(request.method==="POST"){const form=await readForm(request,env,user.id),action=form.get("action");if(action==="invoice"){const id=await createInvoice(db,parse(form,"invoice"),user.id);return page("Saved","",user.name,303,{Location:`${route}?id=${encodeURIComponent(id)}&saved=invoice`});}if(action==="issue"){const id=await issueInvoice(db,parse(form,"issue"),user.id);return page("Saved","",user.name,303,{Location:`${route}?id=${encodeURIComponent(id)}&saved=issue`});}if(action==="payment"){const id=await recordPayment(db,parse(form,"payment"),user.id);return page("Saved","",user.name,303,{Location:`${route}?id=${encodeURIComponent(id)}&saved=payment`});}throw new AdminError("Choose an invoice or payment action.");}
  const id=url.searchParams.get("id");if(id)return await detail(db,env,user,id,url.searchParams.get("saved")??"");if(url.searchParams.get("new")==="1")return await createView(db,env,user,url);return await list(db,user,url);
}catch(error){const known=error instanceof AdminError,invalid=error instanceof ZodError,message=known?error.message:invalid?error.issues.map((i)=>`${i.path.join(" ")}: ${i.message}`).join("; "):"Unable to complete this request. Please try again.",status=known?error.status:invalid?400:500;return page("Invoices",`<p class="notice" role="alert">${esc(message)}</p><p>Use your browser’s Back button to correct form values.</p><a href="${route}">Return to invoices</a>`,"",status,status===401&&localChallenge?{"WWW-Authenticate":'Basic realm="KargoDoor local admin", charset="UTF-8"'}:{});}}
