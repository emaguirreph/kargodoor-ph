import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import { AdminError, authenticate, canMutateAdmin, checkCsrf, csrfToken, type AdminEnv } from "./security";
import { esc, page } from "./ui";
import { itemCategories, kdPlusPriceOn, seaQuote, seaRatesOn, transferFeePesos, type SeaCategory } from "./quotation-pricing";
import { niHaoDensityThreshold, niHaoPackagePricing, niHaoSeaQuote, niHaoSeaRatesOn } from "./nihao-pricing";

type Row = Record<string, unknown>;
type PackageRow = {
  item: string; catalogItem: string; category: SeaCategory; length: number; width: number; height: number;
  /** Physical packages in this line (a bundle of long pieces can be one line). */
  packageCount: number;
  weight: number; status: string;
  /** Centavos. */ nihaoCost: number;
  nihaoCostSource: "estimate" | "actual";
  cbm: number;
  /** Centavos, includes the ₱30 transfer fee. */ charge: number;
};
const warehouses = ["Guangzhou", "Yiwu", "Shishi", "Tongda Air Cargo", "Hong Kong", "Taiwan"];
const statuses = ["China Warehouse", "China Port", "Sea Transit", "Manila Port", "Gatepass", "Malabon Warehouse", "Delivered"];
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function parsePackages(raw: string): PackageRow[] {
  let rows: unknown;
  try { rows = JSON.parse(raw); } catch { throw new AdminError("The package list could not be read. Please try again."); }
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new AdminError("Add between 1 and 100 package lines.");
  return rows.map((value, index) => {
    const row = (value && typeof value === "object" ? value : {}) as Row;
    const item = String(row.item ?? "").trim().slice(0, 160);
    const catalogItem = String(row.catalogItem ?? "");
    const [length, width, height, weight] = [row.length, row.width, row.height, row.weight].map(Number);
    const packageCount = Number(row.packageCount ?? 1);
    const status = String(row.status ?? "China Warehouse");
    if (!item || !(catalogItem in itemCategories)) throw new AdminError(`Line ${index + 1}: enter the item and choose it from the item list.`);
    if (![length, width, height, weight].every((n) => Number.isFinite(n) && n > 0)) throw new AdminError(`Line ${index + 1}: enter the size (L × W × H in cm) and weight.`);
    if (!Number.isInteger(packageCount) || packageCount < 1 || packageCount > 1000) throw new AdminError(`Line ${index + 1}: packages must be a whole number of at least 1.`);
    if (!statuses.includes(status)) throw new AdminError(`Line ${index + 1}: choose a valid status.`);
    const category = itemCategories[catalogItem];
    const cbm = (length * width * height * packageCount) / 1_000_000;
    let charge: number, estimate: number;
    try {
      charge = Math.round(seaQuote(category, cbm, weight, packageCount).final * 100);
      estimate = Math.round(niHaoSeaQuote(category, cbm, weight, 1).final * 100);
    } catch { throw new AdminError(`Line ${index + 1} cannot be calculated.`); }
    const typed = String(row.nihaoCost ?? "").trim();
    if (typed && !/^\d+(\.\d{1,2})?$/.test(typed)) throw new AdminError(`Line ${index + 1}: enter a valid Ni Hao cost.`);
    const typedCost = typed ? Math.round(Number(typed) * 100) : null;
    const nihaoCost = typedCost ?? estimate;
    const nihaoCostSource = typedCost === null || typedCost === estimate ? "estimate" : "actual";
    return { item, catalogItem, category, length, width, height, packageCount, weight, status, nihaoCost, nihaoCostSource, cbm, charge };
  });
}
async function nextQuotationNumber(db: any) { const year = new Date().getUTCFullYear(), rows = (await db.prepare("SELECT quotation_number FROM quotations WHERE quotation_number LIKE ?").bind(`KD-Q-${year}-%`).all()).results as Row[], last = rows.reduce((max, row) => Math.max(max, Number(String(row.quotation_number).split("-").at(-1)) || 0), 0); return `KD-Q-${year}-${String(last + 1).padStart(3, "0")}`; }

