import { financeRange, philippineToday, shipmentBusinessDateSql, type FinanceRange } from "./finance-dates";
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
FROM shipments WHERE status != 'Cancelled' AND archived_at IS NULL`;

// Reuse the original aggregate unchanged; add only a bound business-date restriction.
export async function freightSummary(db: D1Database, range: FinanceRange) {
  return await db
    .prepare(
      `SELECT CAST(shipments AS TEXT) AS shipments, CAST(costed AS TEXT) AS costed,
      CAST(charges AS TEXT) AS charges, CAST(costs AS TEXT) AS costs, CAST(margin AS TEXT) AS margin
      FROM (${marginSummarySql} AND (? = '' OR ${shipmentBusinessDateSql} >= ?)
        AND (? = '' OR ${shipmentBusinessDateSql} <= ?))`,
    )
    .bind(range.from, range.from, range.to, range.to)
    .first<RecordData>();
}

const cards = (items: [string, unknown][]) =>
  `<div class="cards">${items
    .map(
      ([label, value]) =>
        `<div class="card">${esc(label)}<strong>${esc(value)}</strong></div>`,
    )
    .join("")}</div>`;

function pager(url: URL, number: number, more: boolean) {
  const link = (n: number) => {
    const params = new URLSearchParams(url.searchParams);
    params.set("page", String(n));
    return `${url.pathname}?${esc(params.toString())}`;
  };

  return `<div class="actions">${
    number > 1 ? `<a href="${link(number - 1)}">Previous</a>` : ""
  }<span>Page ${number}</span>${
    more ? `<a href="${link(number + 1)}">Next</a>` : ""
  }</div>`;
}

function filters(url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim();
  const number = Number(url.searchParams.get("page") ?? 1);

  if (
    q.length > 160 ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > 100000
  ) {
    throw new AdminError("Invalid search or page.");
  }

  return {
    q,
    number,
    offset: (number - 1) * 25,
  };
}

const recordLink = (type: unknown, id: unknown, label: unknown) =>
  ["customers", "shipments", "invoices"].includes(String(type))
    ? `<a href="/admin/${esc(type)}?id=${encodeURIComponent(
        String(id),
      )}">${esc(label || id)}</a>`
    : esc(label || id);

type DashboardUser = Pick<
  AdminUser,
  "id" | "name" | "email" | "role"
>;

