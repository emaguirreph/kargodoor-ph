import { financeRange, shipmentBusinessDateSql, type FinanceRange } from "./finance-dates";
import type { D1Database } from "@cloudflare/workers-types";
import { AdminError, type AdminUser } from "./security";
import { randomUUID } from "node:crypto";
import type { RecordData } from "./validation";
import { page, esc, pesos, hidden } from "./ui";

export const marginSummarySql = `SELECT
 COUNT(*) AS shipments,
 COUNT(nihao_cost) AS costed,
 COALESCE(SUM(CASE WHEN nihao_cost IS NOT NULL THEN shipping_charge ELSE 0 END),0) AS charges,
 COALESCE(SUM(nihao_cost),0) AS costs,
 COALESCE(SUM(CASE WHEN nihao_cost IS NOT NULL THEN shipping_charge-nihao_cost ELSE 0 END),0) AS margin
 FROM shipments WHERE status != 'Cancelled'`;
// Reuse the original aggregate unchanged; add only a bound business-date restriction.
export async function freightSummary(db: D1Database, range: FinanceRange) {
  return await db.prepare(`SELECT CAST(shipments AS TEXT) AS shipments, CAST(costed AS TEXT) AS costed,
    CAST(charges AS TEXT) AS charges, CAST(costs AS TEXT) AS costs, CAST(margin AS TEXT) AS margin
    FROM (${marginSummarySql} AND (? = '' OR ${shipmentBusinessDateSql} >= ?)
      AND (? = '' OR ${shipmentBusinessDateSql} <= ?))`)
    .bind(range.from, range.from, range.to, range.to).first<RecordData>();
}
const cards = (items: [string, unknown][]) => `<div class="cards">${items.map(([label, value]) => `<div class="card">${esc(label)}<strong>${esc(value)}</strong></div>`).join("")}</div>`;
function pager(url: URL, number: number, more: boolean) {
  const link = (n: number) => {
    const params = new URLSearchParams(url.searchParams);
    params.set("page", String(n));
    return `${url.pathname}?${esc(params.toString())}`;
  };
  return `<div class="actions">${number > 1 ? `<a href="${link(number - 1)}">Previous</a>` : ""}<span>Page ${number}</span>${more ? `<a href="${link(number + 1)}">Next</a>` : ""}</div>`;
}
function filters(url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim();
  const number = Number(url.searchParams.get("page") ?? 1);
  if (q.length > 160 || !Number.isSafeInteger(number) || number < 1 || number > 100000)
    throw new AdminError("Invalid search or page.");
  return { q, number, offset: (number - 1) * 25 };
}
const recordLink = (type: unknown, id: unknown, label: unknown) =>
  ["customers", "shipments", "invoices"].includes(String(type))
    ? `<a href="/admin/${esc(type)}?id=${encodeURIComponent(String(id))}">${esc(label || id)}</a>`
    : esc(label || id);

type DashboardUser = Pick<AdminUser, "id" | "name" | "email" | "role">;

export async function saveStaffFollowUp(db: D1Database, note: string, user: DashboardUser) {
  if (note.length > 4000) throw new AdminError("Follow-up note must be 4,000 characters or fewer.");
  const existing = await db.prepare("SELECT note FROM staff_follow_up WHERE id = 1").first<RecordData>();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO staff_follow_up (id,note,updated_by_admin_user_id,created_at,updated_at)
      VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET note=excluded.note,
      updated_by_admin_user_id=excluded.updated_by_admin_user_id,updated_at=excluded.updated_at`)
      .bind(note, user.id, now, now),
    db.prepare(`INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      randomUUID(), user.id, existing ? "update" : "create", "staff_follow_up", "1",
      existing ? JSON.stringify({ note: existing.note }) : null, JSON.stringify({ note }), null, now,
    ),
  ]);
}