function pageBody(user: any, env: AdminEnv, customers: Row[], values: Record<string, string> = {}) {
  const customerOptions = customers.map((customer) => `<option value="${esc(customer.id)}"${values.customer_id === String(customer.id) ? " selected" : ""}>${esc(customer.customer_code)} — ${esc(customer.full_name)}</option>`).join("");
  const warehouseOptions = warehouses.map((warehouse) => `<option value="${esc(warehouse)}"${(values.warehouse ?? warehouses[0]) === warehouse ? " selected" : ""}>${esc(warehouse)}</option>`).join("");
  const date = values.quotation_date ?? today();
  const itemOptions = Object.keys(itemCategories).map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("");
  const pricing = {
    itemCategories, seaRates: seaRatesOn(), kdPlus: kdPlusPriceOn(), transferFee: transferFeePesos,
    niHao: { rates: niHaoSeaRatesOn(), densityThreshold: niHaoDensityThreshold, packages: niHaoPackagePricing },
  };
  return page("Bulk Quotation", `<section data-bulk-intake data-pricing="${esc(JSON.stringify(pricing))}">
<p class="notice"><strong>One customer, many packages, one quotation.</strong> Add one line per package. Long pieces that travel tied together can be one line: set Packages to how many are in the bundle. Each line becomes its own shipment and tracking number once the quotation is approved.</p>
<form method="post" data-bulk-form><input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, "/admin/bulk-intake"))}"><input type="hidden" name="packages" value="" data-package-data>
<div class="grid"><label>Existing customer *<select name="customer_id" required><option value="">Choose customer</option>${customerOptions}</select><small><a href="/admin/customers">+ Add customer</a></small></label><label>China warehouse *<select name="warehouse">${warehouseOptions}</select></label><label>Quotation date<input name="quotation_date" type="date" value="${esc(date)}"></label><label>Valid until<input name="valid_until" type="date" value="${esc(values.valid_until ?? plusDays(date, 3))}"></label><label>Supplier name<input name="supplier_name" value="${esc(values.supplier_name ?? "")}" placeholder="e.g. Guangdong Xinmiao Storage Equipment Co., Ltd."></label><label>Supplier location<input name="origin" value="${esc(values.origin ?? "")}" placeholder="e.g. Dongguan, Guangdong"></label></div>
<h2>Package lines</h2><p class="muted">Pick the item from the list so the right sea category is used. Sizes are per package in cm; weight is the line total in kg. The KargoDoor charge and the Ni Hao estimate calculate by themselves. Type over the Ni Hao cost when Ni Hao sends their actual quote.</p>
<div class="table"><table class="bulk-package-table"><thead><tr><th>#</th><th>Item description</th><th>Item list / category</th><th>L × W × H (cm)</th><th>Packages</th><th>CBM</th><th>Weight (kg)</th><th>KargoDoor charge</th><th>Ni Hao cost</th><th>Profit</th><th>Status</th><th></th></tr></thead><tbody data-package-rows></tbody></table></div>
<template data-package-template><tr><td data-line-no></td><td><input data-description aria-label="Item description" placeholder="e.g. Storage rack" required></td><td><select data-catalog aria-label="Item list"><option value="">Choose item</option>${itemOptions}</select><small data-category class="muted"></small></td><td><div class="bulk-dimensions"><input data-length type="number" min="0.01" step="any" aria-label="Length in cm" placeholder="L" required><input data-width type="number" min="0.01" step="any" aria-label="Width in cm" placeholder="W" required><input data-height type="number" min="0.01" step="any" aria-label="Height in cm" placeholder="H" required></div></td><td><input data-count type="number" min="1" step="1" value="1" aria-label="Packages in this line"></td><td data-cbm>—</td><td><input data-weight type="number" min="0.01" step="any" aria-label="Weight in kg" required></td><td data-charge>—</td><td><input data-nihao type="number" min="0" step="0.01" aria-label="Ni Hao cost"><small data-nihao-tag class="muted">Estimate</small></td><td data-profit>—</td><td><select data-status>${statuses.map((status) => `<option value="${esc(status)}">${esc(status)}</option>`).join("")}</select></td><td><button type="button" class="bulk-remove" data-remove>Remove</button></td></tr></template>
<p class="actions"><button type="button" class="button" data-add-package>+ Add line</button></p>
<div class="cards bulk-totals"><div class="card"><span>Lines / packages</span><strong data-total-packages>0</strong></div><div class="card"><span>Total CBM / kg</span><strong data-total-size>0</strong></div><div class="card"><span>KargoDoor total</span><strong data-total-charge>₱0.00</strong></div><div class="card"><span>Ni Hao total</span><strong data-total-nihao>₱0.00</strong></div><div class="card"><span>Gross profit</span><strong data-total-profit>₱0.00</strong></div><div class="card"><span>Margin</span><strong data-total-margin>—</strong></div></div><p class="notice bulk-margin-warning" data-margin-warning hidden>Margin is under 15%. Check the item category or Ni Hao's quote before sending.</p><p class="muted">Ni Hao cost, profit and margin are internal only. The customer PDF shows each line's KargoDoor charge and the total.</p><p class="actions"><button name="action" value="create">Create Draft Quotation</button></p></form></section><style>.bulk-package-table{width:max-content!important;min-width:100%!important}.bulk-package-table th{white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important}.bulk-package-table td{vertical-align:top}.bulk-package-table input,.bulk-package-table select{width:100%!important;box-sizing:border-box}.bulk-package-table [data-description]{width:210px!important}.bulk-package-table [data-catalog]{width:200px!important}.bulk-package-table [data-count]{width:64px!important}.bulk-package-table [data-weight]{width:90px!important}.bulk-package-table [data-nihao]{width:110px!important}.bulk-package-table select[data-status]{width:150px!important}.bulk-package-table small{display:block;margin-top:3px}.bulk-package-table [data-cbm],.bulk-package-table [data-charge],.bulk-package-table [data-profit]{white-space:nowrap;padding-top:18px}.bulk-dimensions{display:flex;gap:4px}.bulk-dimensions input{width:78px!important}.bulk-remove{background:#fff!important;color:#b42318!important;border:1px solid #f0b6ae!important;padding:7px 9px}.bulk-totals{grid-template-columns:repeat(3,minmax(0,1fr))!important}.bulk-totals strong{font-size:1.35rem;white-space:nowrap}.bulk-margin-warning{background:#fef3f2!important;border-color:#f0b6ae!important;color:#b42318!important}@media(max-width:760px){.bulk-totals{grid-template-columns:repeat(2,minmax(0,1fr))!important}}</style><script src="/admin-bulk-intake.js" defer></script>`, user.name, 200, {}, true);
}