export async function saveStaffFollowUp(
  db: D1Database,
  note: string,
  user: DashboardUser,
) {
  if (note.length > 4000) {
    throw new AdminError(
      "Follow-up note must be 4,000 characters or fewer.",
    );
  }

  const existing = await db
    .prepare("SELECT note FROM staff_follow_up WHERE id = 1")
    .first<RecordData>();

  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `INSERT INTO staff_follow_up (id,note,updated_by_admin_user_id,created_at,updated_at)
        VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET note=excluded.note,
        updated_by_admin_user_id=excluded.updated_by_admin_user_id,updated_at=excluded.updated_at`,
      )
      .bind(note, user.id, now, now),

    db
      .prepare(
        `INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        randomUUID(),
        user.id,
        existing ? "update" : "create",
        "staff_follow_up",
        "1",
        existing ? JSON.stringify({ note: existing.note }) : null,
        JSON.stringify({ note }),
        null,
        now,
      ),
  ]);
}

export async function dashboard(
  db: D1Database,
  user: DashboardUser,
  csrf: string,
  canWrite = true,
) {
  const today = philippineToday();
  const summary = await db
    .prepare(
      `SELECT
      (SELECT COUNT(*) FROM shipments WHERE status NOT IN ('Delivered','Cancelled') AND archived_at IS NULL) AS active,
      (SELECT COUNT(*) FROM leads WHERE archived_at IS NULL AND contacted_status='No') AS new_leads,
      (SELECT COUNT(*) FROM shipments WHERE nihao_cost_source='estimate' AND status != 'Cancelled' AND archived_at IS NULL) AS estimated_costs,
      (SELECT COUNT(*) FROM shipments WHERE status IN ('Malabon Warehouse','Ready for Release') AND archived_at IS NULL) AS at_malabon`,
    )
    .first<RecordData>();

  // Issued invoices the customer has not fully paid yet.
  const unpaid = await db
    .prepare(
      `SELECT
        COUNT(*) AS n,
        COALESCE(SUM(CASE WHEN due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END), 0) AS overdue,
        CAST(COALESCE(SUM(balance), 0) AS TEXT) AS amount
      FROM (
        SELECT
          i.due_at,
          i.total + i.other_charge - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS balance
        FROM invoices i
        WHERE i.status NOT IN ('Draft','Void')
          AND i.archived_at IS NULL
      )
      WHERE balance > 0`,
    )
    .bind(today)
    .first<{ n: number; overdue: number; amount: string }>();

  const statusCounts = new Map(
    (
      await db
        .prepare(
          `SELECT status, COUNT(*) AS n FROM shipments
          WHERE archived_at IS NULL AND status != 'Cancelled'
          GROUP BY status`,
        )
        .all<{ status: string; n: number }>()
    ).results.map((row) => [row.status, Number(row.n)]),
  );

  const { readSimpleSummary, financePesos } = await import("./finance-summary");
  const { niHaoExpenseCategory } = await import("./nihao-payment");
  const simple = await readSimpleSummary(db);

  // Recently updated shipments with where the money stands on each, like the shipment page.
  const recent = (
    await db
      .prepare(
        `SELECT s.id,s.tracking_number,c.full_name,s.status,
          (SELECT i.total + i.other_charge FROM invoices i
            WHERE i.shipment_id=s.id AND i.status != 'Void' AND i.archived_at IS NULL
            ORDER BY i.created_at DESC LIMIT 1) AS invoice_total,
          (SELECT i.status FROM invoices i
            WHERE i.shipment_id=s.id AND i.status != 'Void' AND i.archived_at IS NULL
            ORDER BY i.created_at DESC LIMIT 1) AS invoice_status,
          (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN invoices i ON i.id=p.invoice_id
            WHERE i.shipment_id=s.id AND i.status != 'Void' AND i.archived_at IS NULL) AS customer_paid,
          EXISTS (SELECT 1 FROM expenses e WHERE e.category=? AND s.tracking_number IS NOT NULL
            AND e.tracking_number = s.tracking_number COLLATE NOCASE) AS nihao_paid
        FROM shipments s
        JOIN customers c ON c.id=s.customer_id
        WHERE s.archived_at IS NULL
        ORDER BY s.updated_at DESC,s.id
        LIMIT 6`,
      )
      .bind(niHaoExpenseCategory)
      .all<RecordData>()
  ).results;

  const followUp = await db
    .prepare(
      `SELECT f.note,f.updated_at,u.name AS updater_name,u.email AS updater_email
      FROM staff_follow_up f
      JOIN admin_users u ON u.id=f.updated_by_admin_user_id
      WHERE f.id=1`,
    )
    .first<RecordData>();

  const note = String(followUp?.note ?? "");

  const pill = (tone: string, text: string) =>
    `<span class="k-pill" data-k="${tone}">${esc(text)}</span>`;
  const customerPaidPill = (row: RecordData) => {
    const total = Number(row.invoice_total ?? 0);
    const paid = Number(row.customer_paid ?? 0);
    if (row.invoice_status === "Paid" || (total > 0 && paid >= total)) return pill("green", "Paid");
    if (paid > 0) return pill("amber", "Partly paid");
    return pill("red", "Not paid");
  };

  const count = (value: unknown) => Number(value ?? 0);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const statusLink = (status: string) =>
    `/admin/shipments?status=${encodeURIComponent(status)}`;

  // Shipments still missing Ni Hao's actual cost: no cost at all, or only the estimate.
  const needCost = simple.goingOutUnknown + count(summary?.estimated_costs);

  const attention = [
    {
      show: count(summary?.new_leads) > 0,
      label: `${plural(count(summary?.new_leads), "new lead", "new leads")} to contact`,
      detail: "Reply and send a quotation.",
      href: "/admin/leads",
      action: "Open Leads",
    },
    {
      show: simple.unbilled.results.length > 0,
      label: `${plural(simple.unbilled.results.length, "shipment", "shipments")} to bill · ${financePesos(simple.unbilledTotal)}`,
      detail: "Not sent to the customer yet. Check the draft invoice and send it.",
      href: "/admin/finance#finance-unbilled",
      action: "Open list",
    },
    {
      show: count(unpaid?.n) > 0,
      label: `${plural(count(unpaid?.n), "invoice", "invoices")} not fully paid · ${financePesos(BigInt(unpaid?.amount ?? "0"))}`,
      detail: count(unpaid?.overdue) > 0
        ? `${plural(count(unpaid?.overdue), "is", "are")} past the due date. Follow up with the customer.`
        : "Waiting for the customer to pay.",
      warn: count(unpaid?.overdue) > 0,
      href: "/admin/invoices",
      action: "Open Invoices",
    },
    {
      show: simple.goingOut > BigInt(0),
      label: `Ni Hao to pay · ${financePesos(simple.goingOut)}`,
      detail: "Use Mark Ni Hao paid in Edit shipment › Ni Hao tab.",
      warn: true,
      href: "/admin/finance#finance-nihao",
      action: "Open list",
    },
    {
      show: needCost > 0,
      label: `${plural(needCost, "shipment needs", "shipments need")} Ni Hao's actual cost`,
      detail: simple.goingOutUnknown > 0
        ? `${simple.goingOutUnknown} with no cost yet, so profit is not correct. Add it in Edit shipment.`
        : "Estimate only. Add Ni Hao's actual cost in Edit shipment once they send it.",
      warn: simple.goingOutUnknown > 0,
      href: "/admin/shipments",
      action: "Open Shipments",
    },
    {
      show: count(summary?.at_malabon) > 0,
      label: `${plural(count(summary?.at_malabon), "shipment", "shipments")} at Malabon waiting for delivery`,
      detail: "Arrange release or delivery to the customer.",
      href: statusLink("Malabon Warehouse"),
      action: "View",
    },
  ].filter((item) => item.show);

  const pipeline = [
    { label: "Waiting in China", statuses: ["Awaiting Supplier Dispatch", "Pending Warehouse Receipt", "China Warehouse", "Received at Warehouse", "China Port"] },
    { label: "On the way", statuses: ["Sea Transit", "Air Transit", "In Transit"] },
    { label: "Arrived in PH", statuses: ["Manila Port", "Gatepass", "Arrived in Philippines"] },
    { label: "At Malabon", statuses: ["Malabon Warehouse", "Ready for Release"] },
    { label: "Delivered", statuses: ["Delivered"] },
  ].map((stage) => {
    const parts = stage.statuses
      .map((status) => ({ status, n: statusCounts.get(status) ?? 0 }))
      .filter((part) => part.n > 0);
    return {
      label: stage.label,
      total: parts.reduce((sum, part) => sum + part.n, 0),
      parts,
      href: statusLink(parts[0]?.status ?? stage.statuses[0]),
    };
  });

  const noteEditor = canWrite
    ? `<details class="team-note-editor">
        <summary>Edit note</summary>
        <form action="/admin/dashboard" method="post">
          <input name="csrf" type="hidden" value="${esc(csrf)}">
          <label>
            Team note
            <textarea name="note" maxlength="4000" placeholder="An announcement, reminder, urgent note or task for the team...">${esc(note)}</textarea>
          </label>
          <div class="actions"><button>Save note</button></div>
        </form>
      </details>`
    : "";

  return page(
    "Dashboard",
    `
      <style>
        .dashboard-topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:16px}
        .dashboard-date{margin:0;color:#64748b}
        .dashboard-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px}
        .dashboard-actions .button{white-space:nowrap}
        .team-note{display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px 12px;background:#fffbe6;border:1px solid #f0d77a;border-radius:12px;padding:12px 16px;margin-bottom:16px}
        .team-note-body{flex:1 1 300px;min-width:0}
        .team-note-text{margin:0;white-space:pre-wrap;font-weight:600;color:#8a4b00}
        .team-note-body .muted{margin:2px 0 0;font-size:.82rem}
        .team-note-editor{flex:0 0 auto}
        .team-note-editor summary{cursor:pointer;color:#0753ad;font-weight:700;list-style:none}
        .team-note-editor summary::-webkit-details-marker{display:none}
        .team-note-editor[open]{flex:1 1 100%}
        .team-note-editor[open] summary{margin-bottom:8px}
        .team-note-editor textarea{min-height:100px}
        .dashboard-panel{background:#fff;border:1px solid #dbe5ec;border-radius:12px;padding:20px;min-width:0;margin-bottom:16px}
        .dashboard-panel-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}
        .dashboard-panel-header h2{margin:0}
        .dashboard-panel .panel-link{white-space:nowrap;font-weight:600}
        .dashboard-panel .table{margin-top:14px}
        .dashboard-panel table{margin-bottom:0}
        .dashboard-panel th,.dashboard-panel td{vertical-align:middle}
        .status-pill{display:inline-block;border-radius:999px;padding:3px 8px;background:#eef4f8;font-size:.78rem;white-space:nowrap}
        .dashboard-attention{padding:16px 20px}
        .dashboard-attention .dashboard-panel-header{margin-bottom:10px}
        .attention-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;margin-left:6px;border-radius:999px;background:#e5383b;color:#fff;font-size:.8rem;vertical-align:middle}
        .attention-list{list-style:none;margin:0;padding:0;display:grid;gap:4px}
        .attention-list a{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;border-left:3px solid #1356c9;background:#f8fbfd;color:#0b1f45;text-decoration:none;min-width:0}
        .attention-list a:hover{background:#eef4ff}
        .attention-list li.attention-warn a{border-left-color:#c62828;background:#fff6f6}
        .attention-list li.attention-warn a:hover{background:#ffecec}
        .attention-list strong{flex:0 0 auto;font-size:.95rem}
        .attention-detail{flex:1 1 auto;min-width:0;color:#64748b;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .attention-go{flex:0 0 auto;margin-left:auto;color:#1356c9;font-weight:700;font-size:.85rem;white-space:nowrap}
        .money-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        .money-card{border:1px solid #dbe5ec;border-top:4px solid #1356c9;border-radius:10px;padding:14px 16px;min-width:0}
        .money-card.money-have{border-top-color:#2e7d32}
        .money-card.money-out{border-top-color:#c62828}
        .money-card span{display:block;color:#64748b;font-size:.88rem}
        .money-card strong{display:block;color:#154876;font-size:1.5rem;line-height:1.2;margin-top:4px;overflow-wrap:anywhere}
        .dashboard-pipeline{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
        .pipeline-stage{display:block;background:#fff;border:1px solid #dbe5ec;border-radius:12px;padding:14px;min-width:0;text-decoration:none;color:inherit}
        .pipeline-stage:hover{border-color:#1356c9}
        .pipeline-stage span{display:block;color:#64748b;font-size:.88rem;margin-bottom:6px}
        .pipeline-stage strong{display:block;color:#154876;font-size:1.5rem;line-height:1.1}
        .pipeline-stage small{display:block;color:#64748b;margin-top:6px;font-size:.78rem}
        @media(max-width:1000px){.dashboard-pipeline{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:760px){
          .dashboard-topbar{flex-direction:column;align-items:stretch}
          .dashboard-actions{justify-content:flex-start}
          .money-cards{grid-template-columns:1fr}
          .dashboard-pipeline{grid-template-columns:1fr 1fr}
          .attention-detail{display:none}
          .attention-list strong{flex:1 1 auto;white-space:normal}
        }
        @media(max-width:480px){.dashboard-pipeline{grid-template-columns:1fr}}
      </style>

      <div class="dashboard-topbar">
        <p class="dashboard-date">Welcome back, ${esc(user.name)}.</p>
        ${
          canWrite
            ? `<div class="dashboard-actions">
                <a class="button" href="/admin/quotations?new=1">+ New Quotation</a>
                <a class="button" href="/admin/shipments?new=1">+ Add Shipment</a>
              </div>`
            : ""
        }
      </div>

      <div class="team-note">
        <div class="team-note-body">
          ${
            note
              ? `<p class="team-note-text">📌 ${esc(note)}</p>
                 <p class="muted">Updated ${esc(followUp?.updated_at || "—")} by ${esc(followUp?.updater_name || followUp?.updater_email || "—")}</p>`
              : `<p class="muted" style="margin:0">📌 <strong>Team note:</strong> No note yet.</p>`
          }
        </div>
        ${noteEditor}
      </div>

      <section class="dashboard-panel dashboard-attention">
        <div class="dashboard-panel-header">
          <h2>Needs Attention${attention.length ? `<span class="attention-count">${attention.length}</span>` : ""}</h2>
        </div>
        ${
          attention.length
            ? `<ul class="attention-list">${attention
                .map(
                  (item) => `
                    <li class="${"warn" in item && item.warn ? "attention-warn" : ""}">
                      <a href="${esc(item.href)}" title="${esc(item.detail)}">
                        <strong>${esc(item.label)}</strong>
                        <span class="attention-detail">${esc(item.detail)}</span>
                        <span class="attention-go">${esc(item.action)} ›</span>
                      </a>
                    </li>`,
                )
                .join("")}</ul>`
            : `<p class="muted">All caught up. Nothing needs action right now.</p>`
        }
      </section>

      <section class="dashboard-panel dashboard-money">
        <div class="dashboard-panel-header">
          <h2>Money</h2>
          <a class="panel-link" href="/admin/finance">Open Money Today →</a>
        </div>
        <div class="money-cards">
          <div class="money-card money-have">
            <span>Money we have now</span>
            <strong>${esc(financePesos(simple.cash))}</strong>
          </div>
          <div class="money-card">
            <span>Coming in from customers</span>
            <strong>${esc(financePesos(simple.comingIn))}</strong>
          </div>
          <div class="money-card money-out">
            <span>Going out to Ni Hao</span>
            <strong>${esc(financePesos(simple.goingOut))}</strong>
          </div>
        </div>
      </section>

      <section class="dashboard-panel dashboard-shipments">
        <div class="dashboard-panel-header">
          <h2>Shipments · ${esc(count(summary?.active))} active</h2>
          <a class="panel-link" href="/admin/shipments">All shipments →</a>
        </div>

        <div class="dashboard-pipeline">
          ${pipeline
            .map(
              (stage) => `
                <a class="pipeline-stage" href="${esc(stage.href)}">
                  <span>${esc(stage.label)}</span>
                  <strong>${esc(stage.total)}</strong>
                  <small>${stage.parts.length ? esc(stage.parts.map((part) => `${part.n} ${part.status}`).join(" · ")) : "None"}</small>
                </a>`,
            )
            .join("")}
        </div>

        ${
          recent.length
            ? `<div class="table">
                <table>
                  <thead>
                    <tr>
                      <th>Recently updated</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Customer paid</th>
                      <th>Ni Hao paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recent
                      .map(
                        (r) => `
                          <tr>
                            <td>${recordLink("shipments", r.id, r.tracking_number)}</td>
                            <td>${esc(r.full_name)}</td>
                            <td><span class="status-pill">${esc(r.status)}</span></td>
                            <td>${customerPaidPill(r)}</td>
                            <td>${Number(r.nihao_paid) ? pill("green", "Paid") : pill("red", "Not paid")}</td>
                          </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : `<p class="muted">No shipments yet.</p>`
        }
      </section>
    `,
    user.name,
    200,
    {},
    canWrite,
  );
}

