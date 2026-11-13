import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authenticate, canMutateAdmin, type AdminEnv } from "@/lib/admin/security";
import { page } from "@/lib/admin/ui";
import { extendedAdminCsv } from "@/lib/admin/extended-csv-exports";
import { shipmentCsvColumns, shipmentCsvRows } from "@/lib/admin/shipment-list";

const headers = { customers:["Account Number","Full Name","Company","Mobile","Email","Address","Notes","Created","Updated"], shipments:["Tracking Number","Account Number","Customer Name","Service Type","Origin Warehouse","Warehouse Received Date","CBM","Weight KG","Status","Actual Arrival","Tracking Remarks","KargoDoor Freight Charge","Ni Hao Freight Cost","Delivery Charge","Payment Status","Created","Updated"] };
const cell = (value: unknown) => { const text=String(value??"").replace(/^([=+\-@])/, "'$1"); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text; };
const file = (name:string, columns:string[], rows:Record<string,unknown>[]) => new Response("\ufeff"+[columns.join(","),...rows.map(row=>columns.map(key=>cell(row[key])).join(","))].join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${name}"`,"Cache-Control":"no-store"}});

export async function GET(request: Request) {
 const {env}=await getCloudflareContext(); const admin=env as unknown as AdminEnv; const user=await authenticate(request,admin); const action=new URL(request.url).searchParams.get("download"); const date=new Date().toISOString().slice(0,10);
 if(!canMutateAdmin(user)) return page("Export",'<p class="notice" role="alert">Viewer access is read-only.</p>',user.name,403);
 const extended=await extendedAdminCsv(action,admin.ADMIN_DB,date); if(extended) return extended;
 const exportHome=`<section><h2>Export data</h2><p class="muted">Downloads include all saved records. Amount columns are formatted in Philippine pesos.</p><div class="actions"><a class="button" href="?download=customers">Export Customers CSV</a><a class="button" href="?download=shipments">Export Shipments CSV</a><a class="button" href="?download=expenses">Export Expenses CSV</a><a class="button" href="?download=invoices">Export Invoices CSV</a><a class="button" href="?download=cash-and-credits">Export Cash Flow &amp; Customer Credits CSV</a><a class="button" href="?download=rates-and-pricing">Export Rates &amp; Pricing CSV</a><a class="button" href="?download=nihao-rates">Export Ni Hao Rates CSV</a></div></section><section><h2>Download templates</h2><p><a href="?download=customer-template">Customer CSV Template</a> · <a href="?download=shipment-template">Shipment CSV Template</a></p><p class="muted">CSV files can be opened in Excel, Numbers, or Google Sheets.</p></section>`;
 if(!action) return page("Export",exportHome,user.name);
 if(action==="customer-template") return file("KargoDoor-Customer-Import-Template.csv",headers.customers.slice(0,7),[]);
 if(action==="shipment-template") return file("KargoDoor-Shipment-Import-Template.csv",headers.shipments.filter(x=>!["Customer Name","Created","Updated"].includes(x)),[]);
 if(action==="customers") { const rows=(await admin.ADMIN_DB.prepare("SELECT customer_code AS 'Account Number', full_name AS 'Full Name', company_name AS Company, mobile AS Mobile, email AS Email, address AS Address, notes AS Notes, created_at AS Created, updated_at AS Updated FROM customers ORDER BY created_at").all<Record<string,unknown>>()).results; return file(`KargoDoor-Customers-${date}.csv`,headers.customers,rows); }
 if(action==="shipments") { const params=new URL(request.url).searchParams; return file(`KargoDoor-Shipments-${date}.csv`,[...shipmentCsvColumns],await shipmentCsvRows(admin.ADMIN_DB,params)); }
 return page("Export",`<section><h2>Export data</h2><p><a class="button" href="?download=customers">Export Customers CSV</a> <a class="button" href="?download=shipments">Export Shipments CSV</a></p></section><section><h2>Download templates</h2><p><a href="?download=customer-template">Customer CSV Template</a> · <a href="?download=shipment-template">Shipment CSV Template</a></p><p class="muted">CSV files can be opened in Excel, Numbers, or Google Sheets.</p></section>`,user.name);
}
