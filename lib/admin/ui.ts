import type { RecordData } from "./validation";
import { secureHeaders } from "./security";
export const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const pesos = (v: unknown) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(v ?? 0) / 100,
  );
export function page(
  title: string,
  body: string,
  user = "",
  status = 200,
  extra: Record<string, string> = {},
  canWrite = true,
  staff = false,
) {
  let navigation = staff
    ? `<a class="admin-nav-link" href="/admin/quotations">Quotations</a><div class="admin-nav-heading">Expenses</div><a class="admin-nav-link" href="/admin/finance/expenses">My Expenses</a><div class="admin-nav-heading">Account</div><a class="admin-nav-link" href="/cdn-cgi/access/logout">Sign Out</a>`
    : `<a class="admin-nav-link" href="/admin/dashboard">Dashboard</a><div class="admin-nav-heading">Customers &amp; Cargo</div><a class="admin-nav-link" href="/admin/customers">Customers</a><a class="admin-nav-link" href="/admin/shipments">Shipments</a><a class="admin-nav-link" href="/admin/quotations">Quotations</a><a class="admin-nav-link" href="/admin/leads">Leads</a><div class="admin-nav-heading">Billing &amp; Finance</div><a class="admin-nav-link" href="/admin/invoices">Invoices</a><div class="admin-nav-group"><a class="admin-nav-link" href="/admin/finance">Finance</a><a class="admin-nav-sub" href="/admin/finance/expenses">Expenses</a><a class="admin-nav-sub" href="/admin/finance/cash">Cash Flow &amp; Customer Credits</a></div><div class="admin-nav-heading">Pricing</div><div class="admin-nav-group"><a class="admin-nav-link" href="/admin/rates-guide">Rates &amp; Pricing</a><a class="admin-nav-sub" href="/admin/nihao-rates">Ni Hao Rates</a></div>${canWrite ? '<div class="admin-nav-heading">Admin &amp; Tools</div><a class="admin-nav-link" href="/admin/message-center">Message Library</a><a class="admin-nav-link" href="/admin/activity">Activity Log</a><a class="admin-nav-link" href="/admin/import-export">Import / Export</a>' : ""}<div class="admin-nav-heading">Account</div><a class="admin-nav-link" href="/cdn-cgi/access/logout">Sign Out</a>`;
  navigation = navigation.replace("Import / Export", "Export");
  navigation = navigation.replace('<a class="admin-nav-link" href="/admin/import-export">Export</a>', '<a class="admin-nav-link" href="/admin/import-export">Export</a><a class="admin-nav-link" href="/admin/freight-calculator">Freight Calculator</a>');
  body = `<style>@media(min-width:761px){.admin-shell{grid-template-columns:180px minmax(0,1fr);gap:16px}.admin-sidebar{padding:14px}.admin-brand{font-size:1.1rem;margin-bottom:16px}.admin-nav{gap:5px}.admin-nav-group{gap:3px}.admin-nav-heading{font-size:.72rem;margin:14px 0 3px}.admin-nav-link{padding:8px 9px;font-size:.95rem}.admin-nav-sub{padding:6px 9px 6px 18px;font-size:.9rem}}</style>${body}`;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/kargodoor-admin-icon.png" type="image/png"><link rel="apple-touch-icon" href="/kargodoor-admin-icon.png"><link rel="manifest" href="/manifest.webmanifest"><title>${esc(title)} | KargoDoor Admin</title><style>
@font-face{font-family:Inter;src:url('/fonts/inter-400.woff2')}*{box-sizing:border-box}html{overflow-x:hidden}body{margin:0;background:#eef8ff;color:#154876;font:16px/1.5 Inter,Arial,sans-serif}main{width:min(1440px,100%);margin:24px auto;padding:24px}header{display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:20px}header img{width:92px;height:72px;object-fit:contain}header p{margin:0}h1{font-size:1.8rem;line-height:1.2;margin:0 0 8px;overflow-wrap:anywhere}h2{font-size:1.2rem;overflow-wrap:anywhere}.admin-shell{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px}.admin-sidebar{background:#154876;border-radius:12px;padding:20px;align-self:start;position:sticky;top:20px;color:white}.admin-sidebar a{color:white;text-decoration:none}.admin-sidebar a:hover{background:#1d5b8c;text-decoration:none}.admin-brand{display:block;font-size:1.3rem;font-weight:700;margin-bottom:22px}.admin-nav{display:flex;flex-direction:column;gap:8px}.admin-nav-group{display:flex;flex-direction:column;gap:5px}.admin-nav-heading{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#c6dce9;margin:18px 0 5px}.admin-nav-link{display:block;padding:10px 12px;border-radius:7px;font-size:1.05rem}.admin-nav-sub{display:block;padding:7px 12px 7px 28px;font-size:1rem}.admin-content,.admin-content>*{min-width:0}.mobile-nav-checkbox,.mobile-nav-toggle{display:none}a{color:#0753ad;text-underline-offset:3px}section,.card{background:white;border:1px solid #c6dce9;border-radius:12px;padding:24px;margin-bottom:20px}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.finance-summary-cards{grid-template-columns:repeat(5,minmax(0,1fr))}.card{padding:20px}.card strong{display:block;font-size:1.8rem;overflow-wrap:anywhere;margin-top:12px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}label{display:block;font-size:1rem;font-weight:600}input,select,textarea{width:100%;font:inherit;color:inherit;border:1px solid #94b3c7;border-radius:6px;padding:10px;margin-top:6px;background:white}textarea{min-height:100px;resize:vertical}input:focus,select:focus,textarea:focus,button:focus,a:focus{outline:3px solid #0099cf;outline-offset:3px}button,.button{display:inline-block;border:0;background:#0753ad;color:white;font:inherit;border-radius:7px;padding:11px 20px;cursor:pointer;text-decoration:none}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:18px;margin-top:20px}.admin-collapsible{padding:0}.admin-collapsible>summary{list-style:none;cursor:pointer;font-weight:700;padding:18px 24px;position:relative}.admin-collapsible>summary::-webkit-details-marker{display:none}.admin-collapsible>summary::after{content:"›";position:absolute;right:24px;font-size:1.35rem;transition:transform .15s ease}.admin-collapsible[open]>summary::after{transform:rotate(90deg)}.admin-collapsible>section{border:0;border-radius:0;margin:0;border-top:1px solid #c6dce9}.customer-notification{border-bottom:1px solid #d5e4ed;margin:0}.customer-notification:first-of-type{border-top:1px solid #d5e4ed}.customer-notification summary{list-style:none;cursor:pointer;font-weight:600;padding:14px 8px;position:relative;padding-right:36px}.customer-notification summary::-webkit-details-marker{display:none}.customer-notification summary::after{content:'›';position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:1.35rem;color:#466177;transition:transform .15s ease}.customer-notification[open] summary::after{transform:translateY(-50%) rotate(90deg)}.customer-notification[open] summary{color:#0753ad}.customer-notification textarea{margin-top:8px}.customer-notification .actions{margin:10px 0 16px}.search{display:flex;align-items:end;gap:16px;flex-wrap:wrap}.search label{flex:1;min-width:170px}.notice{background:#e7f4fc;border:1px solid #87afc6;padding:16px;border-radius:8px;overflow-wrap:anywhere}.table{max-width:100%;overflow:auto;-webkit-overflow-scrolling:touch}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:14px 10px;border-bottom:1px solid #d5e4ed;vertical-align:top;overflow-wrap:anywhere}th{font-size:.9rem}dl{display:grid;grid-template-columns:180px minmax(0,1fr);gap:12px}dt{font-weight:bold}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:#466177}.wide{grid-column:1/-1}@media(max-width:760px){main{padding:14px;margin:0 auto}header{gap:12px;margin:8px 0 16px}header img{width:72px;height:56px}h1{font-size:1.55rem}.admin-shell{grid-template-columns:1fr;gap:16px}.admin-sidebar{position:static;padding:12px;border-radius:10px}.admin-brand{display:inline-block;margin:0;font-size:1.1rem}.mobile-nav-toggle{display:block;cursor:pointer;font-weight:700;margin-top:10px;padding:11px 12px;border:1px solid #87afc6;border-radius:7px;min-height:44px}.admin-nav{display:none;margin-top:10px;padding-top:8px;border-top:1px solid #4d7899}.mobile-nav-checkbox:checked~.admin-nav{display:flex}.admin-nav-link{padding:11px 12px;min-height:44px;font-size:1rem}.admin-nav-sub{padding:9px 12px 9px 28px;min-height:40px;font-size:.95rem}.admin-nav-heading{margin:14px 0 2px}.cards,.grid,.finance-summary-cards{grid-template-columns:1fr}section,.card{padding:18px}.actions{align-items:stretch;gap:10px}.actions button,.actions .button,.actions form{min-height:44px}.search{gap:10px}.search label{min-width:100%}.table table{min-width:680px}dl{grid-template-columns:1fr;gap:5px}dd{margin-bottom:12px}}@media(max-width:600px){.dashboard-snapshot,.finance-summary-cards,.finance-shipping-cards{grid-template-columns:1fr!important}.dashboard-actions,.message-template-header{align-items:stretch!important;flex-direction:column}.dashboard-actions .button,.message-template-header button{width:100%}}@media(max-width:520px){main{padding:10px}header img{width:62px;height:48px}h1{font-size:1.4rem}section,.card{padding:14px}.actions button,.actions .button,.actions form,.search button{width:100%}th,td{padding:11px 8px}}
</style><style>@media(max-width:760px){.table{overflow-x:auto;-webkit-overflow-scrolling:touch}.table table{min-width:840px}.table th,.table td{overflow-wrap:normal;word-break:normal}}</style></head><body><main><header><img src="/assets/kargodoor-logo-approved.png" alt="KargoDoor PH"><div><h1>${esc(title)}</h1><p>${esc(user)}</p></div></header>${user ? `<div class="admin-shell"><aside class="admin-sidebar" aria-label="Admin navigation"><span class="admin-brand">KargoDoor Admin</span><input class="mobile-nav-checkbox" type="checkbox" id="admin-nav-toggle"><label class="mobile-nav-toggle" for="admin-nav-toggle">☰ Menu</label><nav class="admin-nav">${navigation}</nav></aside><div class="admin-content">${body}</div></div>` : body}</main></body></html>`,
    {
      status,
      headers: {
        ...secureHeaders,
        "Content-Type": "text/html; charset=utf-8",
        ...extra,
      },
    },
  );
}
export function input(
  key: string,
  label: string,
  values: RecordData,
  type = "text",
  required = false,
  max = 160,
) {
  const raw = values[key];
  const value =
    ["shipping_charge", "delivery_charge", "nihao_cost"].includes(key) &&
    typeof raw === "number"
      ? (raw / 100).toFixed(2)
      : raw;
  return `<label>${esc(label)}${required ? " *" : ""}<input name="${key}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} maxlength="${max}" ${type === "number" ? 'min="0" step="0.001"' : ""}></label>`;
}
export function select(
  key: string,
  label: string,
  values: RecordData,
  options: readonly string[],
) {
  return `<label>${esc(label)} *<select name="${key}" required>${options.map((v) => `<option value="${esc(v)}"${values[key] === v ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
}
export function hidden(key: string, value: unknown) {
  return `<input type="hidden" name="${key}" value="${esc(value)}">`;
}