export async function finance(
  db: D1Database,
  url: URL,
  user: string,
  canWrite = true,
) {
  const { q, number, offset } = filters(url);
  const missing = url.searchParams.get("missing") === "1";
  const range = financeRange(url);

  const total = await freightSummary(db, range);

  const rows = (
    await db
      .prepare(
        `SELECT s.id,s.tracking_number,c.full_name,s.status,s.shipping_charge,s.nihao_cost
        FROM shipments s
        JOIN customers c ON c.id=s.customer_id
        WHERE s.status != 'Cancelled'
          AND s.archived_at IS NULL
        AND (
          instr(lower(s.tracking_number),lower(?))>0
          OR instr(lower(c.full_name),lower(?))>0
        )
        AND (?=0 OR s.nihao_cost IS NULL)
        AND (
          ? = ''
          OR COALESCE(
            NULLIF(s.warehouse_received_date, ''),
            date(s.created_at, '+8 hours')
          ) >= ?
        )
        AND (
          ? = ''
          OR COALESCE(
            NULLIF(s.warehouse_received_date, ''),
            date(s.created_at, '+8 hours')
          ) <= ?
        )
        ORDER BY s.updated_at DESC,s.id
        LIMIT 26 OFFSET ?`,
      )
      .bind(
        q,
        q,
        missing ? 1 : 0,
        range.from,
        range.from,
        range.to,
        range.to,
        offset,
      )
      .all<RecordData>()
  ).results;

  return page(
    "Freight margin",
    `
      <p>
        <a href="/admin/finance">
          Finance Dashboard
        </a>
        ·
        <a href="/admin/finance/expenses">
          Expenses
        </a>
      </p>

      <p class="muted">
        ${esc(range.from || "All dates")}
        through
        ${esc(range.to || "all dates")}.
        Shipment date: warehouse receipt,
        otherwise Philippine creation date.
      </p>

      ${cards([
        [
          "Costed freight charges",
          pesos(total?.charges),
        ],
        [
          "Ni Hao freight costs",
          pesos(total?.costs),
        ],
        [
          "Freight margin",
          pesos(total?.margin),
        ],
        [
          "Costs still needed",
          Number(total?.shipments ?? 0) -
            Number(total?.costed ?? 0),
        ],
      ])}

      <p class="muted">
        Totals cover non-cancelled shipments in the
        selected date range with a recorded Ni Hao cost,
        regardless of the search below.
        Freight margin = KargoDoor freight charge − Ni Hao freight cost.
        Delivery charges and other expenses are excluded;
        this is not net income or cash received.
      </p>

      <section>
        <form
          action="/admin/finance"
          method="get"
          class="search"
        >
          ${hidden("report", "freight")}
          ${hidden("from", range.from)}
          ${hidden("to", range.to)}

          <label>
            Search shipment or customer
            <input
              name="q"
              maxlength="160"
              value="${esc(q)}"
            >
          </label>

          <label>
            Cost status
            <select name="missing">
              <option value="0">
                All costs
              </option>

              <option
                value="1"${
                  missing ? " selected" : ""
                }
              >
                Cost not entered
              </option>
            </select>
          </label>

          <button>
            Search
          </button>

          <a href="/admin/finance?report=freight&amp;from=${esc(
            range.from,
          )}&amp;to=${esc(range.to)}">
            Clear
          </a>
        </form>
      </section>

      <section>
        ${
          rows.length
            ? `<div class="table">
                 <table>
                   <thead>
                     <tr>
                       <th>
                         Shipment / customer
                       </th>
                       <th>Status</th>
                       <th>Freight charge</th>
                       <th>Ni Hao cost</th>
                       <th>Freight margin</th>
                     </tr>
                   </thead>

                   <tbody>
                     ${rows
                       .slice(0, 25)
                       .map(
                         (r) => `
                           <tr>
                             <td>
                               ${recordLink(
                                 "shipments",
                                 r.id,
                                 r.tracking_number,
                               )}
                               <br>
                               <span class="muted">
                                 ${esc(r.full_name)}
                               </span>
                             </td>

                             <td>
                               ${esc(r.status)}
                             </td>

                             <td>
                               ${esc(
                                 pesos(
                                   r.shipping_charge,
                                 ),
                               )}
                             </td>

                             <td>
                               ${
                                 r.nihao_cost === null
                                   ? "Not entered"
                                   : esc(
                                       pesos(
                                         r.nihao_cost,
                                       ),
                                     )
                               }
                             </td>

                             <td>
                               ${
                                 r.nihao_cost === null
                                   ? "—"
                                   : esc(
                                       pesos(
                                         Number(
                                           r.shipping_charge,
                                         ) -
                                           Number(
                                             r.nihao_cost,
                                           ),
                                       ),
                                     )
                               }
                             </td>
                           </tr>
                         `,
                       )
                       .join("")}
                   </tbody>
                 </table>
               </div>`
            : `<p>No matching shipments.</p>`
        }

        ${pager(
          url,
          number,
          rows.length > 25,
        )}
      </section>
    `,
    user,
    200,
    {},
    canWrite,
  );
}

