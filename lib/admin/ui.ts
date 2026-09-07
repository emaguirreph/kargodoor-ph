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
) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | KargoDoor Admin</title><style>
@font-face{font-family:Inter;src:url('/fonts/inter-400.woff2')}*{box-sizing:border-box}body{margin:0;background:#eef8ff;color:#154876;font:16px/1.5 Inter,Arial,sans-serif}main{max-width:1160px;margin:24px auto;padding:24px}header{display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:20px}header img{width:92px;height:72px;object-fit:contain}header p{margin:0}h1{font-size:1.8rem;line-height:1.2;margin:0 0 8px}h2{font-size:1.2rem}nav{display:flex;flex-wrap:wrap;gap:20px;background:#154876;padding:14px 20px;border-radius:10px;margin-bottom:24px}nav a{color:white}a{color:#0753ad;text-underline-offset:3px}section,.card{background:white;border:1px solid #c6dce9;border-radius:12px;padding:24px;margin-bottom:20px}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.card{padding:20px}.card strong{display:block;font-size:1.8rem;overflow-wrap:anywhere;margin-top:12px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}label{display:block;font-size:1rem;font-weight:600}input,select,textarea{width:100%;font:inherit;color:inherit;border:1px solid #94b3c7;border-radius:6px;padding:10px;margin-top:6px;background:white}textarea{min-height:100px;resize:vertical}input:focus,select:focus,textarea:focus,button:focus,a:focus{outline:3px solid #0099cf;outline-offset:3px}button,.button{display:inline-block;border:0;background:#0753ad;color:white;font:inherit;border-radius:7px;padding:11px 20px;cursor:pointer;text-decoration:none}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:18px;margin-top:20px}.search{display:flex;align-items:end;gap:16px;flex-wrap:wrap}.search label{flex:1;min-width:170px}.notice{background:#e7f4fc;border:1px solid #87afc6;padding:16px;border-radius:8px;overflow-wrap:anywhere}.table{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:14px 10px;border-bottom:1px solid #d5e4ed;vertical-align:top;overflow-wrap:anywhere}th{font-size:.9rem}dl{display:grid;grid-template-columns:180px minmax(0,1fr);gap:12px}dt{font-weight:bold}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:#466177}.wide{grid-column:1/-1}@media(max-width:760px){main{padding:14px;margin:8px auto}.cards,.grid{grid-template-columns:1fr 1fr}section{padding:18px}}@media(max-width:520px){.grid,.cards{grid-template-columns:1fr}h1{font-size:1.5rem}dl{grid-template-columns:1fr;gap:5px}dd{margin-bottom:12px}nav{gap:14px}.search button{width:100%}}
</style></head><body><main><header><img src="/assets/kargodoor-logo-approved.png" alt="KargoDoor PH"><div><h1>${esc(title)}</h1><p>${esc(user)}</p></div></header>${user ? '<nav aria-label="Admin"><a href="/admin/dashboard">Dashboard</a><a href="/admin/customers">Customers</a><a href="/admin/shipments">Shipments</a><a href="/admin/invoices">Invoices</a><a href="/admin/finance">Freight margin</a><a href="/admin/activity">Activity log</a><a href="/admin">Tracking editor</a><a href="/cdn-cgi/access/logout">Sign out</a></nav>' : ""}${body}</main></body></html>`,
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