export async function dashboard(db: D1Database, user: DashboardUser, csrf: string, canWrite = true) {
  const summary = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM customers) AS customers,
    (SELECT COUNT(*) FROM shipments WHERE status NOT IN ('Delivered','Cancelled')) AS active,
    (SELECT COUNT(*) FROM invoices WHERE status IN ('Unpaid','Partial')) AS unpaid,
    (SELECT COALESCE(SUM(amount),0) FROM payments) AS payments`).first<RecordData>();
  const margin = await db.prepare(marginSummarySql).first<RecordData>();
  const recent = (await db.prepare(`SELECT s.id,s.tracking_number,c.full_name,s.status,s.updated_at
    FROM shipments s JOIN customers c ON c.id=s.customer_id ORDER BY s.updated_at DESC,s.id LIMIT 8`).all<RecordData>()).results;
  const [unpaid, missingCosts, followUp] = await Promise.all([
    db.prepare(`SELECT i.id,i.invoice_number,c.full_name,s.tracking_number,i.due_at,
      CAST(i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0) AS TEXT) AS balance
      FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN shipments s ON s.id=i.shipment_id
      WHERE i.status IN ('Unpaid','Partial') AND i.total > COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0)
      ORDER BY i.due_at IS NULL,i.due_at,i.created_at LIMIT 25`).all<RecordData>(),
    canWrite ? db.prepare(`SELECT s.id,s.tracking_number,c.full_name,s.status FROM shipments s
      JOIN customers c ON c.id=s.customer_id WHERE s.status NOT IN ('Delivered','Cancelled')
      AND s.nihao_cost IS NULL ORDER BY s.updated_at DESC,s.id LIMIT 25`).all<RecordData>() : Promise.resolve({ results: [] as RecordData[] }),
    db.prepare(`SELECT f.note,f.updated_at,u.name AS updater_name,u.email AS updater_email
      FROM staff_follow_up f JOIN admin_users u ON u.id=f.updated_by_admin_user_id WHERE f.id=1`).first<RecordData>(),
  ]);
  const unpaidRows = unpaid.results;
  const missingRows = missingCosts.results;
  const note = String(followUp?.note ?? "");
  const attention = unpaidRows.length || missingRows.length;
  return page("Dashboard", `
    ${canWrite ? '<div class="actions"><a class="button" href="/admin/customers?new=1">Add customer</a><a class="button" href="/admin/shipments?new=1">Add shipment</a><a class="button" href="/admin/invoices?new=1">Create invoice</a></div>' : '<p class="notice">Viewer access is read-only.</p>'}
    <p class="muted">Customer and shipment records for the new admin.${canWrite ? ' Public tracking is managed in the <a href="/admin/tracking-editor">tracking editor</a> during this phase.' : ""}</p>
    ${cards([["Total Customers",summary?.customers ?? 0],["Active Shipments",summary?.active ?? 0],["Unpaid Invoices",summary?.unpaid ?? 0],["Payments Received",pesos(summary?.payments)]])}
    <section><h2>Needs Attention</h2>${attention ? `
      ${unpaidRows.length ? `<h3>Unpaid invoices (${unpaidRows.length})</h3><div class="table"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Tracking</th><th>Remaining balance</th><th>Due date</th></tr></thead><tbody>${unpaidRows.map(r=>`<tr><td>${recordLink("invoices",r.id,r.invoice_number)}</td><td>${esc(r.full_name)}</td><td>${esc(r.tracking_number)}</td><td>${esc(pesos(r.balance))}</td><td>${esc(r.due_at || "—")}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${canWrite && missingRows.length ? `<h3>Shipments missing Nihao cost (${missingRows.length})</h3><div class="table"><table><thead><tr><th>Shipment</th><th>Customer</th><th>Status</th></tr></thead><tbody>${missingRows.map(r=>`<tr><td>${recordLink("shipments",r.id,r.tracking_number)}</td><td>${esc(r.full_name)}</td><td>${esc(r.status)}</td></tr>`).join("")}</tbody></table></div>` : ""}` : "<p>No items need attention.</p>"}</section>
    <section><h2>Staff Follow-up</h2>${note ? `<p style="white-space:pre-wrap">${esc(note)}</p><p class="muted">Last updated ${esc(followUp?.updated_at)} by ${esc(followUp?.updater_name || followUp?.updater_email)}</p>` : "<p>No follow-up note has been added.</p>"}${canWrite ? `<form action="/admin/dashboard" method="post"><input name="csrf" type="hidden" value="${esc(csrf)}"><label>Shared note<textarea name="note" maxlength="4000">${esc(note)}</textarea></label><div class="actions"><button>Save follow-up</button></div></form>` : ""}</section>
    ${canWrite ? `<section><h2>Freight margin</h2><p><strong>${esc(pesos(margin?.margin))}</strong> across ${esc(margin?.costed ?? 0)} shipments with Ni Hao cost entered.</p>
    <p>${Number(margin?.shipments ?? 0) - Number(margin?.costed ?? 0)} shipments still need a cost. Excludes cancelled shipments, delivery charges and business expenses.</p><a href="/admin/finance">Review charges and costs</a></section>` : ""}
    <section><h2>Recently updated shipments</h2>${recent.length ? `<div class="table"><table><thead><tr><th>Shipment</th><th>Customer</th><th>Status</th></tr></thead><tbody>${recent.map(r => `<tr><td>${recordLink("shipments", r.id, r.tracking_number)}</td><td>${esc(r.full_name)}</td><td>${esc(r.status)}</td></tr>`).join("")}</tbody></table></div>` : canWrite ? '<p>No shipments yet. <a href="/admin/customers?new=1">Add your first customer</a>, then create their shipment.</p>' : '<p>No shipments yet.</p>'}</section>
    <section><h2>Invoices and payments</h2><p>Review invoices, payments, and balances.</p><div class="actions"><a href="/admin/invoices">Review invoices</a>${canWrite ? '<a href="/admin/activity">Review activity log</a>' : ""}</div></section>`, user.name, 200, {}, canWrite);
}

export async function finance(db: D1Database, url: URL, user: string, canWrite = true) {
  const { q, number, offset } = filters(url);
  const missing = url.searchParams.get("missing") === "1";
  const range = financeRange(url);
  const total = await freightSummary(db, range);
  const rows = (await db.prepare(`SELECT s.id,s.tracking_number,c.full_name,s.status,s.shipping_charge,s.nihao_cost
    FROM shipments s JOIN customers c ON c.id=s.customer_id
    WHERE s.status != 'Cancelled' AND (instr(lower(s.tracking_number),lower(?))>0 OR instr(lower(c.full_name),lower(?))>0)
    AND (?=0 OR s.nihao_cost IS NULL)
    AND (? = '' OR COALESCE(NULLIF(s.warehouse_received_date, ''), date(s.created_at, '+8 hours')) >= ?)
    AND (? = '' OR COALESCE(NULLIF(s.warehouse_received_date, ''), date(s.created_at, '+8 hours')) <= ?) ORDER BY s.updated_at DESC,s.id LIMIT 26 OFFSET ?`)
    .bind(q,q,missing ? 1 : 0,range.from,range.from,range.to,range.to,offset).all<RecordData>()).results;
  return page("Freight margin", `
    <p><a href="/admin/finance">Finance Dashboard</a> · <a href="/admin/finance/expenses">Expenses</a></p>
    <p class="muted">${esc(range.from || "All dates")} through ${esc(range.to || "all dates")}. Shipment date: warehouse receipt, otherwise Philippine creation date.</p>
    ${cards([["Costed freight charges",pesos(total?.charges)],["Ni Hao freight costs",pesos(total?.costs)],["Freight margin",pesos(total?.margin)],["Costs still needed",Number(total?.shipments ?? 0)-Number(total?.costed ?? 0)]])}
    <p class="muted">Totals cover non-cancelled shipments in the selected date range with a recorded Ni Hao cost, regardless of the search below. Freight margin = KargoDoor freight charge − Ni Hao freight cost. Delivery charges and other expenses are excluded; this is not net income or cash received.</p>
    <section><form action="/admin/finance" method="get" class="search">${hidden("report", "freight")}${hidden("from", range.from)}${hidden("to", range.to)}<label>Search shipment or customer<input name="q" maxlength="160" value="${esc(q)}"></label><label>Cost status<select name="missing"><option value="0">All costs</option><option value="1"${missing ? " selected" : ""}>Cost not entered</option></select></label><button>Search</button><a href="/admin/finance?report=freight&amp;from=${esc(range.from)}&amp;to=${esc(range.to)}">Clear</a></form></section>
    <section>${rows.length ? `<div class="table"><table><thead><tr><th>Shipment / customer</th><th>Status</th><th>Freight charge</th><th>Ni Hao cost</th><th>Freight margin</th></tr></thead><tbody>${rows.slice(0,25).map(r => `<tr><td>${recordLink("shipments",r.id,r.tracking_number)}<br><span class="muted">${esc(r.full_name)}</span></td><td>${esc(r.status)}</td><td>${esc(pesos(r.shipping_charge))}</td><td>${r.nihao_cost === null ? "Not entered" : esc(pesos(r.nihao_cost))}</td><td>${r.nihao_cost === null ? "—" : esc(pesos(Number(r.shipping_charge)-Number(r.nihao_cost)))}</td></tr>`).join("")}</tbody></table></div>` : "<p>No matching shipments.</p>"}${pager(url,number,rows.length > 25)}</section>`, user, 200, {}, canWrite);
}

const fieldLabels: Record<string,string> = {nihao_cost:"Ni Hao freight cost",shipping_charge:"KargoDoor freight charge",delivery_charge:"Delivery charge",cbm:"CBM",weight_kg:"Weight (kg)"};
function changes(row: RecordData) {
  const before = JSON.parse(String(row.old_value ?? "{}")) ?? {};
  const after = JSON.parse(String(row.new_value ?? "{}")) ?? {};
  const keys = [...new Set([...Object.keys(before),...Object.keys(after)])].filter(k => !["id","created_at","updated_at"].includes(k) && before[k] !== after[k]);
  const value = (key: string, v: unknown) => v === null || v === undefined || v === "" ? "—" : ["nihao_cost","shipping_charge","delivery_charge"].includes(key) ? esc(pesos(v)) : esc(v);
  return `<details><summary>View ${keys.length} changed fields</summary><dl>${keys.map(k=>`<dt>${esc(fieldLabels[k] ?? k.replaceAll("_"," "))}</dt><dd>${value(k,before[k])} → ${value(k,after[k])}</dd>`).join("")}</dl></details>`;
}
export async function activity(db: D1Database, url: URL, user: string) {
  const {q,number,offset} = filters(url);
  const type = url.searchParams.get("entity_type") ?? "";
  const id = url.searchParams.get("entity_id") ?? "";
  if ((type && !["customers","shipments","invoices","payments"].includes(type)) || (id && !/^[\da-f-]{36}$/i.test(id))) throw new AdminError("Invalid activity filter.");
  const rows = (await db.prepare(`SELECT a.*,u.name AS admin_name,
    COALESCE(c.customer_code,s.tracking_number,i.invoice_number,pi.invoice_number,a.entity_id) AS record_label
    FROM activity_log a JOIN admin_users u ON u.id=a.admin_user_id
    LEFT JOIN customers c ON a.entity_type='customers' AND c.id=a.entity_id
    LEFT JOIN shipments s ON a.entity_type='shipments' AND s.id=a.entity_id
    LEFT JOIN invoices i ON a.entity_type='invoices' AND i.id=a.entity_id
    LEFT JOIN payments p ON a.entity_type='payments' AND p.id=a.entity_id
    LEFT JOIN invoices pi ON p.invoice_id=pi.id
    WHERE (?='' OR a.entity_type=?) AND (?='' OR a.entity_id=?)
    AND (instr(lower(u.name),lower(?))>0 OR instr(lower(a.action),lower(?))>0 OR instr(lower(COALESCE(c.customer_code,s.tracking_number,i.invoice_number,pi.invoice_number,a.entity_id)),lower(?))>0)
    ORDER BY a.created_at DESC,a.id LIMIT 26 OFFSET ?`).bind(type,type,id,id,q,q,q,offset).all<RecordData>()).results;
  return page("Activity log", `<p class="muted">Changes are recorded automatically. Activity records cannot be edited or deleted. Times are shown in UTC.</p>
    <section><form action="/admin/activity" method="get" class="search">${id ? hidden("entity_id",id) : ""}<label>Search code, admin or action<input name="q" maxlength="160" value="${esc(q)}"></label><label>Record type<select name="entity_type"><option value="">All records</option>${["customers","shipments","invoices","payments"].map(t=>`<option value="${t}"${type===t ? " selected" : ""}>${esc(t[0].toUpperCase()+t.slice(1))}</option>`).join("")}</select></label><button>Search</button><a href="/admin/activity">Clear</a></form></section>
    <section>${rows.length ? `<div class="table"><table><thead><tr><th>Date / admin</th><th>Record</th><th>Action / changes</th></tr></thead><tbody>${rows.slice(0,25).map(r=>`<tr><td><time>${esc(r.created_at)}</time><br>${esc(r.admin_name)}</td><td>${recordLink(r.entity_type,r.entity_id,r.record_label)}</td><td>${esc(String(r.action).replaceAll("_"," "))}${changes(r)}</td></tr>`).join("")}</tbody></table></div>` : "<p>No matching activity.</p>"}${pager(url,number,rows.length > 25)}</section>`,user);
}