const fieldLabels: Record<string, string> = {
  nihao_cost: "Ni Hao freight cost",
  shipping_charge: "KargoDoor freight charge",
  delivery_charge: "Delivery charge",
  cbm: "CBM",
  weight_kg: "Weight (kg)",
};

function changes(row: RecordData) {
  const before =
    JSON.parse(
      String(row.old_value ?? "{}"),
    ) ?? {};

  const after =
    JSON.parse(
      String(row.new_value ?? "{}"),
    ) ?? {};

  const keys = [
    ...new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ]),
  ].filter(
    (k) =>
      ![
        "id",
        "created_at",
        "updated_at",
      ].includes(k) &&
      before[k] !== after[k],
  );

  const value = (
    key: string,
    v: unknown,
  ) =>
    v === null ||
    v === undefined ||
    v === ""
      ? "—"
      : [
            "nihao_cost",
            "shipping_charge",
            "delivery_charge",
          ].includes(key)
        ? esc(pesos(v))
        : esc(v);

  return `<details>
    <summary>
      View ${keys.length} changed fields
    </summary>

    <dl>
      ${keys
        .map(
          (k) =>
            `<dt>
               ${esc(
                 fieldLabels[k] ??
                   k.replaceAll(
                     "_",
                     " ",
                   ),
               )}
             </dt>
             <dd>
               ${value(
                 k,
                 before[k],
               )}
               →
               ${value(
                 k,
                 after[k],
               )}
             </dd>`,
        )
        .join("")}
    </dl>
  </details>`;
}

