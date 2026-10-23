import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import {
  authenticate,
  AdminError,
  canManageStaffRecords,
  canMutateAdmin,
  canDeleteAdmin,
  requireAdminDelete,
  checkCsrf,
  csrfToken,
  isRestrictedStaff,
  type AdminEnv,
} from "./security";
import { esc, page, pesos } from "./ui";
import {
  airItems,
  airQuote,
  itemCategories,
  seaQuote,
  seaRates,
  type AirItem,
  type SeaCategory,
} from "./quotation-pricing";
import { measurementUnits } from "./quotation-cbm";
import { densityThreshold } from "./quotation-density";
import { defaultQuotationTerms } from "./quotation-pdf";
type Row = Record<string, unknown>;
type Snapshot = Record<string, unknown>;

/** Old quotations can have partial snapshots; never let one prevent the record loading. */
function snapshot(value: unknown): { data: Snapshot; valid: boolean } {
  try {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { data: parsed as Snapshot, valid: true }
      : { data: {}, valid: false };
  } catch {
    return { data: {}, valid: false };
  }
}

const detailValue = (value: unknown) =>
  String(value ?? "").trim() || "—";
export const isQuotationNumeric = (raw: string) =>
  /^(?:(?:0|[1-9]\d*)(?:\.\d+)?|\.\d+)$/.test(raw) &&
  Number.isFinite(Number(raw));
