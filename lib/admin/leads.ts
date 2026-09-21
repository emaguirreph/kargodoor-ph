import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import { authenticate, AdminError, canMutateAdmin, checkCsrf, csrfToken, type AdminEnv } from "./security";
import { esc, page, pesos } from "./ui";

type Row = Record<string, unknown>;
const contacted = ["No", "Yes", "Follow-up Needed"] as const;
const methods = ["Not contacted", "Phone", "Viber", "WhatsApp", "Email"] as const;
const sales = ["New", "Contacted", "Quotation Sent", "Converted", "Closed"] as const;
const lifecycle = ["Active", "Inactive"] as const;
const select = (name: string, current: unknown, values: readonly string[]) => `<select name="${name}">${values.map(value => `<option${String(current) === value ? " selected" : ""}>${esc(value)}</option>`).join("")}</select>`;
const inlineSelect = (form: string, name: string, current: unknown, values: readonly string[], disabled: boolean) => `<select form="${esc(form)}" name="${name}"${disabled ? " disabled" : ""}>${values.map(value => `<option${String(current) === value ? " selected" : ""}>${esc(value)}</option>`).join("")}</select>`;

export async function leadsPage(request: Request, envOverride?: AdminEnv): Promise<Response> {
  try {
    const env = envOverride ?? ((await getCloudflareContext()).env as unknown as AdminEnv);
    const user = await authenticate(request, env);
    const db = env.ADMIN_DB, url = new URL(request.url), path = "/admin/leads";
    if (request.method === "POST") {
      if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
      const form = await request.formData();
      checkCsrf(env, user.id, path, String(form.get("csrf") ?? ""));
      const id = String(form.get("id") ?? ""), revision = String(form.get("revision") ?? ""), action = String(form.get("action") ?? "save");
      if (action === "archive") {
        if (!/^[\da-f-]{36}$/i.test(id) || !revision || form.get("confirm") !== "yes") throw new AdminError("Confirm the archive.");
        const now = new Date().toISOString();
        const result = await db.prepare("UPDATE leads SET archived_at=?, updated_at=? WHERE id=? AND updated_at=? AND archived_at IS NULL").bind(now, now, id, revision).run();
        if (!result.meta.changes) throw new AdminError("Another admin changed this lead. Reload it before archiving.", 409);
        return page("Lead archived", "", user.name, 303, { Location: path }, true);
      }
      const contactedStatus = String(form.get("contacted_status") ?? ""), contactMethod = String(form.get("contact_method") ?? ""), salesStatus = String(form.get("sales_status") ?? ""), leadStatus = String(form.get("lead_status") ?? "");
      const notes = String(form.get("notes") ?? "").trim();
      if (!/^[\da-f-]{36}$/i.test(id) || !revision || revision.length > 40 || !contacted.includes(contactedStatus as typeof contacted[number]) || !methods.includes(contactMethod as typeof methods[number]) || !sales.includes(salesStatus as typeof sales[number]) || !lifecycle.includes(leadStatus as typeof lifecycle[number]) || notes.length > 4000) throw new AdminError("Invalid lead update.");
      const now = new Date().toISOString();
      const result = await db.batch([
        db.prepare("INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,new_value,created_at) SELECT ?,?,'update','leads',?,?,? WHERE EXISTS (SELECT 1 FROM leads WHERE id=? AND updated_at=? AND archived_at IS NULL)").bind(randomUUID(), user.id, id, JSON.stringify({ contacted_status: contactedStatus, contact_method: contactMethod, sales_status: salesStatus, lead_status: leadStatus, notes }), now, id, revision),
        db.prepare("UPDATE leads SET contacted_status=?, contact_method=?, sales_status=?, lead_status=?, notes=?, updated_at=? WHERE id=? AND updated_at=? AND archived_at IS NULL").bind(contactedStatus, contactMethod, salesStatus, leadStatus, notes || null, now, id, revision),
      ]);
      if (!result.at(-1)?.meta.changes) throw new AdminError("Another admin changed this lead. Reload it before saving.", 409);
      return page("Saved", "", user.name, 303, { Location: `${path}?id=${encodeURIComponent(id)}&saved=1` }, true);
    }
    const id = url.searchParams.get("id") ?? "";
    if (id) {
      if (!/^[\da-f-]{36}$/i.test(id)) throw new AdminError("Invalid lead ID.");
      const lead = await db.prepare("SELECT * FROM leads WHERE id=?").bind(id).first<Row>();
      if (!lead) throw new AdminError("Lead not found.", 404);
      const density = lead.density_kg_cbm === null ? "—" : `${Number(lead.density_kg_cbm).toFixed(2)} kg/CBM`;
      if (url.searchParams.get("archive") === "1") return page("Archive lead", `<section><h2>Archive ${esc(lead.lead_code)}</h2><p>This removes the lead from normal lists but retains it for reference.</p><div class="actions"><form method="post"><input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, path))}"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="revision" value="${esc(lead.updated_at)}"><input type="hidden" name="action" value="archive"><input type="hidden" name="confirm" value="yes"><button>Archive lead</button></form><a class="button" href="${path}?id=${esc(id)}">Cancel</a></div></section>`, user.name, 200, {}, canMutateAdmin(user));
      return page("Lead", `<section><div class="actions"><a class="button" href="${path}">Back</a><a class="button" href="/admin/quotations?new=1&lead_id=${encodeURIComponent(id)}">Create Quotation</a>${lead.archived_at ? "" : `<a class="button" href="${path}?id=${esc(id)}&archive=1">Archive</a>`}</div>${lead.archived_at ? `<p class="notice">Archived ${esc(lead.archived_at)}</p>` : ""}${url.searchParams.get("saved") === "1" ? '<p class="notice">Changes saved.</p>' : ""}<dl><dt>Lead Code</dt><dd>${esc(lead.lead_code)}</dd><dt>Full Name</dt><dd>${esc(lead.full_name)}</dd><dt>Phone</dt><dd>${esc(lead.phone)}</dd><dt>Email</dt><dd>${esc(lead.email || "—")}</dd><dt>Service</dt><dd>${esc(lead.service_type)}</dd><dt>CBM</dt><dd>${esc(lead.cbm)}</dd><dt>Weight</dt><dd>${esc(lead.weight_kg)} kg</dd><dt>Density</dt><dd>${esc(density)}</dd><dt>Estimated Rate</dt><dd>${pesos(lead.estimated_rate)}</dd><dt>Source</dt><dd>${esc(lead.source)}</dd><dt>Consent</dt><dd>${Number(lead.consent) ? "Yes" : "No"}</dd><dt>Created At</dt><dd>${esc(lead.created_at)}</dd><dt>Updated At</dt><dd>${esc(lead.updated_at)}</dd></dl></section>${lead.archived_at ? "" : `<section><h2>Manage lead</h2><form method="post" class="grid"><input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, path))}"><input type="hidden" name="id" value="${esc(lead.id)}"><input type="hidden" name="revision" value="${esc(lead.updated_at)}"><label>Contacted${select("contacted_status", lead.contacted_status, contacted)}</label><label>Contact Method${select("contact_method", lead.contact_method, methods)}</label><label>Sales Status${select("sales_status", lead.sales_status, sales)}</label><label>Lead Status${select("lead_status", lead.lead_status, lifecycle)}</label><label class="wide">Notes<textarea name="notes" maxlength="4000">${esc(lead.notes || "")}</textarea></label><p class="wide actions"><button ${canMutateAdmin(user) ? "" : "disabled"}>Save changes</button></p></form></section>`}`, user.name, 200, {}, canMutateAdmin(user));
    }
    const q = (url.searchParams.get("q") ?? "").trim(), service = url.searchParams.get("service") ?? "", contactedStatus = url.searchParams.get("contacted_status") ?? "", salesStatus = url.searchParams.get("sales_status") ?? "", leadStatus = url.searchParams.get("lead_status") ?? "";
    if (q.length > 160 || !["", "Sea Freight", "Air Freight"].includes(service) || !["", ...contacted].includes(contactedStatus) || !["", ...sales].includes(salesStatus) || !["", ...lifecycle].includes(leadStatus)) throw new AdminError("Invalid lead filter.");
    const [rowsResult, count] = await Promise.all([
      db.prepare("SELECT * FROM leads WHERE archived_at IS NULL AND (?='' OR service_type=?) AND (?='' OR contacted_status=?) AND (?='' OR sales_status=?) AND (?='' OR lead_status=?) AND (?='' OR instr(lower(full_name),lower(?))>0 OR instr(phone,?)>0 OR instr(lower(COALESCE(email,'')),lower(?))>0) ORDER BY created_at DESC LIMIT 100").bind(service, service, contactedStatus, contactedStatus, salesStatus, salesStatus, leadStatus, leadStatus, q, q, q, q).all<Row>(),
      db.prepare("SELECT COUNT(*) AS total FROM leads WHERE archived_at IS NULL AND sales_status='New'").first<Row>(),
    ]);
    const rows = rowsResult.results;
    const canWrite = canMutateAdmin(user);
    const leadForms = rows.map(lead => `<form id="lead-${esc(lead.id)}" method="post"><input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, path))}"><input type="hidden" name="id" value="${esc(lead.id)}"><input type="hidden" name="revision" value="${esc(lead.updated_at)}"></form>`).join("");
    return page("Leads", `<style>.leads-table{padding-bottom:8px}.leads-table table{min-width:1600px}.leads-table th{white-space:nowrap}.leads-table td{min-width:110px}.leads-table td:first-child{min-width:150px}.leads-table td:nth-child(5){min-width:130px}.leads-table td:nth-child(11){min-width:220px}.leads-table select,.leads-table input{margin:0;padding:7px;min-width:110px}.leads-table button{padding:8px 12px;white-space:nowrap}</style><section><h2>Website calculator inquiries <span class="notice">New Leads: ${esc(count?.total ?? 0)}</span></h2><form method="get" class="search"><label>Search name, phone, or email<input name="q" value="${esc(q)}"></label><label>Service<select name="service"><option value="">All</option><option${service === "Sea Freight" ? " selected" : ""}>Sea Freight</option><option${service === "Air Freight" ? " selected" : ""}>Air Freight</option></select></label><label>Contacted<select name="contacted_status"><option value="">All</option>${contacted.map(x => `<option${contactedStatus === x ? " selected" : ""}>${x}</option>`).join("")}</select></label><label>Sales<select name="sales_status"><option value="">All</option>${sales.map(x => `<option${salesStatus === x ? " selected" : ""}>${x}</option>`).join("")}</select></label><label>Lead Status<select name="lead_status"><option value="">All</option>${lifecycle.map(x => `<option${leadStatus === x ? " selected" : ""}>${x}</option>`).join("")}</select></label><button>Filter</button><a href="${path}">Clear</a></form><p class="muted">Edit a row, then select Save. Scroll horizontally to view every lead field.</p>${leadForms}<div class="table leads-table"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Service</th><th>Cargo</th><th>Estimated Rate</th><th>Contacted</th><th>Contact Method</th><th>Sales</th><th>Lead Status</th><th>Notes</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows.map(lead => { const form = `lead-${String(lead.id)}`; return `<tr><td><a href="${path}?id=${esc(lead.id)}">${esc(lead.full_name)}</a><br><small>${esc(lead.lead_code)}</small></td><td>${esc(lead.phone)}</td><td>${esc(lead.email || "—")}</td><td>${esc(lead.service_type)}</td><td>${esc(lead.cbm)} CBM<br>${esc(lead.weight_kg)} kg${lead.density_kg_cbm === null ? "" : `<br>${Number(lead.density_kg_cbm).toFixed(2)} kg/CBM`}</td><td>${pesos(lead.estimated_rate)}</td><td>${inlineSelect(form, "contacted_status", lead.contacted_status, contacted, !canWrite)}</td><td>${inlineSelect(form, "contact_method", lead.contact_method, methods, !canWrite)}</td><td>${inlineSelect(form, "sales_status", lead.sales_status, sales, !canWrite)}</td><td>${inlineSelect(form, "lead_status", lead.lead_status, lifecycle, !canWrite)}</td><td><input form="${esc(form)}" name="notes" value="${esc(lead.notes || "")}" maxlength="4000"${canWrite ? "" : " disabled"}></td><td>${esc(lead.created_at)}</td><td><button form="${esc(form)}"${canWrite ? "" : " disabled"}>Save</button></td></tr>`; }).join("") || '<tr><td colspan="13">No leads found.</td></tr>'}</tbody></table></div></section>`, user.name, 200, {}, canWrite);
  } catch (error) {
    const err = error instanceof AdminError ? error : new AdminError("Leads are unavailable.", 500);
    return page("Leads", `<p class="notice">${esc(err.message)}</p>`, "", err.status);
  }
}
