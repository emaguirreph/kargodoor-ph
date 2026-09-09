  return page("Dashboard", `
    <section>
      <h2 style="color:#c62828;">Staff Follow-up</h2>
      ${note
        ? `<p style="white-space:pre-wrap;color:#c62828;font-weight:600;">${esc(note)}</p>
           <p class="muted">Last updated ${esc(followUp?.updated_at)} by ${esc(followUp?.updater_name || followUp?.updater_email)}</p>`
        : `<p style="color:#c62828;">No follow-up note has been added.</p>`
      }
      ${canWrite
        ? `<form action="/admin/dashboard" method="post">
             <input name="csrf" type="hidden" value="${esc(csrf)}">
             <label>
               Shared note
               <textarea name="note" maxlength="4000">${esc(note)}</textarea>
             </label>
             <div class="actions">
               <button>Save follow-up</button>
             </div>
           </form>`
        : ""
      }
    </section>

    ${canWrite
      ? '<div class="actions"><a class="button" href="/admin/customers?new=1">Add customer</a><a class="button" href="/admin/shipments?new=1">Add shipment</a><a class="button" href="/admin/invoices?new=1">Create invoice</a></div>'
      : '<p class="notice">Viewer access is read-only.</p>'
    }

    <p class="muted">
      Customer and shipment records for the new admin.${canWrite ? ' Public tracking is managed in the <a href="/admin/tracking-editor">tracking editor</a> during this phase.' : ""}
    </p>

    ${cards([
      ["Total Customers", summary?.customers ?? 0],
      ["Active Shipments", summary?.active ?? 0],
      ["Unpaid Invoices", summary?.unpaid ?? 0],
      ["Payments Received", pesos(summary?.payments)]
    ])}

    <section>
      <h2>Needs Attention</h2>
      ${attention ? `
        ${unpaidRows.length
          ? `<h3>Unpaid invoices (${unpaidRows.length})</h3>
             <div class="table">
               <table>
                 <thead>
                   <tr>
                     <th>Invoice</th>
                     <th>Customer</th>
                     <th>Tracking</th>
                     <th>Remaining balance</th>
                     <th>Due date</th>
                   </tr>
                 </thead>
                 <tbody>
                   ${unpaidRows.map(r => `
                     <tr>
                       <td>${recordLink("invoices", r.id, r.invoice_number)}</td>
                       <td>${esc(r.full_name)}</td>
                       <td>${esc(r.tracking_number)}</td>
                       <td>${esc(pesos(r.balance))}</td>
                       <td>${esc(r.due_at || "—")}</td>
                     </tr>
                   `).join("")}
                 </tbody>
               </table>
             </div>`
          : ""
        }

        ${canWrite && missingRows.length
          ? `<h3>Shipments missing Nihao cost (${missingRows.length})</h3>
             <div class="table">
               <table>
                 <thead>
                   <tr>
                     <th>Shipment</th>
                     <th>Customer</th>
                     <th>Status</th>
                   </tr>
                 </thead>
                 <tbody>
                   ${missingRows.map(r => `
                     <tr>
                       <td>${recordLink("shipments", r.id, r.tracking_number)}</td>
                       <td>${esc(r.full_name)}</td>
                       <td>${esc(r.status)}</td>
                     </tr>
                   `).join("")}
                 </tbody>
               </table>
             </div>`
          : ""
        }
      ` : "<p>No items need attention.</p>"}
    </section>

    ${canWrite ? `
      <section>
        <h2>Freight margin</h2>
        <p>
          <strong>${esc(pesos(margin?.margin))}</strong>
          across ${esc(margin?.costed ?? 0)} shipments with Ni Hao cost entered.
        </p>
        <p>
          ${Number(margin?.shipments ?? 0) - Number(margin?.costed ?? 0)}
          shipments still need a cost. Excludes cancelled shipments,
          delivery charges and business expenses.
        </p>
        <a href="/admin/finance">Review charges and costs</a>
      </section>
    ` : ""}

    <section>
      <h2>Recently updated shipments</h2>
      ${recent.length
        ? `<div class="table">
             <table>
               <thead>
                 <tr>
                   <th>Shipment</th>
                   <th>Customer</th>
                   <th>Status</th>
                 </tr>
               </thead>
               <tbody>
                 ${recent.map(r => `
                   <tr>
                     <td>${recordLink("shipments", r.id, r.tracking_number)}</td>
                     <td>${esc(r.full_name)}</td>
                     <td>${esc(r.status)}</td>
                   </tr>
                 `).join("")}
               </tbody>
             </table>
           </div>`
        : canWrite
          ? '<p>No shipments yet. <a href="/admin/customers?new=1">Add your first customer</a>, then create their shipment.</p>'
          : '<p>No shipments yet.</p>'
      }
    </section>

    <section>
      <h2>Invoices and payments</h2>
      <p>Review invoices, payments, and balances.</p>
      <div class="actions">
        <a href="/admin/invoices">Review invoices</a>
        ${canWrite ? '<a href="/admin/activity">Review activity log</a>' : ""}
      </div>
    </section>
  `, user.name, 200, {}, canWrite);