const originWarehouses = [
  "Guangzhou",
  "Yiwu",
  "Shishi",
  "Tongda Air Cargo",
  "Hong Kong",
  "Taiwan",
] as const;
const cents = (v: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(v))
    throw new AdminError("Enter a valid non-negative currency amount.");
  const [a, b = ""] = v.split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
};
const date = () => new Date().toISOString().slice(0, 10);
const validUntilDate = (quotationDate: string = date()) => {
  const d = new Date(`${quotationDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
};
const customerPicker = (customers: Row[], selectedId = "") =>
  `<label class="wide">Existing customer (optional)<select name="customer_id" data-customer-picker><option value="">Enter customer details manually</option>${customers.map((customer) => `<option value="${esc(customer.id)}" data-customer="${esc(JSON.stringify({ name: customer.full_name ?? "", company: customer.company_name ?? "", mobile: customer.mobile ?? "", email: customer.email ?? "", address: customer.address ?? "" }))}"${String(customer.id) === selectedId ? " selected" : ""}>${esc(customer.customer_code)} — ${esc(customer.full_name)}</option>`).join("")}</select><small>Selecting a customer fills the details below. You can still edit them for this quotation.</small></label>`;
const quotationCustomers = async (db: D1Database) =>
  (await db.prepare("SELECT id,customer_code,full_name,company_name,mobile,email,address FROM customers WHERE archived_at IS NULL ORDER BY full_name,customer_code LIMIT 500").all<Row>()).results;
const selectedCustomerId = async (db: D1Database, form: FormData) => {
  const id = String(form.get("customer_id") || "").trim();
  if (!id) return null;
  if (!/^[\da-f-]{36}$/i.test(id)) throw new AdminError("Choose a valid customer.");
  const customer = await db.prepare("SELECT id FROM customers WHERE id=? AND archived_at IS NULL").bind(id).first<Row>();
  if (!customer) throw new AdminError("The selected customer is no longer available.");
  return id;
};
const baseCbmConverter = (values: Record<string, unknown> = {}) =>
  `<section class="wide cbm-converter" data-cbm-converter data-container-size="${esc(values.containerSize ?? "")}" data-container-quantity="${esc(values.containerQuantity ?? "")}"><h3>CBM CONVERTER</h3><p class="muted">Calculator only — L × W × H × Calculator Quantity. It does not change the Declared CBM used for pricing.</p><div class="grid"><label>Length (L)<input name="length" data-converter-length type="number" min="0" step="any" value="${esc(values.length ?? "")}"></label><label>Width (W)<input name="width" data-converter-width type="number" min="0" step="any" value="${esc(values.width ?? "")}"></label><label>Height (H)<input name="height" data-converter-height type="number" min="0" step="any" value="${esc(values.height ?? "")}"></label><label>Measurement<select name="measurement_unit" data-converter-unit>${["cm", "mm", "m"].map((unit) => `<option value="${unit}"${String(values.measurementUnit ?? "cm") === unit ? " selected" : ""}>${unit}</option>`).join("")}</select></label><label>Calculator Quantity<input name="calculator_quantity" data-converter-quantity type="number" min="1" step="1" value="${esc(values.calculatorQuantity ?? values.packageQuantity ?? 1)}"></label></div><dl><dt>Single Package CBM</dt><dd data-converter-single>—</dd><dt>Total Converted CBM</dt><dd data-converter-total>—</dd></dl><p class="notice" data-converter-quantity-warning hidden></p><label class="checkbox"><input name="show_package_dimensions" type="checkbox" value="1"${values.showPackageDimensions ? " checked" : ""}> Show package measurements and converted CBM on the customer quotation.</label></section>`;
const cbmConverter = (values: Record<string, unknown> = {}) =>
  baseCbmConverter(values).replace(
    "</div><dl>",
    `<label>Quantity of Packages *<input name="package_quantity" data-quotation-quantity type="number" min="1" step="1" required value="${esc(values.packageQuantity ?? 1)}"><small>Used for quotation pricing.</small></label></div><dl>`,
  );
const seaPricingSection = (
  inputs: string,
  values: Record<string, unknown> = {},
) =>
  `<section class="wide" data-sea-pricing style="background:#fff9df;border-color:#e8d58a"><h3>Sea Freight pricing</h3>${inputs}<dl><dt>Category</dt><dd data-sea-category>${esc(values.category ?? "—")}</dd><dt>Quantity of Packages</dt><dd data-sea-package-quantity>${esc(values.packageQuantity ?? "—")}</dd><dt>Package Tier</dt><dd data-sea-tier>${esc(values.packageTier ?? "—")}</dd><dt>Actual Density (kg/CBM)</dt><dd data-sea-density>${esc(values.density ?? "—")}</dd><dt>CBM Price</dt><dd data-sea-cbm-rate>${esc(values.cbmRate ?? "—")}</dd><dt>Density Rate / kg</dt><dd data-sea-density-rate>${esc(values.densityRate ?? "—")}</dd><dt>Fixed / Base Charge</dt><dd data-sea-base>${esc(values.base ?? "—")}</dd><dt>Density-Based Charge</dt><dd data-sea-density-charge>${esc(values.densityCharge ?? "—")}</dd><dt>Density Rule Applies?</dt><dd data-sea-density-applies>${esc(values.densityApplies === undefined ? "—" : values.densityApplies ? "YES" : "NO")}</dd><dt>Pricing Method</dt><dd data-sea-pricing-method>${esc(values.pricingMethod ?? "—")}</dd><dt>Total Unit Amount</dt><dd data-sea-system>${esc(values.final ?? "—")}</dd></dl></section>`;
const airPricingSection = (inputs: string) =>
  `<section class="wide" data-air-pricing style="background:#fff9df;border-color:#e8d58a"><h3>Air Freight pricing</h3>${inputs}</section>`;
const overrideFields = (amount: unknown = null, reason: unknown = "", niHaoCost: unknown = null) => {
  const value = amount === null || amount === undefined ? "" : (Number(amount) / 100).toFixed(2);
  return `<section class="wide"><h3>Override quoted amount</h3><p class="muted">Optional — enter a final quoted amount only when you need to override the calculated rate. A reason is required when an override is used.</p><div class="grid"><label>Override amount<input name="override_amount" type="number" min="0" step=".01" value="${esc(value)}"></label><label>Override reason<input name="override_reason" value="${esc(reason)}"></label></div></section><input type="hidden" data-existing-nihao-cost value="${esc(niHaoCost === null || niHaoCost === undefined ? "" : (Number(niHaoCost) / 100).toFixed(2))}">`;
};
const internalProfitPanel = (niHaoCost: unknown = null) => {
  const cost = niHaoCost === null || niHaoCost === undefined ? "" : (Number(niHaoCost) / 100).toFixed(2);
  return `<section class="wide" data-quotation-profit><h3>Internal cost &amp; profit — Admin use only</h3><p class="muted">Enter the Ni Hao quotation once received. These figures are never included in the customer quotation or PDF.</p><div class="grid"><label>Ni Hao cost<input name="nihao_cost" data-nihao-cost type="number" min="0" step=".01" value="${esc(cost)}" placeholder="Enter supplier cost"></label><dl><dt>KargoDoor charge</dt><dd data-quotation-profit-charge>—</dd><dt>Gross profit</dt><dd data-quotation-profit-gross>—</dd><dt>Gross margin</dt><dd data-quotation-profit-margin>—</dd></dl></div></section>`;
};
const internalProfitScript = () =>
  `<script>(()=>{const money=value=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value),number=value=>Number(String(value??"").replace(/[^0-9.-]/g,"")),update=form=>{const panel=form.querySelector("[data-quotation-profit]"),cost=form.querySelector("[data-nihao-cost]");if(!panel||!cost)return;const override=form.querySelector('[name="override_amount"]'),sea=form.querySelector("[data-sea-system]"),air=form.querySelector("[data-air-system]"),charge=override?.value.trim()?Number(override.value):number(sea?.textContent)||number(air?.textContent),supplier=cost.value.trim()?Number(cost.value):NaN,put=(key,value)=>{const node=panel.querySelector("[data-quotation-profit-"+key+"]");if(node)node.textContent=value;};put("charge",Number.isFinite(charge)?money(charge):"—");if(!Number.isFinite(charge)||!Number.isFinite(supplier)||supplier<0){put("gross","—");put("margin","—");return;}const gross=charge-supplier;put("gross",money(gross));put("margin",charge?((gross/charge)*100).toFixed(2)+"%":"—");};document.querySelectorAll("form.grid").forEach(form=>{update(form);form.addEventListener("input",()=>update(form));new MutationObserver(()=>update(form)).observe(form,{subtree:true,childList:true,characterData:true});});})();</script>`;

const categoryAutoSelect = () =>
  `<script>(()=>{const map=${JSON.stringify(itemCategories)};document.querySelectorAll(\'select[name="item"]\').forEach(item=>{const category=item.form?.querySelector(\'input[name="category"]\');if(!category)return;item.addEventListener("change",()=>{const mapped=map[item.value];if(mapped)category.value=mapped;});});})();</script>`;
const cbmAutoCalculate = () =>
  `<script>(()=>{const divisors={mm:1e9,cm:1e6,m:1};document.querySelectorAll(\'form.grid\').forEach(form=>{const cbm=form.querySelector(\'input[name="cbm"]\'),fields=["length","width","height","measurement_unit","quantity"].map(name=>form.querySelector("[name="+name+"]"));if(!cbm||fields.some(field=>!field))return;const calculate=()=>{const [length,width,height,unit,quantity]=fields.map(field=>field.value.trim());if(!length||!width||!height||!unit||!quantity||!(unit in divisors))return;const values=[length,width,height,quantity].map(Number);if(values.some(value=>!Number.isFinite(value)||value<=0)||!Number.isInteger(values[3]))return;const total=values[0]*values[1]*values[2]*values[3]/divisors[unit];cbm.value=total.toFixed(6).replace(/\\.?0+$/,"");cbm.readOnly=true;cbm.dispatchEvent(new Event("input",{bubbles:true}));};fields.forEach(field=>field.addEventListener(field.name==="measurement_unit"?"change":"input",calculate));});})();</script>`;
const seaCalculatorReformat = () =>
  `<script>(()=>{const mobile=new Set(["Mobile phones","Computers","Tablets"]);document.querySelectorAll("form.grid").forEach(form=>{const freight=form.querySelector('[name="freight_type"]'),item=form.querySelector('[name="item"]'),units=form.querySelector('[name="units"]'),hidden=["category","length","width","height","measurement_unit","quantity"];if(!freight||!item||!units)return;const sync=()=>{const sea=freight.value==="Sea Freight";hidden.forEach(name=>{const field=form.querySelector("[name="+name+"]");const label=field?.closest("label");if(label)label.hidden=sea;});units.disabled=sea&&!mobile.has(item.value);units.closest("label")?.classList.toggle("muted",sea&&!mobile.has(item.value));};freight.addEventListener("change",sync);item.addEventListener("change",sync);sync();});})();</script>`;
const densityPanel = () =>
  `<section class="wide"><h3>Internal density — Admin use only</h3><dl><dt>Density</dt><dd data-density-value>—</dd><dt>Density threshold</dt><dd>${densityThreshold} kg/CBM</dd><dt>Status</dt><dd data-density-status>—</dd></dl></section>`;
const densityAutoCalculate = () =>
  `<script>(()=>{const threshold=${densityThreshold},divisors={mm:1e9,cm:1e6,m:1};document.querySelectorAll(\'form.grid\').forEach(form=>{const cbm=form.querySelector(\'input[name="cbm"]\'),weight=form.querySelector(\'input[name="weight"]\'),density=form.querySelector("[data-density-value]"),status=form.querySelector("[data-density-status]"),dimensions=["length","width","height","measurement_unit","quantity"].map(name=>form.querySelector("[name="+name+"]"));if(!cbm||!weight||!density||!status||dimensions.some(field=>!field))return;const clear=()=>{density.textContent="—";status.textContent="—";};const update=()=>{const [length,width,height,unit,quantity]=dimensions.map(field=>field.value.trim()),hasDimensions=[length,width,height].some(Boolean);if(hasDimensions){if(!length||!width||!height||!(unit in divisors)||!quantity){clear();return;}const dimensionValues=[length,width,height,quantity].map(Number);if(dimensionValues.some(value=>!Number.isFinite(value)||value<=0)||!Number.isInteger(dimensionValues[3])){clear();return;}}const totalCbm=Number(cbm.value),actualWeight=Number(weight.value);if(!cbm.value.trim()||!weight.value.trim()||!Number.isFinite(totalCbm)||totalCbm<=0||!Number.isFinite(actualWeight)||actualWeight<0){clear();return;}const value=actualWeight/totalCbm;density.textContent=value.toFixed(2)+" kg/CBM";status.textContent=value>threshold?"ABOVE THRESHOLD — WEIGHT CHARGE COMPARISON APPLIES":"WITHIN THRESHOLD";};[cbm,weight,...dimensions].forEach(field=>field.addEventListener(field.name==="measurement_unit"?"change":"input",update));update();});})();</script>`;
const seaCalculationPanel = (saved?: Record<string, unknown>) =>
  `<section class="wide" data-sea-calculation${saved ? ' data-saved-sea="${esc(JSON.stringify(saved))}"' : ""} hidden><h3>INTERNAL CALCULATION — ADMIN USE ONLY</h3><dl><dt>Item / commodity</dt><dd data-sea-item>—</dd><dt>Category</dt><dd data-sea-category>—</dd><dt>Package / tier</dt><dd data-sea-tier>—</dd><dt>Declared CBM</dt><dd data-sea-cbm>—</dd><dt>Declared weight</dt><dd data-sea-weight>—</dd><dt>Density</dt><dd data-sea-density>—</dd><dt>Density threshold</dt><dd>${densityThreshold} kg/CBM</dd><dt>CBM rate</dt><dd data-sea-cbm-rate>—</dd><dt>Volume / base charge</dt><dd data-sea-base>—</dd><dt>Density rate / kg</dt><dd data-sea-density-rate>—</dd><dt>Density-based charge</dt><dd data-sea-density-charge>—</dd><dt>Density rule applies?</dt><dd data-sea-density-applies>—</dd><dt>Pricing method</dt><dd data-sea-pricing-method>—</dd><dt>Total unit amount</dt><dd data-sea-system>—</dd><dt>Override rate</dt><dd data-sea-override>—</dd><dt>Final quoted rate</dt><dd data-sea-final>—</dd></dl><p data-sea-error class="notice" hidden></p></section>`;
const seaCalculationScript = () =>
  `<script>(()=>{const money=value=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value),text=(root,key,value)=>{const node=root.querySelector("[data-sea-"+key+"]");if(node)node.textContent=value;},render=(root,result,override)=>{text(root,"item",result.item);text(root,"category",result.category);text(root,"tier",result.packageTier);text(root,"cbm",result.cbm);text(root,"weight",result.weight+" kg");text(root,"density",Number(result.density).toFixed(2)+" kg/CBM");text(root,"cbm-rate",money(result.cbmRate)+" / CBM");text(root,"base",money(result.base));text(root,"density-rate",result.densityRate===null?"Not applicable":money(result.densityRate)+" / kg");text(root,"density-charge",result.densityRate===null?"Not applicable":money(result.densityCharge));text(root,"density-applies",result.densityApplies?"YES":"NO");text(root,"pricing-method",result.pricingMethod);text(root,"system",money(result.final));const hasOverride=override!==""&&Number.isFinite(Number(override))&&Number(override)>=0;text(root,"override",hasOverride?money(Number(override)):"—");text(root,"final",money(hasOverride?Number(override):result.final));};document.querySelectorAll(\'form.grid\').forEach(form=>{const panel=form.querySelector("[data-sea-calculation]"),freight=form.querySelector(\'select[name="freight_type"]\'),csrf=form.querySelector(\'input[name="csrf"]\'),fields=["item","category","cbm","weight","units","override_amount"].map(name=>form.querySelector("[name="+name+"]"));if(!panel||!freight||!csrf||fields.some(field=>!field))return;const error=panel.querySelector("[data-sea-error]"),[item,category,cbm,weight,units,override]=fields;const toggle=()=>{panel.hidden=freight.value!=="Sea Freight";};const saved=panel.dataset.savedSea;if(freight.value==="Sea Freight"&&saved){try{render(panel,JSON.parse(saved),String(override.value||""));panel.hidden=false;}catch{}}toggle();let timer;const calculate=()=>{toggle();if(panel.hidden)return;const payload={freightType:freight.value,item:item.value,category:category.value,cbm:cbm.value,weight:weight.value,units:units.value};if(!payload.item||!payload.cbm||!payload.weight)return;clearTimeout(timer);timer=setTimeout(async()=>{try{const response=await fetch("/admin/quotations/calculate",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf.value},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok)throw new Error(body.error||"Unable to calculate.");render(panel,body,String(override.value||""));error.hidden=true;}catch(cause){error.textContent=cause instanceof Error?cause.message:"Unable to calculate.";error.hidden=false;}},150);};[freight,item,category,cbm,weight,units].forEach(field=>field.addEventListener(field.name==="freight_type"||field.name==="item"?"change":"input",calculate));override.addEventListener("input",()=>{const system=panel.querySelector("[data-sea-system]")?.textContent;if(system)calculate();});});})();</script>`;
const airCalculationPanel = (saved?: Record<string, unknown>) =>
  `<section class="wide" data-air-calculation${saved ? ' data-saved-air="${esc(JSON.stringify(saved))}"' : ""} hidden><h3>INTERNAL CALCULATION — ADMIN USE ONLY</h3><dl><dt>Item / commodity</dt><dd data-air-item>—</dd><dt>Air category</dt><dd data-air-category>—</dd><dt>Declared CBM</dt><dd data-air-cbm>—</dd><dt>Declared weight</dt><dd data-air-weight>—</dd><dt>Volumetric weight</dt><dd data-air-volumetric>—</dd><dt>Billable weight</dt><dd data-air-billable>—</dd><dt>Units / pieces</dt><dd data-air-units>—</dd><dt>Rate</dt><dd data-air-rate>—</dd><dt>System calculated rate</dt><dd data-air-system>—</dd><dt>Override rate</dt><dd data-air-override>—</dd><dt>Final quoted rate</dt><dd data-air-final>—</dd></dl><p data-air-error class="notice" hidden></p></section>`;
const airCalculationScript = () =>
  `<script>(()=>{const money=value=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value),text=(root,key,value)=>{const node=root.querySelector("[data-air-"+key+"]");if(node)node.textContent=value;},render=(root,result,override)=>{const pieces=result.rateBasis==="Per piece";text(root,"item",result.item);text(root,"category",result.airCategory||result.item);text(root,"cbm",pieces?"Not applicable":result.cbm);text(root,"weight",pieces?"Not applicable":result.weight+" kg");text(root,"volumetric",pieces?"Not applicable":Number(result.volumetricWeight).toFixed(2)+" kg");text(root,"billable",pieces?"Not applicable":result.billableWeight+" kg");text(root,"units",pieces?result.quantity:"Not applicable");text(root,"rate",pieces?money(result.rate)+" / piece":money(result.rate)+" / kg");text(root,"system",money(result.final));const hasOverride=override!==""&&Number.isFinite(Number(override))&&Number(override)>=0;text(root,"override",hasOverride?money(Number(override)):"—");text(root,"final",money(hasOverride?Number(override):result.final));};document.querySelectorAll(\'form.grid\').forEach(form=>{const panel=form.querySelector("[data-air-calculation]"),freight=form.querySelector(\'select[name="freight_type"]\'),csrf=form.querySelector(\'input[name="csrf"]\'),fields=["item","cbm","weight","quantity","override_amount"].map(name=>form.querySelector("[name="+name+"]"));if(!panel||!freight||!csrf||fields.some(field=>!field))return;const error=panel.querySelector("[data-air-error]"),[item,cbm,weight,quantity,override]=fields;const toggle=()=>{panel.hidden=freight.value!=="Air Freight";};const saved=panel.dataset.savedAir;if(freight.value==="Air Freight"&&saved){try{render(panel,JSON.parse(saved),String(override.value||""));panel.hidden=false;}catch{}}toggle();let timer;const calculate=()=>{toggle();if(panel.hidden)return;const payload={freightType:freight.value,item:item.value,cbm:cbm.value,weight:weight.value,quantity:quantity.value};if(!payload.item||!payload.quantity)return;clearTimeout(timer);timer=setTimeout(async()=>{try{const response=await fetch("/admin/quotations/calculate",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf.value},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok)throw new Error(body.error||"Unable to calculate.");render(panel,body,String(override.value||""));error.hidden=true;}catch(cause){error.textContent=cause instanceof Error?cause.message:"Unable to calculate.";error.hidden=false;}},150);};[freight,item,cbm,weight,quantity].forEach(field=>field.addEventListener(field.name==="freight_type"||field.name==="item"?"change":"input",calculate));override.addEventListener("input",calculate);});})();</script>`;
async function number(db: D1Database) {
  const y = new Date().getUTCFullYear();
  const rows = (
    await db
      .prepare(
        "SELECT quotation_number FROM quotations WHERE quotation_number LIKE ?",
      )
      .bind(`KD-Q-${y}-%`)
      .all<Row>()
  ).results;
  const max = rows.reduce(
    (m, r) =>
      Math.max(m, Number(String(r.quotation_number).split("-").at(-1)) || 0),
    0,
  );
  return `KD-Q-${y}-${String(max + 1).padStart(3, "0")}`;
}
function quotationCustomerMessage(q: Row) {
  const customer = snapshot(q.customer_snapshot).data;
  const cargo = snapshot(q.cargo_snapshot).data;
  const name = String(customer.name || "Customer");
  const warehouse = String(cargo.originWarehouse || "");
  const quotationNumber = String(q.quotation_number || "");
  const validUntil = String(q.valid_until || "");

  const footer = [
    "",
    "—",
    "KargoDoor PH",
    "China to PH, made SIMPLE.",
    "",
    "+63 917 157 7370 | +63 908 889 0664",
    "support@kargodoorph.com",
    "www.kargodoorph.com",
  ];
  const supplierInstructions = [
    "Instructions to Suppliers",
    "Important reminders before shipping:",
    "1. Attach a cargo-mark label to every package. It must include the customer code, Philippine recipient’s phone number, and China sender’s phone number; otherwise, the warehouse cannot receive the cargo.",
    "2. Include one packing list with every shipment. It must state the detailed Chinese product name, material, quantity, weight, and shipper’s phone number.",
    "3. Before delivery, ensure the packaging is complete and undamaged. Reinforce fragile cargo. The warehouse will not accept cargo with damaged packaging.",
    "",
    "发货前注意重要事项：",
    "1. 请务必每件货物贴好唛头标签（包括客户代号，菲律宾收货人电话，中国寄件人电话），否则仓库无法收货入仓；",
    "2. 请每票货随货附一张装箱单，包含详细中文品名，材质，件数，重量，发货人电话等；",
    "3. 送货前请确保货物包装完整无破损，易碎货物加固包装，否则仓库不接收包装破损货物。",
  ];

  const messages: Array<[string, string, string[]]> = [
    [
      "nihao-quote-request",
      "Nihao Quote Request",
      [
        "Hello po! Pa-Quote po.",
        "",
        "Sea or Air:",
        "Item:",
        "Item Picture:",
        "Dimensions:",
        "Weight.",
        "",
        "Thank you po. :)",
      ],
    ],
    [
      "sent",
      "Quotation Sent",
      [
        `Hi ${name}! Here’s your KargoDoor quotation.`,
        "",
        `Quotation No.: ${quotationNumber}`,
        `Estimated Amount: ${pesos(q.final_amount)}`,
        `Service: ${String(q.freight_type || "")}`,
        warehouse ? `Origin Warehouse: ${warehouse}` : "",
        validUntil ? `Valid Until: ${validUntil}` : "",
        "",
        "Please review the cargo details and estimated all-in rate. If you have any questions or would like to proceed, just reply to this message and we’ll be happy to assist.",
        "",
        "Final charges may change if the actual dimensions, CBM, weight, quantity, cargo category, or warehouse inspection results differ from the quoted information.",
        "",
        ...supplierInstructions,
      ],
    ],
    [
      "follow-up",
      "Quotation Follow-Up",
      [
        `Hi ${name}! Just following up on KargoDoor Quotation ${quotationNumber}.`,
        "",
        `Estimated Amount: ${pesos(q.final_amount)}`,
        `Service: ${String(q.freight_type || "")}`,
        "",
        "Please let us know if you have any questions about the quotation or if you’re ready to proceed. We’ll be happy to guide you through the next step.",
      ],
    ],
    [
      "approved",
      "Quotation Approved — Next Steps",
      [
        `Hi ${name}! Thank you for approving KargoDoor Quotation ${quotationNumber}.`,
        "",
        "We’re ready to proceed with your shipment.",
        "",
        "We’ll create your shipment record and provide your KargoDoor cargo code and shipping instructions for your supplier.",
        "",
        "Please make sure your supplier follows the shipping instructions before sending the cargo to our China warehouse.",
      ],
    ],
  ];
  const warehouseInstructions: Record<string, [string, string[]]> = {
    Shishi: ["Shishi Warehouse Receiving Instructions", ["Sea Cargo 海运", "", "Shishi Branch Address 通达国际物流（石狮）", "地址：福建省晋江市龙湖镇梧坑村逸海产业园4栋A1通达仓库（+客户唛头）", "邮编：362200", "联系人：张先生 13600719368; 0595-85293217", "高德导航搜索“泉海通达物流”", "Receiving Time: Monday to Sunday 8am to 6pm (except for holidays)"]],
    Guangzhou: ["Guangzhou Warehouse Receiving Instructions", ["Sea Cargo 海运", "", "Guangzhou Branch Address 通达国际物流（广州）", "地址：广州市白云区江高镇沙溪东路18号166通达仓库（+客户唛头）", "邮编：510450", "联系人：伍先生 13924091288 / 13560372000", "固定电话：020-81997500", "高德导航搜索“广州通达仓库”", "Receiving Time: Monday to Sunday 8am to 6pm (except for holidays)"]],
    Yiwu: ["Yiwu Warehouse Receiving Instructions", ["Sea Cargo 海运", "", "Yiwu Branch Address 通达国际物流（义乌）", "地址：浙江省义乌市苏溪镇好派路121号飞天制衣1楼通达仓库（+客户唛头）", "邮编：322009", "联系人：施先生 13867932099 / 18069956177", "固定电话：0579-85201593", "Receiving Time: Monday to Sunday 8am to 5pm (except for holidays)"]],
    "Tongda Air Cargo": ["Tongda Air Cargo Receiving Instructions", ["TONGDA AIR CARGO 通达空运", "", "Label: AIR + customer cargo mark", "Recipient: 通达空运", "地址：福建泉州市晋江市龙湖梧坑逸海产业园4栋空运部（+客户唛头）", "Mobile: 13533392699", "Email: 1104931438@qq.com"]],
  };
  const selectedWarehouse = warehouseInstructions[warehouse];
  if (selectedWarehouse) messages.push(["warehouse-instructions", selectedWarehouse[0], [...selectedWarehouse[1], "", ...supplierInstructions]]);
  messages.push(["formal-export", "Formal Export Request", ["Formal Export Request 出口报关", "", "For suppliers needing formal export through the supplier’s name, please contact via WeChat:", "出口报关请联系:", "Guangzhou 广州报关联系微信/电话：18150099580", "Yiwu 义乌报关联系微信/电话：18050882066"]]);

  return `<section>
    <h2>Quotation Notifications</h2>
    <p class="muted">Choose a message below. Review before sending. Copying a message does not change the quotation status or create a shipment.</p>
    ${messages
      .map(([key, title, lines]) => {
        const id = `quotation-message-${String(q.id || "").replace(/[^\w-]/g, "")}-${key}`;
        const body = [
          ...lines.filter(
            (line, index, all) =>
              line !== "" || index === 0 || all[index - 1] !== "",
          ),
          ...footer,
        ].join("\n");
        return `<details class="customer-notification">
        <summary>${esc(title)}</summary>
        <textarea id="${esc(id)}" aria-label="${esc(title)} customer message" style="min-height:260px;white-space:pre-wrap">${esc(body)}</textarea>
        <div class="actions">
          <button type="button" class="copy-quotation-message" data-copy-source="${esc(id)}">Copy Message</button>
        </div>
      </details>`;
      })
      .join("")}
  </section>`;
}

const quotationMessageCopyScript = () => `<script src="/admin-copy.js" defer></script>`;

function customerPreview(q: Row, accountNumber = "") {
  const customer = snapshot(q.customer_snapshot);
  const cargo = snapshot(q.cargo_snapshot);
  const c = customer.data;
  const shipment = cargo.data;
  const warning = customer.valid && cargo.valid
    ? ""
    : '<p class="notice">Some legacy quotation details are unavailable. The saved quotation record is still open and can be edited.</p>';
  const packageRows = Array.isArray(shipment.bulkPackages) ? shipment.bulkPackages : [];
  const item = packageRows.length ? `${packageRows.length} package bulk quotation` : detailValue(shipment.description ?? shipment.item);
  const detail = (label: string, content: unknown) => {
    const itemValue = detailValue(content);
    const displayLabel = label === "Total CBM" ? "Declared CBM" : label === "Actual weight" ? "Declared weight" : label;
    return itemValue === "—" ? "" : `<div class="quotation-detail-item"><dt>${esc(displayLabel)}</dt><dd>${esc(itemValue)}</dd></div>`;
  };
  const cost = q.backend_cost === null || q.backend_cost === undefined ? "Not entered" : pesos(q.backend_cost);
  const gross = q.backend_cost === null || q.backend_cost === undefined ? "Enter Ni Hao cost to calculate" : pesos(Number(q.final_amount) - Number(q.backend_cost));
  const margin = q.backend_cost === null || q.backend_cost === undefined || Number(q.final_amount) === 0 ? "—" : `${(((Number(q.final_amount) - Number(q.backend_cost)) / Number(q.final_amount)) * 100).toFixed(2)}%`;

  return `${warning}<article class="quotation-print quotation-detail-view">
    <dl class="quotation-meta">
      <div class="quotation-detail-item"><dt>Account number</dt><dd>${esc(accountNumber) || "—"}</dd></div>
      <div class="quotation-detail-item"><dt>Quotation date</dt><dd>${esc(detailValue(q.quotation_date))}</dd></div>
    </dl>
    <div class="quotation-detail-cards">
      <section class="quotation-detail-card"><h2>Customer details</h2><dl class="quotation-detail-grid">${detail("Customer", c.name)}${detail("Company", c.company)}${detail("Mobile", c.mobile)}${detail("Email", c.email)}${detail("Address", c.address)}</dl></section>
      <section class="quotation-detail-card"><h2>Cargo &amp; price</h2><dl class="quotation-detail-grid">${detail("Item", item)}${detail("Freight type", q.freight_type)}${detail("Declared CBM", shipment.cbm)}${detail("Declared weight", shipment.weight === undefined || shipment.weight === null || shipment.weight === "" ? "" : `${shipment.weight} kg`)}${detail("Origin warehouse", shipment.originWarehouse)}<div class="quotation-detail-item quotation-total"><dt>KargoDoor shipping total</dt><dd>${pesos(q.final_amount)}</dd></div></dl></section>
      <section class="quotation-detail-card quotation-internal-card"><h2>Internal cost &amp; profit</h2><dl class="quotation-detail-grid"><div class="quotation-detail-item"><dt>Ni Hao cost</dt><dd>${cost}</dd></div><div class="quotation-detail-item"><dt>KargoDoor charge</dt><dd>${pesos(q.final_amount)}</dd></div><div class="quotation-detail-item"><dt>Gross profit</dt><dd>${gross}</dd></div><div class="quotation-detail-item"><dt>Gross margin</dt><dd>${margin}</dd></div></dl></section>
    </div>
  </article>`;
}
export async function quotationsPage(
  request: Request,
  envOverride?: AdminEnv,
): Promise<Response> {
  try {
    const env =
      envOverride ??
      ((await getCloudflareContext()).env as unknown as AdminEnv);
    const user = await authenticate(request, env),
      staff = isRestrictedStaff(user);
    const db = env.ADMIN_DB,
      url = new URL(request.url),
      path = "/admin/quotations";
    if (request.method === "POST") {
      if (!canManageStaffRecords(user))
        throw new AdminError("Viewer access is read-only.", 403);
      const form = await request.formData();
      checkCsrf(env, user.id, path, String(form.get("csrf") || ""));
      const action = String(form.get("action") || "save");
      if (!["save", "update", "duplicate", "archive"].includes(action))
        throw new AdminError("Invalid quotation action.");
      if (action === "archive") {
        requireAdminDelete(user);
        const deleteId = String(form.get("quotation_id") || "");
        const revision = String(form.get("revision") || "");
        if (
          !/^[\da-f-]{36}$/i.test(deleteId) ||
          !revision ||
          revision.length > 40
        )
          throw new AdminError("Invalid quotation revision.");
        if (String(form.get("confirm") || "") !== "yes")
          throw new AdminError("Confirm the quotation archive.");
        const existing = await db
          .prepare("SELECT * FROM quotations WHERE id=?")
          .bind(deleteId)
          .first<Row>();
        if (!existing) throw new AdminError("Quotation not found.", 404);
        if (String(existing.updated_at) !== revision)
          throw new AdminError(
            "Another admin changed this quotation. Reload it before archiving.",
            409,
          );
        const now = new Date().toISOString();
        try {
          const results = await db.batch([
            db
              .prepare(
                "INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,old_value,new_value,notes,created_at) SELECT ?,?,'archive','quotations',?,?,?,?,? WHERE EXISTS (SELECT 1 FROM quotations WHERE id=? AND updated_at=?)",
              )
              .bind(
                randomUUID(),
                user.id,
                deleteId,
                JSON.stringify(existing),
                JSON.stringify({ ...existing, archived_at: now, updated_at: now }),
                "Quotation archived.",
                now,
                deleteId,
                revision,
              ),
            db
              .prepare("UPDATE quotations SET archived_at=?, updated_at=? WHERE id=? AND updated_at=?")
              .bind(now, now, deleteId, revision),
          ]);
          if (!results.at(-1)?.meta.changes)
            throw new AdminError(
              "Another admin changed this quotation. Reload it before archiving.",
              409,
            );
        } catch (error) {
          if (error instanceof AdminError) throw error;
          throw error;
        }
        return page("Archived", "", user.name, 303, {
          Location: `${path}?archived=1`,
        });
      }
      if (action === "duplicate") {
        if (staff)
          throw new AdminError("Staff cannot duplicate quotations.", 403);
        const sourceId = String(form.get("quotation_id") || "");
        if (!/^[\da-f-]{36}$/i.test(sourceId))
          throw new AdminError("Invalid quotation ID.");
        const source = await db
          .prepare("SELECT * FROM quotations WHERE id=?")
          .bind(sourceId)
          .first<Row>();
        if (
          !source ||
          (staff && String(source.prepared_by_admin_user_id) !== user.id)
        )
          throw new AdminError("Quotation not found.", 404);
        const now = new Date().toISOString(),
          newId = randomUUID(),
          qn = await number(db);
        await db
          .prepare(
            "INSERT INTO quotations (id,quotation_number,customer_id,status,freight_type,quotation_date,valid_until,prepared_by,customer_snapshot,cargo_snapshot,pricing_snapshot,calculated_amount,override_amount,override_reason,final_amount,backend_cost,additional_cost,delivery_cost,notes,created_at,updated_at) SELECT ?,?,customer_id,'Draft',freight_type,?,valid_until,?,customer_snapshot,cargo_snapshot,pricing_snapshot,calculated_amount,override_amount,override_reason,final_amount,backend_cost,additional_cost,delivery_cost,notes,?,? FROM quotations WHERE id=?",
          )
          .bind(newId, qn, date(), user.name, now, now, sourceId)
          .run();
        await db
          .prepare(
            "INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,new_value,created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            randomUUID(),
            user.id,
            "duplicate",
            "quotations",
            newId,
            JSON.stringify({ source_id: sourceId, quotation_number: qn }),
            now,
          )
          .run();
        return page("Saved", "", user.name, 303, {
          Location: `${path}?id=${newId}`,
        });
      }
      if (action === "update") {
        const id = String(form.get("quotation_id") || "");
        if (!/^[\da-f-]{36}$/i.test(id))
          throw new AdminError("Invalid quotation ID.");
        const existing = await db
          .prepare("SELECT * FROM quotations WHERE id=?")
          .bind(id)
          .first<Row>();
        if (
          !existing ||
          (staff && String(existing.prepared_by_admin_user_id) !== user.id)
        )
          throw new AdminError("Quotation not found.", 404);
        const status = String(form.get("status") || "");
        if (
          !["Draft", "Sent", "Approved", "Revised", "Cancelled"].includes(
            status,
          )
        )
          throw new AdminError("Choose a valid quotation status.");
        const email = String(form.get("email") || "").trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new AdminError("Enter a valid email address.");
        const customer = {
          name: String(form.get("customer_name") || "").trim(),
          company: String(form.get("company") || ""),
          mobile: String(form.get("mobile") || ""),
          email,
          address: String(form.get("address") || ""),
        };
        if (!customer.name) throw new AdminError("Customer name is required.");
        const customerId = await selectedCustomerId(db, form);
        const savedCargo = JSON.parse(
          String(existing.cargo_snapshot),
        ) as Record<string, unknown>;
        const decimal = (key: string, required = false) => {
          const raw = String(form.get(key) ?? "").trim();
          if (!raw) {
            if (required) throw new AdminError(`${key} is required.`);
            return String(savedCargo[key] ?? "");
          }
          if (!isQuotationNumeric(raw))
            throw new AdminError(`Enter a valid non-negative ${key}.`);
          return raw;
        };
        const cargo = {
          item: String(form.get("item") || ""),
          category: "",
          description: String(form.get("description") || ""),
          quantity: "",
          unitType: "",
          packageQuantity: decimal("package_quantity") || "1",
          calculatorQuantity: decimal("calculator_quantity") || String(savedCargo.calculatorQuantity ?? savedCargo.packageQuantity ?? "1"),
          showPackageDimensions: form.get("show_package_dimensions") === "1",
          length: decimal("length"),
          width: decimal("width"),
          height: decimal("height"),
          measurementUnit: String(form.get("measurement_unit") || ""),
          cbm: "",
          weight: decimal("weight", true),
          units: decimal("units"),
          supplierName: String(form.get("supplier_name") || "").trim(),
          origin: String(form.get("origin") || ""),
          originWarehouse: String(form.get("origin_warehouse") || "") === "Other / enter manually" ? String(form.get("origin_warehouse_manual") || "").trim() : String(form.get("origin_warehouse") || ""),
          containerSize: String(savedCargo.containerSize ?? ""),
          containerQuantity: String(savedCargo.containerQuantity ?? ""),
        };
        const freight = String(form.get("freight_type") || "");
        if (!["Sea Freight", "Air Freight", "Full Container"].includes(freight))
          throw new AdminError("Choose a valid freight type.");
        if (freight === "Full Container") {
          cargo.category = "Full Container";
          cargo.cbm = "0";
          cargo.weight = "0";
        } else if (freight === "Sea Freight") {
          if (!(cargo.item in itemCategories))
            throw new AdminError("Choose a valid Sea Freight item.");
          cargo.category = itemCategories[cargo.item];
        } else {
          if (!airItems.includes(cargo.item as AirItem))
            throw new AdminError("Choose a valid Air Freight item.");
          cargo.category = cargo.item;
        }
        if (freight !== "Full Container") cargo.cbm = decimal("cbm", true);
        if (!Number.isInteger(Number(cargo.packageQuantity)) || Number(cargo.packageQuantity) < 1)
          throw new AdminError("Quantity of packages must be a whole number of at least 1.");
        const quotationDate = String(form.get("quotation_date") || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(quotationDate))
          throw new AdminError("Enter a valid quotation date.");
        const validUntil = String(form.get("valid_until") || "");
        if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil))
          throw new AdminError("Enter a valid valid-until date.");
        const pricingChanged =
          freight !== String(existing.freight_type) ||
          freight === "Full Container" ||
          ["item", "category", "cbm", "weight", "units"].some(
            (key) =>
              String(cargo[key as keyof typeof cargo] ?? "") !==
              String(savedCargo[key] ?? ""),
          );
        let pricingSnapshot = existing.pricing_snapshot,
          calculatedAmount = existing.calculated_amount,
          overrideAmount = existing.override_amount,
          overrideReason = existing.override_reason,
          finalAmount = existing.final_amount,
          activity = "update";
        if (pricingChanged) {
          let calc: ReturnType<typeof seaQuote> | ReturnType<typeof airQuote> | { final: number; pricingMethod: string; rateBasis: string };
          try {
            if (freight === "Full Container") {
              const manualRate = String(form.get("manual_rate") || "").trim();
              calc = { final: manualRate ? Number(manualRate) : Number(existing.final_amount) / 100, pricingMethod: "Manual full-container all-in rate", rateBasis: "Per container" };
              if (!Number.isFinite(calc.final) || calc.final < 0) throw new AdminError("Enter a valid full-container all-in rate.");
            } else if (freight === "Sea Freight") {
              if (
                !(cargo.item in itemCategories) &&
                cargo.item !== "OTHER / NOT LISTED"
              )
                throw new AdminError("Choose a valid Sea Freight item.");
              if (!(cargo.category in seaRates))
                throw new AdminError("Choose a valid Sea Freight category.");
              if (
                cargo.item in itemCategories &&
                itemCategories[cargo.item] !== cargo.category
              )
                throw new AdminError(
                  "The selected item does not match its Sea Freight category.",
                );
              calc = seaQuote(
                cargo.category as SeaCategory,
                Number(cargo.cbm),
                Number(cargo.weight),
                Number(cargo.units),
              );
            } else {
              if (!airItems.includes(cargo.item as AirItem))
                throw new AdminError("Choose a valid Air Freight item.");
              const airItem = cargo.item as AirItem;
              const pieceBased =
                airItem === "Mobile Phones" ||
                airItem === "Tablets" ||
                airItem === "Laptop Computers";
              const pieceCount = pieceBased ? Number(cargo.units) : 1;
              if (
                pieceBased &&
                (!Number.isInteger(pieceCount) || pieceCount < 1)
              )
                throw new AdminError(
                  "Units must be a whole number of at least 1 for Mobile Phones, Tablets, and Laptop Computers.",
                );
              calc = airQuote(
                airItem,
                Number(cargo.cbm),
                Number(cargo.weight),
                pieceCount,
              );
            }
          } catch (error) {
            if (error instanceof AdminError) throw error;
            throw new AdminError(
              error instanceof Error
                ? error.message
                : "Invalid pricing inputs.",
            );
          }
          if (freight === "Full Container") {
            cargo.containerSize = String(form.get("container_size") || "");
            cargo.containerQuantity = String(form.get("container_quantity") || savedCargo.containerQuantity || "1");
          }
          pricingSnapshot = JSON.stringify(calc);
          calculatedAmount = Math.round(calc.final * 100);
          finalAmount = calculatedAmount;
          overrideAmount = null;
          overrideReason = null;
          activity = "recalculate";
        }
        if (form.has("override_amount")) {
          const override = String(form.get("override_amount") || "").trim();
          const reason = String(form.get("override_reason") || "").trim();
          if (staff && override)
            throw new AdminError("Staff cannot override quotation prices.", 403);
          if (override) {
            if (!reason) throw new AdminError("An override reason is required.");
            overrideAmount = cents(override);
            overrideReason = reason;
            finalAmount = overrideAmount;
            activity = "override";
          } else {
            overrideAmount = null;
            overrideReason = null;
            finalAmount = calculatedAmount;
          }
        }
        const niHaoCostRaw = String(form.get("nihao_cost") || "").trim();
        const niHaoCost = niHaoCostRaw ? cents(niHaoCostRaw) : existing.backend_cost;
        const now = new Date().toISOString();
        await db
          .prepare(
            "UPDATE quotations SET customer_id=?,status=?,freight_type=?,quotation_date=?,valid_until=?,customer_snapshot=?,cargo_snapshot=?,pricing_snapshot=?,calculated_amount=?,override_amount=?,override_reason=?,final_amount=?,backend_cost=?,notes=?,updated_at=? WHERE id=?",
          )
          .bind(
            customerId,
            status,
            freight,
            quotationDate,
            validUntil || null,
            JSON.stringify(customer),
            JSON.stringify(cargo),
            pricingSnapshot,
            calculatedAmount,
            overrideAmount,
            overrideReason,
            finalAmount,
            niHaoCost,
            String(form.get("notes") ?? ""),
            now,
            id,
          )
          .run();
        await db
          .prepare(
            "INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,new_value,created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            randomUUID(),
            user.id,
            activity,
            "quotations",
            id,
            JSON.stringify({
              quotation_number: existing.quotation_number,
              pricing_changed: pricingChanged,
            }),
            now,
          )
          .run();
        return page("Saved", "", user.name, 303, {
          Location: `${path}?id=${id}`,
        });
      }
      const freight = String(form.get("freight_type") || "");
      if (!["Sea Freight", "Air Freight", "Full Container"].includes(freight))
        throw new AdminError("Choose a valid freight type.");
      const item = String(form.get("item") || "");
      const numeric = (key: string, required = true) => {
        const raw = String(form.get(key) ?? "").trim();
        if (!raw) {
          if (required) throw new AdminError(`${key} is required.`);
          return 0;
        }
        if (!isQuotationNumeric(raw))
          throw new AdminError(`Enter a valid non-negative ${key}.`);
        return Number(raw);
      };
      const weight = freight === "Full Container" ? 0 : numeric("weight"),
        units = numeric("units", false),
        packageQuantity = numeric("package_quantity", false) || 1;
      if (!Number.isInteger(packageQuantity) || packageQuantity < 1)
        throw new AdminError("Quantity of packages must be a whole number of at least 1.");
      let category: SeaCategory | string = "";
      if (freight === "Full Container") {
        category = "Full Container";
      } else if (freight === "Sea Freight") {
        if (!(item in itemCategories))
          throw new AdminError("Choose a valid Sea Freight item.");
        category = itemCategories[item];
      } else {
        if (!airItems.includes(item as AirItem))
          throw new AdminError("Choose a valid Air Freight item.");
        category = item;
      }
      const cbm = freight === "Full Container" ? 0 : numeric("cbm");
      let calc: ReturnType<typeof seaQuote> | ReturnType<typeof airQuote> | { final: number; pricingMethod: string; rateBasis: string };
      if (freight === "Full Container") {
        calc = { final: Number(form.get("manual_rate") || 0), pricingMethod: "Manual full-container all-in rate", rateBasis: "Per container" };
        if (!Number.isFinite(calc.final) || calc.final < 0 || !String(form.get("manual_rate") || "").trim()) throw new AdminError("Enter the full-container all-in rate.");
      } else if (freight === "Sea Freight") {
        calc = seaQuote(category as SeaCategory, cbm, weight, units);
      } else {
        const airItem = item as AirItem;
        const pieceBased =
          airItem === "Mobile Phones" ||
          airItem === "Tablets" ||
          airItem === "Laptop Computers";
        const pieceCount = pieceBased ? units : 1;
        if (pieceBased && (!Number.isInteger(pieceCount) || pieceCount < 1))
          throw new AdminError(
            "Units must be a whole number of at least 1 for Mobile Phones, Tablets, and Laptop Computers.",
          );
        calc = airQuote(airItem, cbm, weight, pieceCount);
      }
      const override = String(form.get("override_amount") || "");
      if (staff && override)
        throw new AdminError("Staff cannot override quotation prices.", 403);
      const final = override ? cents(override) : Math.round(calc.final * 100);
      if (override && !String(form.get("override_reason") || "").trim())
        throw new AdminError("An override reason is required.");
      const niHaoCostRaw = String(form.get("nihao_cost") || "").trim();
      const niHaoCost = niHaoCostRaw ? cents(niHaoCostRaw) : null;
      const id = randomUUID(),
        now = new Date().toISOString(),
        qn = await number(db);
      const customer = {
        name: String(form.get("customer_name") || "").trim(),
        company: String(form.get("company") || ""),
        mobile: String(form.get("mobile") || ""),
        email: String(form.get("email") || "").trim(),
        address: String(form.get("address") || ""),
      };
      if (!customer.name) throw new AdminError("Customer name is required.");
      if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
        throw new AdminError("Enter a valid email address.");
      const customerId = await selectedCustomerId(db, form);
      const status = String(form.get("status") || "");
      if (
        !["Draft", "Sent", "Approved", "Revised", "Cancelled"].includes(status)
      )
        throw new AdminError("Choose a valid quotation status.");
      const cargo = {
        item,
        category,
        description: String(form.get("description") || item),
        quantity: "",
        unitType: "",
        packageQuantity,
        calculatorQuantity: String(form.get("calculator_quantity") || packageQuantity),
        showPackageDimensions: form.get("show_package_dimensions") === "1",
        length: String(form.get("length") || ""),
        width: String(form.get("width") || ""),
        height: String(form.get("height") || ""),
        measurementUnit: String(form.get("measurement_unit") || "cm"),
        cbm,
        weight,
        units,
        supplierName: String(form.get("supplier_name") || "").trim(),
        origin: String(form.get("origin") || ""),
        originWarehouse: String(form.get("origin_warehouse") || "") === "Other / enter manually" ? String(form.get("origin_warehouse_manual") || "").trim() : String(form.get("origin_warehouse") || ""),
        containerSize: freight === "Full Container" ? String(form.get("container_size") || "") : "",
        containerQuantity: freight === "Full Container" ? numeric("container_quantity") : 0,
      };
      await db
        .prepare(
          "INSERT INTO quotations (id,quotation_number,customer_id,status,freight_type,quotation_date,valid_until,prepared_by,customer_snapshot,cargo_snapshot,pricing_snapshot,calculated_amount,override_amount,override_reason,final_amount,backend_cost,additional_cost,delivery_cost,notes,prepared_by_admin_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          qn,
          customerId,
          status,
          freight,
          String(form.get("quotation_date") || date()),
          String(
            form.get("valid_until") ||
              validUntilDate(String(form.get("quotation_date") || date())),
          ),
          user.name,
          JSON.stringify(customer),
          JSON.stringify(cargo),
          JSON.stringify(calc),
          Math.round(calc.final * 100),
          override ? final : null,
          override ? String(form.get("override_reason")) : null,
          final,
          niHaoCost,
          null,
          null,
          String(form.get("notes") ?? ""),
          user.id,
          now,
          now,
        )
        .run();
      await db
        .prepare(
          "INSERT INTO activity_log (id,admin_user_id,action,entity_type,entity_id,new_value,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          randomUUID(),
          user.id,
          action === "duplicate" ? "duplicate" : "create",
          "quotations",
          id,
          JSON.stringify({
            quotation_number: qn,
            calculated_amount: Math.round(calc.final * 100),
            final_amount: final,
          }),
          now,
        )
        .run();
      return page("Saved", "", user.name, 303, {
        Location: `${path}?id=${id}`,
      });
    }
    const edit = url.searchParams.get("edit");
    if (edit) {
      if (!/^[\da-f-]{36}$/i.test(edit))
        throw new AdminError("Invalid quotation ID.");
      const q = await db
        .prepare("SELECT * FROM quotations WHERE id=?")
        .bind(edit)
        .first<Row>();
      if (!q || (staff && String(q.prepared_by_admin_user_id) !== user.id))
        throw new AdminError("Quotation not found.", 404);
      const customers = await quotationCustomers(db);
      const customer = snapshot(q.customer_snapshot).data,
        cargo = snapshot(q.cargo_snapshot).data,
        pricing = snapshot(q.pricing_snapshot).data;
      const savedCategory = String(cargo.category || "");
      const savedSea = {
        ...pricing,
        item: cargo.item,
        category: savedCategory,
        cbm: cargo.cbm,
        weight: cargo.weight,
        cbmRate:
          savedCategory in seaRates
            ? seaRates[savedCategory as SeaCategory].cbmRate
            : null,
        densityRate:
          savedCategory in seaRates
            ? seaRates[savedCategory as SeaCategory].densityRate
            : null,
      };
      const savedAir = {
        ...pricing,
        item: cargo.item,
        airCategory: cargo.item,
        cbm: cargo.cbm,
        weight: cargo.weight,
        quantity: cargo.units,
      };
      const value = (v: unknown) => esc(v);
      const text = (name: string, label: string, v: unknown, type = "text") => {
        const displayLabel = label === "Total CBM" ? "Declared CBM" : label === "Actual Weight (kg)" ? "Declared Weight (kg)" : label;
        return `<label>${displayLabel}<input name="${name}" type="${type}" value="${value(v)}"></label>`;
      };
      const choices = (
        name: string,
        label: string,
        v: unknown,
        options: string[],
      ) =>
        `<label>${label}<select name="${name}">${(name === "freight_type" ? [...new Set([...options, "Full Container"])] : options).map((option) => `<option value="${value(option)}"${String(v) === option ? " selected" : ""}>${value(option)}</option>`).join("")}</select></label>`;
      const itemOptions = Array.from(
        new Set(
          [
            ...Object.keys(itemCategories),
            ...airItems,
            String(cargo.item || ""),
          ].filter(Boolean),
        ),
      );
      return page(
        "Edit quotation",
        `<section><div class="actions"><a class="button" href="${path}?id=${value(q.id)}">Back</a></div><p class="notice">Loaded from the saved quotation. Saving preserves the snapshot unless a pricing-relevant input changes; then it recalculates using the existing pricing engine.</p><form method="post" class="grid"><input type="hidden" name="csrf" value="${value(csrfToken(env, user.id, path))}"><input type="hidden" name="action" value="update"><input type="hidden" name="quotation_id" value="${value(q.id)}"><p class="wide"><strong>Quotation No.</strong> ${value(q.quotation_number)}</p>${choices("status", "Status", q.status, ["Draft", "Sent", "Approved", "Revised", "Cancelled"])}${text("quotation_date", "Quotation date", q.quotation_date, "date")}${text("valid_until", "Valid until", q.valid_until || "", "date")}${customerPicker(customers, String(q.customer_id ?? ""))}${text("customer_name", "Customer name", customer.name)}${text("company", "Company", customer.company)}${text("mobile", "Contact number", customer.mobile)}${text("email", "Email", customer.email, "email")}<label class="wide">Address<textarea name="address">${value(customer.address)}</textarea></label>${text("description", "Customer cargo description", cargo.description)}<section class="wide" data-cargo-details data-sea-categories="${esc(JSON.stringify(itemCategories))}" data-air-items="${esc(JSON.stringify(airItems))}"><h2>2. CARGO DETAILS</h2><div class="grid">${choices("item", "Item / Commodity", cargo.item, itemOptions)}<label>Category<input data-category-output value="${value(cargo.category)}" readonly></label>${text("supplier_name", "Supplier Name", cargo.supplierName)}${text("origin", "Supplier / Origin Location", cargo.origin)}${choices("origin_warehouse", "KargoDoor Warehouse", cargo.originWarehouse, [...originWarehouses])}<label>Declared CBM<input name="cbm" data-cbm-output type="number" min="0" step="any" value="${value(cargo.cbm)}" required><small>Editable — use the supplier's declared package CBM.</small></label>${choices("freight_type", "Freight Type", q.freight_type, ["Sea Freight", "Air Freight"])}${text("weight", "Declared Weight (kg)", cargo.weight, "number")}<label data-units-field>Units<input name="units" type="number" min="0" step="1" value="${value(cargo.units)}"><small>Applicable to Mobile Phones / Computers / Tablets.</small></label></div>${cbmConverter(cargo)}</section>${seaPricingSection("", savedSea)}${airPricingSection("")}${staff ? "" : overrideFields(q.override_amount, q.override_reason, q.backend_cost)}<label class="wide">Admin notes<textarea name="notes">${value(q.notes)}</textarea></label><section class="wide"><h3>Saved pricing snapshot</h3><dl><dt>Final amount</dt><dd>${pesos(q.final_amount)}</dd><dt>Calculated amount</dt><dd>${pesos(q.calculated_amount)}</dd><dt>Override amount</dt><dd>${q.override_amount === null ? "—" : pesos(q.override_amount)}</dd><dt>Override reason</dt><dd>${value(q.override_reason || "—")}</dd><dt>Snapshot</dt><dd>${value(JSON.stringify(pricing))}</dd></dl><p class="muted">This snapshot remains unchanged unless a pricing-relevant input changes; an override remains editable until you clear it.</p></section><p class="wide actions"><button type="button" data-quotation-calculate>CALCULATE</button><button>Save changes</button></p></form><script src="/admin-quotation-cargo.js" defer></script></section>`,
        user.name,
        200,
        {
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        },
        canMutateAdmin(user),
        staff,
      );
    }
    const id = url.searchParams.get("id");
    if (id) {
      if (!/^[\da-f-]{36}$/i.test(id))
        throw new AdminError("Invalid quotation ID.");
      const q = await db
        .prepare("SELECT * FROM quotations WHERE id=?")
        .bind(id)
        .first<Row>();
      if (!q || (staff && String(q.prepared_by_admin_user_id) !== user.id))
        throw new AdminError("Quotation not found.", 404);
      if (url.searchParams.get("archive") === "1") {
        requireAdminDelete(user);
        return page(
          "Archive Quotation",
          `<section><h2>Confirm archive</h2><p>Are you sure you want to archive <strong>${esc(q.quotation_number)}</strong>?</p><p class="muted">The quotation will be removed from normal lists but retained for audit history and linked records.</p><div class="actions"><form method="post" action="${path}"><input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, path))}"><input type="hidden" name="action" value="archive"><input type="hidden" name="quotation_id" value="${esc(id)}"><input type="hidden" name="revision" value="${esc(q.updated_at)}"><input type="hidden" name="confirm" value="yes"><button type="submit">Archive quotation</button></form><a class="button" href="${path}?id=${esc(id)}">Cancel</a></div></section>`,
          user.name,
          200,
          {},
          canMutateAdmin(user),
          staff,
        );
      }
      const linkedCustomer = q.customer_id
        ? await db
            .prepare("SELECT customer_code FROM customers WHERE id=?")
            .bind(q.customer_id)
            .first<Row>()
        : null;
      const accountNumber = String(linkedCustomer?.customer_code ?? "");
      return page(
        "Quotation",
        `<div class="actions"><a class="button" href="${path}?edit=${id}">Edit</a><a class="button" href="/admin/quotations/export?id=${id}">Download PDF</a><form method="post"><input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, path))}"><input type="hidden" name="action" value="duplicate"><input type="hidden" name="quotation_id" value="${esc(id)}"><button>Duplicate</button></form>${canDeleteAdmin(user) ? `<a class="button" href="${path}?id=${esc(id)}&archive=1">Archive quotation</a>` : ""}</div>${customerPreview(q, accountNumber)}${quotationCustomerMessage(q)}${quotationMessageCopyScript()}`,
        user.name,
        200,
        {},
        canMutateAdmin(user),
        staff,
      );
    }
    const q = (url.searchParams.get("q") ?? "").trim(),
      statusFilter = url.searchParams.get("status") ?? "",
      freightFilter = url.searchParams.get("freight_type") ?? "",
      dateFilter = url.searchParams.get("date") ?? "";
    if (
      q.length > 160 ||
      !["", "Draft", "Sent", "Approved", "Revised", "Cancelled"].includes(
        statusFilter,
      ) ||
      !["", "Sea Freight", "Air Freight"].includes(freightFilter) ||
      !["", "today", "7", "30"].includes(dateFilter)
    )
      throw new AdminError("Invalid quotation filter.");
    const since =
      dateFilter === "today"
        ? new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        : dateFilter === "7"
          ? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
          : dateFilter === "30"
            ? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
            : "";
    const rows = (
      await db
        .prepare(
          "SELECT id,quotation_number,quotation_date,freight_type,status,final_amount,customer_snapshot,cargo_snapshot,updated_at,prepared_by_admin_user_id FROM quotations WHERE archived_at IS NULL AND (?=\'\' OR status=?) AND (?=\'\' OR freight_type=?) AND (?=\'\' OR quotation_date>=?) AND (?=\'\' OR instr(lower(quotation_number),lower(?))>0 OR instr(lower(customer_snapshot),lower(?))>0 OR instr(lower(cargo_snapshot),lower(?))>0) ORDER BY updated_at DESC LIMIT 100",
        )
        .bind(
          statusFilter,
          statusFilter,
          freightFilter,
          freightFilter,
          since,
          since,
          q,
          q,
          q,
          q,
        )
        .all<Row>()
    ).results.filter(
      (row) => !staff || String(row.prepared_by_admin_user_id) === user.id,
    );
    const csrf = csrfToken(env, user.id, path);
    const leadId = url.searchParams.get("lead_id") ?? "";
    if (leadId && !/^[\da-f-]{36}$/i.test(leadId)) throw new AdminError("Invalid lead ID.");
    const lead = leadId
      ? await db.prepare("SELECT full_name,phone,email,service_type,cbm,weight_kg,estimated_rate,lead_code FROM leads WHERE id=? AND archived_at IS NULL").bind(leadId).first<Row>()
      : null;
    if (leadId && !lead) throw new AdminError("Lead not found.", 404);
    const customers = await quotationCustomers(db);
    const requestedCustomerId = url.searchParams.get("customer_id") ?? "";
    const createFreight = lead?.service_type === "Air Freight" || url.searchParams.get("freight") === "Air Freight" ? "Air Freight" : "Sea Freight";
    const leadItem = createFreight === "Air Freight" ? "Ordinary Items" : "Bags";
    const leadNotes = lead ? `Website lead ${String(lead.lead_code)}. Public calculator estimate: ${pesos(lead.estimated_rate)}. Confirm quotation details and calculate using the existing quotation workflow.` : "";
    const items = Object.keys(itemCategories)
      .map((x) => `<option value="${esc(x)}"${x === leadItem ? " selected" : ""}>${esc(x)}</option>`)
      .join("");
    const savedQuotations = `<section><h2>Saved quotations</h2><p><a class="button" href="${path}?new=1">Create New Quotation</a></p><form method="get" class="search"><label>Search<input name="q" value="${esc(q)}" placeholder="Quotation, customer, company, cargo"></label><label>Status<select name="status"><option value="">All</option>${["Draft", "Sent", "Approved", "Revised", "Cancelled"].map((value) => `<option${statusFilter === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Freight type<select name="freight_type"><option value="">All</option>${["Sea Freight", "Air Freight"].map((value) => `<option${freightFilter === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Date<select name="date"><option value="">All Dates</option><option value="today"${dateFilter === "today" ? " selected" : ""}>Today</option><option value="7"${dateFilter === "7" ? " selected" : ""}>Last 7 Days</option><option value="30"${dateFilter === "30" ? " selected" : ""}>Last 30 Days</option></select></label><button>Filter</button><a href="${path}">Clear</a></form><details class="admin-collapsible"><summary>Quotation records</summary><div class="table"><table><thead><tr><th>Quotation</th><th>Date</th><th>Customer</th><th>Freight</th><th>Cargo / item</th><th>Total</th><th>Status</th><th>Updated</th></tr></thead><tbody>${rows.map((quotation) => { const customer = snapshot(quotation.customer_snapshot).data; const cargo = snapshot(quotation.cargo_snapshot).data; return `<tr><td><a class="record-identifier" href="${path}?id=${quotation.id}">${esc(quotation.quotation_number)}</a></td><td>${esc(quotation.quotation_date)}</td><td>${esc(detailValue(customer.name))}<br>${esc(detailValue(customer.company))}</td><td>${esc(quotation.freight_type)}</td><td>${esc(detailValue(cargo.description ?? cargo.item))}</td><td>${pesos(quotation.final_amount)}</td><td>${esc(quotation.status)}</td><td>${esc(quotation.updated_at)}</td></tr>`; }).join("")}</tbody></table></div></details></section>`;
    return page(
      "Quotations",
      url.searchParams.get("new") === "1" ? `<section><h2>Create quotation</h2>${lead ? '<p class="notice">Lead details prefilled. Confirm all quotation details before saving.</p>' : ""}<form method="post" class="grid"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="action" value="save"><label>Status<select name="status"><option>Draft</option><option>Sent</option><option>Approved</option><option>Revised</option><option>Cancelled</option></select></label><label>Quotation date<input name="quotation_date" type="date" value="${date()}"></label><label>Valid until<input name="valid_until" type="date" value="${validUntilDate(date())}"></label>${customerPicker(customers, requestedCustomerId)}<label>Customer name *<input name="customer_name" required value="${esc(lead?.full_name ?? "")}"></label><label>Company<input name="company"></label><label>Contact number<input name="mobile" value="${esc(lead?.phone ?? "")}"></label><label>Email<input name="email" type="email" value="${esc(lead?.email ?? "")}"></label><label class="wide">Address<textarea name="address"></textarea></label><label>Customer cargo description<input name="description" value="${lead ? "Website calculator inquiry" : ""}"></label><section class="wide" data-cargo-details data-sea-categories="${esc(JSON.stringify(itemCategories))}" data-air-items="${esc(JSON.stringify(airItems))}"><h2>2. CARGO DETAILS</h2><div class="grid"><label>Item / Commodity<select name="item">${items}${airItems.map((x) => `<option${x === leadItem ? " selected" : ""}>${x}</option>`).join("")}</select></label><label>Category<input data-category-output readonly></label><label>Supplier Name<input name="supplier_name"></label><label>Supplier / Origin Location<input name="origin"></label><label>KargoDoor Warehouse<select name="origin_warehouse">${originWarehouses.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label><label>Declared CBM<input name="cbm" data-cbm-output type="number" min="0" step="any" required value="${esc(lead?.cbm ?? "")}"><small>Editable — use the supplier's declared package CBM.</small></label><label>Freight Type<select name="freight_type"><option${createFreight === "Sea Freight" ? " selected" : ""}>Sea Freight</option><option${createFreight === "Air Freight" ? " selected" : ""}>Air Freight</option></select></label><label>Declared Weight (kg)<input name="weight" type="number" min="0" step="any" required value="${esc(lead?.weight_kg ?? "")}"></label><label data-units-field>Units<input name="units" type="number" min="0" step="1" value="0"><small>Applicable to Mobile Phones / Computers / Tablets.</small></label></div>${cbmConverter()}</section>${seaPricingSection("")}${airPricingSection("")}<label>Override amount<input name="override_amount" type="number" min="0" step=".01"></label><label>Override reason<input name="override_reason"></label><label class="wide">Admin notes<textarea name="notes">${esc(leadNotes)}</textarea></label><p class="wide muted"><strong>INTERNAL CALCULATION — ADMIN USE ONLY.</strong> The saved quotation retains its pricing snapshot. Customer output shows no internal rates, density rules, costs, margins, formulas, or override reason.</p><p class="wide actions"><button type="button" data-quotation-calculate>CALCULATE</button><button>Save Draft</button></p></form><script src="/admin-quotation-cargo.js" defer></script></section>` : savedQuotations,
      user.name,
      200,
      {
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
      canMutateAdmin(user),
      staff,
    );
  } catch (e) {
    const requestedId = new URL(request.url).searchParams.get("id");
    const err =
      e instanceof AdminError
        ? e
        : new AdminError(
            requestedId
              ? "Unable to load quotation details. Please try again."
              : "Admin is unavailable.",
            500,
          );
    return page(
      "Admin error",
      `<p class="notice">${esc(err.message)}</p>${requestedId && err.status >= 500 ? '<p><a class="button" href="/admin/quotations?id=' + esc(requestedId) + '">Retry</a></p>' : ""}`,
      "",
      err.status,
    );
  }
}
