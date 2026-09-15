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
  const summary = await db
    .prepare(
      `SELECT
      (SELECT COUNT(*) FROM customers) AS customers,
      (SELECT COUNT(*) FROM shipments WHERE status NOT IN ('Delivered','Cancelled')) AS active,
      (SELECT COUNT(*) FROM invoices WHERE status IN ('Unpaid','Partial')) AS unpaid,
      (SELECT COALESCE(SUM(amount),0) FROM payments) AS payments`,
    )
    .first<RecordData>();

  const margin = await db
    .prepare(marginSummarySql)
    .first<RecordData>();

  const recent = (
    await db
      .prepare(
        `SELECT s.id,s.tracking_number,c.full_name,s.status,s.updated_at
        FROM shipments s
        JOIN customers c ON c.id=s.customer_id
        ORDER BY s.updated_at DESC,s.id
        LIMIT 6`,
      )
      .all<RecordData>()
  ).results;

  const [followUp, recentInvoices] = await Promise.all([
    db
      .prepare(
        `SELECT f.note,f.updated_at,u.name AS updater_name,u.email AS updater_email
        FROM staff_follow_up f
        JOIN admin_users u ON u.id=f.updated_by_admin_user_id
        WHERE f.id=1`,
      )
      .first<RecordData>(),

    db
      .prepare(
        `SELECT
          i.id,
          i.invoice_number,
          i.total,
          i.status,
          i.created_at,
          c.full_name,
          COALESCE(
            (SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),
            0
          ) AS paid_amount
        FROM invoices i
        JOIN customers c ON c.id=i.customer_id
        ORDER BY i.created_at DESC,i.id
        LIMIT 6`,
      )
      .all<RecordData>(),
  ]);

  const note = String(followUp?.note ?? "");
  const invoiceRows = recentInvoices.results;

  const invoiceStatus = (row: RecordData) => {
    const total = Number(row.total ?? 0);
    const paid = Number(row.paid_amount ?? 0);

    if (total > 0 && paid >= total) return "Paid";
    if (paid > 0) return "Partial";
    return String(row.status || "Unpaid");
  };

  return page(
    "Dashboard",
    `
      <style>
        .dashboard-topbar{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:20px;
          margin-bottom:22px
        }
        .dashboard-date{
          margin:0;
          color:#64748b
        }
        .dashboard-actions{
          display:flex;
          flex-wrap:wrap;
          justify-content:flex-end;
          gap:10px
        }
        .dashboard-actions .button{
          white-space:nowrap
        }
        .dashboard-heading{
          margin:8px 0 12px
        }
        .dashboard-snapshot{
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:14px;
          margin-bottom:22px
        }
        .dashboard-stat{
          background:#fff;
          border:1px solid #dbe5ec;
          border-radius:12px;
          padding:18px;
          min-width:0
        }
        .dashboard-stat span{
          display:block;
          color:#64748b;
          font-size:.88rem;
          margin-bottom:8px
        }
        .dashboard-stat strong{
          display:block;
          color:#154876;
          font-size:1.55rem;
          line-height:1.1;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis
        }
        .dashboard-middle{
          display:grid;
          grid-template-columns:minmax(0,1.7fr) minmax(280px,.8fr);
          gap:20px;
          margin-bottom:20px
        }
        .dashboard-panel{
          background:#fff;
          border:1px solid #dbe5ec;
          border-radius:12px;
          padding:22px;
          min-width:0
        }
        .dashboard-panel-header{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          margin-bottom:16px
        }
        .dashboard-panel-header h2{
          margin:0
        }
        .communication-note{
          border:1px solid #dbe5ec;
          border-radius:10px;
          padding:18px;
          background:#f8fbfd;
          min-height:130px
        }
        .communication-note p{
          margin-top:0
        }
        .communication-note-text{
          white-space:pre-wrap;
          font-size:16px;
          line-height:1.55;
          font-weight:600;
          color:#B45309
        }
        .communication-badge{
          display:inline-block;
          padding:4px 9px;
          border-radius:999px;
          background:#e8f1f8;
          color:#154876;
          font-size:.78rem;
          font-weight:700;
          margin-bottom:10px
        }
        .communication-editor{
          margin-top:16px
        }
        .communication-editor summary{
          cursor:pointer;
          color:#154876;
          font-weight:700
        }
        .communication-editor textarea{
          min-height:120px
        }
        .freight-grid{
          display:grid;
          gap:12px
        }
        .freight-row{
          display:flex;
          justify-content:space-between;
          gap:16px;
          padding-bottom:10px;
          border-bottom:1px solid #edf2f5
        }
        .freight-row:last-child{
          border-bottom:0;
          padding-bottom:0
        }
        .freight-row span{
          color:#64748b
        }
        .freight-row strong{
          white-space:nowrap;
          text-align:right
        }
        .dashboard-bottom{
          display:grid;
          grid-template-columns:minmax(0,1fr) minmax(0,1fr);
          gap:20px
        }
        .dashboard-panel .table{
          margin-top:8px
        }
        .dashboard-panel table{
          margin-bottom:0
        }
        .dashboard-panel th,
        .dashboard-panel td{
          vertical-align:middle
        }
        .dashboard-panel .panel-link{
          white-space:nowrap
        }
        .status-pill{
          display:inline-block;
          border-radius:999px;
          padding:3px 8px;
          background:#eef4f8;
          font-size:.78rem;
          white-space:nowrap
        }
        @media(max-width:1000px){
          .dashboard-snapshot{
            grid-template-columns:repeat(2,minmax(0,1fr))
          }
          .dashboard-middle,
          .dashboard-bottom{
            grid-template-columns:1fr
          }
        }
        @media(max-width:760px){
          .dashboard-topbar{
            flex-direction:column
          }
          .dashboard-actions{
            justify-content:flex-start
          }
          .dashboard-snapshot{
            grid-template-columns:1fr 1fr
          }
        }
        @media(max-width:480px){
          .dashboard-snapshot{
            grid-template-columns:1fr
          }
        }
      </style>

      <div class="dashboard-topbar">
        <div>
          <p class="dashboard-date">
            Welcome back, ${esc(user.name)}.
          </p>
        </div>
      </div>

      <section class="dashboard-panel">
        <div class="dashboard-panel-header">
          <h2>Staff Communication</h2>
          ${
            canWrite
              ? `<span class="communication-badge">Shared Team Note</span>`
              : ""
          }
        </div>

        <div class="communication-note">
          ${
            note
              ? `
                  <div class="communication-badge">Important</div>
                  <p class="communication-note-text">${esc(note)}</p>

                  <p class="muted">
                    Last updated ${esc(followUp?.updated_at || "—")}
                    by ${esc(
                      followUp?.updater_name ||
                        followUp?.updater_email ||
                        "—",
                    )}
                  </p>
                `
              : `
                  <p class="muted">
                    No staff communication has been added yet.
                  </p>
                `
          }
        </div>

        ${
          canWrite
            ? `
                <details class="communication-editor">
                  <summary>+ Add / Edit Message</summary>

                  <form action="/admin/dashboard" method="post">
                    <input
                      name="csrf"
                      type="hidden"
                      value="${esc(csrf)}"
                    >

                    <label>
                      Message
                      <textarea
                        name="note"
                        maxlength="4000"
                        placeholder="Add an announcement, reminder, urgent note, task, or general staff message..."
                      >${esc(note)}</textarea>
                    </label>

                    <div class="actions">
                      <button>Save Communication</button>
                    </div>
                  </form>
                </details>
              `
            : ""
        }
      </section>

      <h2 class="dashboard-heading">Business Snapshot</h2>

      <div class="dashboard-snapshot">
        <div class="dashboard-stat">
          <span>Customers</span>
          <strong>${esc(summary?.customers ?? 0)}</strong>
        </div>

        <div class="dashboard-stat">
          <span>Active Shipments</span>
          <strong>${esc(summary?.active ?? 0)}</strong>
        </div>

        <div class="dashboard-stat">
          <span>Unpaid Invoices</span>
          <strong>${esc(summary?.unpaid ?? 0)}</strong>
        </div>

        <div class="dashboard-stat">
          <span>Payments Received</span>
          <strong>${esc(pesos(summary?.payments))}</strong>
        </div>
      </div>

      <div class="dashboard-middle">
        ${
          canWrite
            ? `
              <section class="dashboard-panel">
                <div class="dashboard-panel-header">
                  <h2>Freight Performance</h2>
                </div>

                <div class="freight-grid">
                  <div class="freight-row">
                    <span>Freight Revenue</span>
                    <strong>${esc(pesos(margin?.charges))}</strong>
                  </div>

                  <div class="freight-row">
                    <span>Ni Hao Cost</span>
                    <strong>${esc(pesos(margin?.costs))}</strong>
                  </div>

                  <div class="freight-row">
                    <span>Freight Margin</span>
                    <strong>${esc(pesos(margin?.margin))}</strong>
                  </div>

                  <div class="freight-row">
                    <span>Total Shipments</span>
                    <strong>${esc(margin?.shipments ?? 0)}</strong>
                  </div>
                </div>

                <div class="actions" style="margin-top:18px;">
                  <a class="panel-link" href="/admin/finance">
                    View Finance →
                  </a>
                </div>
              </section>
            `
            : ""
        }
      </div>

      <div class="dashboard-bottom">
        <section class="dashboard-panel">
          <div class="dashboard-panel-header">
            <h2>Recently Updated Shipments</h2>
            <a class="panel-link" href="/admin/shipments">
              View All →
            </a>
          </div>

          ${
            recent.length
              ? `
                <div class="table">
                  <table>
                    <thead>
                      <tr>
                        <th>Tracking</th>
                        <th>Customer</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      ${recent
                        .map(
                          (r) => `
                            <tr>
                              <td>
                                ${recordLink(
                                  "shipments",
                                  r.id,
                                  r.tracking_number,
                                )}
                              </td>

                              <td>${esc(r.full_name)}</td>

                              <td>
                                <span class="status-pill">
                                  ${esc(r.status)}
                                </span>
                              </td>
                            </tr>
                          `,
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
              `
              : `<p class="muted">No shipments yet.</p>`
          }
        </section>

        <section class="dashboard-panel">
          <div class="dashboard-panel-header">
            <h2>Recent Invoices &amp; Payments</h2>
            <a class="panel-link" href="/admin/invoices">
              View All →
            </a>
          </div>

          ${
            invoiceRows.length
              ? `
                <div class="table">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Invoice</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      ${invoiceRows
                        .map(
                          (r) => `
                            <tr>
                              <td>${esc(r.full_name)}</td>

                              <td>
                                ${recordLink(
                                  "invoices",
                                  r.id,
                                  r.invoice_number,
                                )}
                              </td>

                              <td>${esc(pesos(r.total))}</td>

                              <td>
                                <span class="status-pill">
                                  ${esc(invoiceStatus(r))}
                                </span>
                              </td>
                            </tr>
                          `,
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
              `
              : `<p class="muted">No invoices yet.</p>`
          }
        </section>
      </div>
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