export async function activity(
  db: D1Database,
  url: URL,
  user: string,
) {
  const {
    q,
    number,
    offset,
  } = filters(url);

  const type =
    url.searchParams.get(
      "entity_type",
    ) ?? "";

  const id =
    url.searchParams.get(
      "entity_id",
    ) ?? "";

  if (
    (type &&
      ![
        "customers",
        "shipments",
        "invoices",
        "payments",
      ].includes(type)) ||
    (id &&
      !/^[\da-f-]{36}$/i.test(id))
  ) {
    throw new AdminError(
      "Invalid activity filter.",
    );
  }

  const rows = (
    await db
      .prepare(
        `SELECT a.*,u.name AS admin_name,
        COALESCE(c.customer_code,s.tracking_number,i.invoice_number,pi.invoice_number,a.entity_id) AS record_label
        FROM activity_log a
        JOIN admin_users u
          ON u.id=a.admin_user_id
        LEFT JOIN customers c
          ON a.entity_type='customers'
          AND c.id=a.entity_id
        LEFT JOIN shipments s
          ON a.entity_type='shipments'
          AND s.id=a.entity_id
        LEFT JOIN invoices i
          ON a.entity_type='invoices'
          AND i.id=a.entity_id
        LEFT JOIN payments p
          ON a.entity_type='payments'
          AND p.id=a.entity_id
        LEFT JOIN invoices pi
          ON p.invoice_id=pi.id
        WHERE
          (?='' OR a.entity_type=?)
          AND (?='' OR a.entity_id=?)
          AND (
            instr(lower(u.name),lower(?))>0
            OR instr(lower(a.action),lower(?))>0
            OR instr(
              lower(
                COALESCE(
                  c.customer_code,
                  s.tracking_number,
                  i.invoice_number,
                  pi.invoice_number,
                  a.entity_id
                )
              ),
              lower(?)
            )>0
          )
        ORDER BY a.created_at DESC,a.id
        LIMIT 26 OFFSET ?`,
      )
      .bind(
        type,
        type,
        id,
        id,
        q,
        q,
        q,
        offset,
      )
      .all<RecordData>()
  ).results;

  return page(
    "Activity log",
    `
      <p class="muted">
        Changes are recorded automatically.
        Activity records cannot be edited or deleted.
        Times are shown in UTC.
      </p>

      <section>
        <form
          action="/admin/activity"
          method="get"
          class="search"
        >
          ${
            id
              ? hidden(
                  "entity_id",
                  id,
                )
              : ""
          }

          <label>
            Search code, admin or action
            <input
              name="q"
              maxlength="160"
              value="${esc(q)}"
            >
          </label>

          <label>
            Record type
            <select name="entity_type">
              <option value="">
                All records
              </option>

              ${[
                "customers",
                "shipments",
                "invoices",
                "payments",
              ]
                .map(
                  (t) =>
                    `<option
                       value="${t}"${
                         type === t
                           ? " selected"
                           : ""
                       }
                     >
                       ${esc(
                         t[0].toUpperCase() +
                           t.slice(1),
                       )}
                     </option>`,
                )
                .join("")}
            </select>
          </label>

          <button>
            Search
          </button>

          <a href="/admin/activity">
            Clear
          </a>
        </form>
      </section>

      <section>
        ${
          rows.length
            ? `<div class="table">
                 <table>
                   <thead>
                     <tr>
                       <th>Date / admin</th>
                       <th>Record</th>
                       <th>Action / changes</th>
                     </tr>
                   </thead>

                   <tbody>
                     ${rows
                       .slice(0, 25)
                       .map(
                         (r) => `
                           <tr>
                             <td>
                               <time>
                                 ${esc(
                                   r.created_at,
                                 )}
                               </time>
                               <br>
                               ${esc(
                                 r.admin_name,
                               )}
                             </td>

                             <td>
                               ${recordLink(
                                 r.entity_type,
                                 r.entity_id,
                                 r.record_label,
                               )}
                             </td>

                             <td>
                               ${esc(
                                 String(
                                   r.action,
                                 ).replaceAll(
                                   "_",
                                   " ",
                                 ),
                               )}
                               ${changes(r)}
                             </td>
                           </tr>
                         `,
                       )
                       .join("")}
                   </tbody>
                 </table>
               </div>`
            : `<p>
                 No matching activity.
               </p>`
        }

        ${pager(
          url,
          number,
          rows.length > 25,
        )}
      </section>
    `,
    user,
  );
}