export async function bulkIntakePage(request: Request) {
  const { env: cloudflareEnv } = await getCloudflareContext(); const env = cloudflareEnv as unknown as AdminEnv; const user = await authenticate(request, env); if (!canMutateAdmin(user)) throw new AdminError("Viewer access is read-only.", 403);
  const db = env.ADMIN_DB, customers = (await db.prepare("SELECT id, customer_code, full_name, company_name, mobile, email, address FROM customers WHERE archived_at IS NULL ORDER BY full_name LIMIT 500").all<Row>()).results;
  if (request.method === "GET") return pageBody(user, env, customers);
  const form = await request.formData(); checkCsrf(env, user.id, "/admin/bulk-intake", String(form.get("csrf") ?? ""));
  const values = Object.fromEntries(["customer_id", "warehouse", "quotation_date", "valid_until", "supplier_name", "origin", "packages"].map((key) => [key, String(form.get(key) ?? "").trim()]));
  const customer = customers.find((candidate) => String(candidate.id) === values.customer_id);
  if (!customer || !warehouses.includes(values.warehouse)) throw new AdminError("Choose a valid customer and China warehouse."); if (form.get("action") !== "create") throw new AdminError("Create the quotation from the package list.");
  const quotationDate = isDate(values.quotation_date) ? values.quotation_date : today();
  const validUntil = isDate(values.valid_until) ? values.valid_until : plusDays(quotationDate, 3);
  const packages = parsePackages(values.packages), charge = packages.reduce((sum, row) => sum + row.charge, 0), cost = packages.reduce((sum, row) => sum + row.nihaoCost, 0);
  const id = randomUUID(), now = new Date().toISOString(), quotationNumber = await nextQuotationNumber(db);
  const packageTotal = packages.reduce((sum, row) => sum + row.packageCount, 0);
  const cargo = { bulkPackages: packages, description: `${packages.length} line bulk quotation (${packageTotal} package${packageTotal === 1 ? "" : "s"})`, item: "Multiple packages", category: "Multiple categories", originWarehouse: values.warehouse, supplierName: values.supplier_name.slice(0, 160), origin: values.origin.slice(0, 160), cbm: packages.reduce((sum, row) => sum + row.cbm, 0), weight: packages.reduce((sum, row) => sum + row.weight, 0), packageQuantity: packageTotal };
  const costSource = packages.every((row) => row.nihaoCostSource === "estimate") ? "estimate" : "actual";
  await db.prepare("INSERT INTO quotations (id,quotation_number,customer_id,status,freight_type,quotation_date,valid_until,prepared_by,customer_snapshot,cargo_snapshot,pricing_snapshot,calculated_amount,final_amount,backend_cost,backend_cost_source,notes,prepared_by_admin_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, quotationNumber, customer.id, "Draft", "Sea Freight", quotationDate, validUntil, user.name, JSON.stringify({ name: customer.full_name, company: customer.company_name ?? "", mobile: customer.mobile ?? "", email: customer.email ?? "", address: customer.address ?? "" }), JSON.stringify(cargo), JSON.stringify({ bulk: true, transferFeePerLine: transferFeePesos }), charge, charge, cost, costSource, null, user.id, now, now).run();
  await db.prepare("INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,new_value,created_at) VALUES (?,?,?,?,?,?,?)").bind(randomUUID(), user.id, "create", "quotations", id, JSON.stringify({ quotation_number: quotationNumber, bulk: true, lines: packages.length, final_amount: charge }), now).run();
  return page("Bulk quotation created", `<section><p class="notice">Created draft <a href="/admin/quotations?id=${esc(id)}">${esc(quotationNumber)}</a>. Approval will create ${packages.length} shipments and tracking numbers, one per line.</p><p><a class="button" href="/admin/quotations?id=${esc(id)}">Open quotation</a> <a class="button" href="/admin/bulk-intake">Create another bulk quotation</a></p></section>`, user.name, 200, {}, true);
}

export { pageBody as bulkIntakeForm };
