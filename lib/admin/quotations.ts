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
const cbmConverter = (values: Record<string, unknown> = {}) =>
  `<section class="wide cbm-converter" data-cbm-converter><h3>CBM CONVERTER</h3><p class="muted">Optional helper — calculate CBM from package dimensions.</p><div class="grid"><label>Length (L)<input name="length" data-converter-length type="number" min="0" step="any" value="${esc(values.length ?? "")}"></label><label>Width (W)<input name="width" data-converter-width type="number" min="0" step="any" value="${esc(values.width ?? "")}"></label><label>Height (H)<input name="height" data-converter-height type="number" min="0" step="any" value="${esc(values.height ?? "")}"></label><label>Measurement<select name="measurement_unit" data-converter-unit>${["cm", "mm", "m"].map((unit) => `<option value="${unit}"${String(values.measurementUnit ?? "cm") === unit ? " selected" : ""}>${unit}</option>`).join("")}</select></label><label>Quantity<input data-converter-quantity type="number" min="1" step="1" value="1"></label></div><dl><dt>Single Package CBM</dt><dd data-converter-single>—</dd><dt>Total Converted CBM</dt><dd data-converter-total>—</dd></dl><button type="button" data-use-converted-cbm disabled>Use this CBM</button><p class="muted">Total CBM will only change when you click ‘Use this CBM.’</p></section>`;
const seaPricingSection = (
  inputs: string,
  values: Record<string, unknown> = {},
) =>
  `<section class="wide" data-sea-pricing><h3>Sea Freight pricing</h3>${inputs}<dl><dt>Category</dt><dd data-sea-category>${esc(values.category ?? "—")}</dd><dt>Package Tier</dt><dd data-sea-tier>${esc(values.packageTier ?? "—")}</dd><dt>Actual Density (kg/CBM)</dt><dd data-sea-density>${esc(values.density ?? "—")}</dd><dt>CBM Price</dt><dd data-sea-cbm-rate>${esc(values.cbmRate ?? "—")}</dd><dt>Density Rate / kg</dt><dd data-sea-density-rate>${esc(values.densityRate ?? "—")}</dd><dt>Fixed / Base Charge</dt><dd data-sea-base>${esc(values.base ?? "—")}</dd><dt>Density-Based Charge</dt><dd data-sea-density-charge>${esc(values.densityCharge ?? "—")}</dd><dt>Density Rule Applies?</dt><dd data-sea-density-applies>${esc(values.densityApplies === undefined ? "—" : values.densityApplies ? "YES" : "NO")}</dd><dt>Pricing Method</dt><dd data-sea-pricing-method>${esc(values.pricingMethod ?? "—")}</dd><dt>Total Unit Amount</dt><dd data-sea-system>${esc(values.final ?? "—")}</dd></dl></section>`;
const airPricingSection = (inputs: string) =>
  `<section class="wide" data-air-pricing><h3>Air Freight pricing</h3>${inputs}</section>`;

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
  `<section class="wide" data-sea-calculation${saved ? ' data-saved-sea="${esc(JSON.stringify(saved))}"' : ""} hidden><h3>INTERNAL CALCULATION — ADMIN USE ONLY</h3><dl><dt>Item / commodity</dt><dd data-sea-item>—</dd><dt>Category</dt><dd data-sea-category>—</dd><dt>Package / tier</dt><dd data-sea-tier>—</dd><dt>Total CBM</dt><dd data-sea-cbm>—</dd><dt>Actual weight</dt><dd data-sea-weight>—</dd><dt>Density</dt><dd data-sea-density>—</dd><dt>Density threshold</dt><dd>${densityThreshold} kg/CBM</dd><dt>CBM rate</dt><dd data-sea-cbm-rate>—</dd><dt>Volume / base charge</dt><dd data-sea-base>—</dd><dt>Density rate / kg</dt><dd data-sea-density-rate>—</dd><dt>Density-based charge</dt><dd data-sea-density-charge>—</dd><dt>Density rule applies?</dt><dd data-sea-density-applies>—</dd><dt>Pricing method</dt><dd data-sea-pricing-method>—</dd><dt>Total unit amount</dt><dd data-sea-system>—</dd><dt>Override rate</dt><dd data-sea-override>—</dd><dt>Final quoted rate</dt><dd data-sea-final>—</dd></dl><p data-sea-error class="notice" hidden></p></section>`;
const seaCalculationScript = () =>
  `<script>(()=>{const money=value=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value),text=(root,key,value)=>{const node=root.querySelector("[data-sea-"+key+"]");if(node)node.textContent=value;},render=(root,result,override)=>{text(root,"item",result.item);text(root,"category",result.category);text(root,"tier",result.packageTier);text(root,"cbm",result.cbm);text(root,"weight",result.weight+" kg");text(root,"density",Number(result.density).toFixed(2)+" kg/CBM");text(root,"cbm-rate",money(result.cbmRate)+" / CBM");text(root,"base",money(result.base));text(root,"density-rate",result.densityRate===null?"Not applicable":money(result.densityRate)+" / kg");text(root,"density-charge",result.densityRate===null?"Not applicable":money(result.densityCharge));text(root,"density-applies",result.densityApplies?"YES":"NO");text(root,"pricing-method",result.pricingMethod);text(root,"system",money(result.final));const hasOverride=override!==""&&Number.isFinite(Number(override))&&Number(override)>=0;text(root,"override",hasOverride?money(Number(override)):"—");text(root,"final",money(hasOverride?Number(override):result.final));};document.querySelectorAll(\'form.grid\').forEach(form=>{const panel=form.querySelector("[data-sea-calculation]"),freight=form.querySelector(\'select[name="freight_type"]\'),csrf=form.querySelector(\'input[name="csrf"]\'),fields=["item","category","cbm","weight","units","override_amount"].map(name=>form.querySelector("[name="+name+"]"));if(!panel||!freight||!csrf||fields.some(field=>!field))return;const error=panel.querySelector("[data-sea-error]"),[item,category,cbm,weight,units,override]=fields;const toggle=()=>{panel.hidden=freight.value!=="Sea Freight";};const saved=panel.dataset.savedSea;if(freight.value==="Sea Freight"&&saved){try{render(panel,JSON.parse(saved),String(override.value||""));panel.hidden=false;}catch{}}toggle();let timer;const calculate=()=>{toggle();if(panel.hidden)return;const payload={freightType:freight.value,item:item.value,category:category.value,cbm:cbm.value,weight:weight.value,units:units.value};if(!payload.item||!payload.cbm||!payload.weight)return;clearTimeout(timer);timer=setTimeout(async()=>{try{const response=await fetch("/admin/quotations/calculate",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf.value},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok)throw new Error(body.error||"Unable to calculate.");render(panel,body,String(override.value||""));error.hidden=true;}catch(cause){error.textContent=cause instanceof Error?cause.message:"Unable to calculate.";error.hidden=false;}},150);};[freight,item,category,cbm,weight,units].forEach(field=>field.addEventListener(field.name==="freight_type"||field.name==="item"?"change":"input",calculate));override.addEventListener("input",()=>{const system=panel.querySelector("[data-sea-system]")?.textContent;if(system)calculate();});});})();</script>`;
const airCalculationPanel = (saved?: Record<string, unknown>) =>
  `<section class="wide" data-air-calculation${saved ? ' data-saved-air="${esc(JSON.stringify(saved))}"' : ""} hidden><h3>INTERNAL CALCULATION — ADMIN USE ONLY</h3><dl><dt>Item / commodity</dt><dd data-air-item>—</dd><dt>Air category</dt><dd data-air-category>—</dd><dt>Total CBM</dt><dd data-air-cbm>—</dd><dt>Actual weight</dt><dd data-air-weight>—</dd><dt>Volumetric weight</dt><dd data-air-volumetric>—</dd><dt>Billable weight</dt><dd data-air-billable>—</dd><dt>Units / pieces</dt><dd data-air-units>—</dd><dt>Rate</dt><dd data-air-rate>—</dd><dt>System calculated rate</dt><dd data-air-system>—</dd><dt>Override rate</dt><dd data-air-override>—</dd><dt>Final quoted rate</dt><dd data-air-final>—</dd></dl><p data-air-error class="notice" hidden></p></section>`;
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

  const messages: Array<[string, string, string[]]> = [
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
        <textarea id="${esc(id)}" readonly aria-label="${esc(title)} customer message" style="min-height:260px;white-space:pre-wrap">${esc(body)}</textarea>
        <div class="actions">
          <button type="button" class="copy-quotation-message" data-copy-source="${esc(id)}">Copy Message</button>
        </div>
      </details>`;
      })
      .join("")}
  </section>`;
}

const quotationMessageCopyScript = () => `<script>
document.querySelectorAll('.copy-quotation-message').forEach((button)=>{
  button.addEventListener('click',async()=>{
    const source=document.getElementById(button.dataset.copySource);
    if(!source)return;
    try{
      await navigator.clipboard.writeText(source.value);
      button.textContent='Copied!';
    }catch{
      source.select();
      document.execCommand('copy');
      button.textContent='Copied!';
    }
    setTimeout(()=>button.textContent='Copy Message',1600);
  });
});
</script>`;

function customerPreview(q: Row) {
  const customer = snapshot(q.customer_snapshot);
  const cargo = snapshot(q.cargo_snapshot);
  const c = customer.data;
  const shipment = cargo.data;
  const dimensions = [shipment.length, shipment.width, shipment.height]
    .map(detailValue)
    .every((value) => value === "—")
    ? "Not provided"
    : `${detailValue(shipment.length)} × ${detailValue(shipment.width)} × ${detailValue(shipment.height)} ${detailValue(shipment.measurementUnit)}`;
  const warning = customer.valid && cargo.valid
    ? ""
    : '<p class="notice">Some legacy quotation details are unavailable. The saved quotation record is still open and can be edited.</p>';
  return `${warning}<article class="quotation-print"><h2>KARGODOOR PH</h2><h1>QUOTATION</h1><p><strong>Quotation No.</strong> ${esc(detailValue(q.quotation_number))}<br><strong>Date</strong> ${esc(detailValue(q.quotation_date))}${q.valid_until ? `<br><strong>Valid Until</strong> ${esc(q.valid_until)}` : ""}</p><h3>PREPARED FOR</h3><p>${esc(detailValue(c.name))}<br>${esc(detailValue(c.company))}<br>${esc(detailValue(c.mobile))}<br>${esc(detailValue(c.email))}<br>${esc(detailValue(c.address))}</p><h3>SHIPMENT DETAILS</h3><p>${esc(detailValue(shipment.description ?? shipment.item))}<br>Quantity: ${esc(detailValue(shipment.quantity ?? shipment.units))} ${esc(detailValue(shipment.unitType))}<br>Dimensions: ${esc(dimensions)}<br>Total CBM: ${esc(detailValue(shipment.cbm))}<br>Actual Weight: ${esc(detailValue(shipment.weight))}${shipment.weight === undefined || shipment.weight === null || shipment.weight === "" ? "" : " kg"}<br>${esc(detailValue(q.freight_type))}<br>Origin: ${esc(detailValue(shipment.origin))}<br>Destination / Receiving Warehouse: MALABON WAREHOUSE</p><h3>ESTIMATED SHIPPING RATE</h3><p class="quotation-total">${pesos(q.final_amount)}</p><p><strong>${q.freight_type === "Sea Freight" ? "SEA FREIGHT — ALL-IN SHIPPING" : "AIR FREIGHT — ALL-IN SHIPPING"}</strong></p><h3>Terms and Conditions</h3><p>This quotation is based on the cargo information provided. Final charges may change if measurements, CBM, weight, quantity, classification, or shipment details differ. Rates are subject to cargo inspection and final warehouse confirmation. Special handling, duties, taxes, permits, restricted-item, or government charges may apply separately. Transit estimates are not guaranteed. A revised quotation may be issued if cargo details change.</p><p>support@kargodoorph.com · www.kargodoorph.com</p></article>`;
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
          length: decimal("length"),
          width: decimal("width"),
          height: decimal("height"),
          measurementUnit: String(form.get("measurement_unit") || ""),
          cbm: "",
          weight: decimal("weight", true),
          units: decimal("units"),
          supplierName: String(form.get("supplier_name") || "").trim(),
          origin: String(form.get("origin") || ""),
          originWarehouse: String(form.get("origin_warehouse") || ""),
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
        const now = new Date().toISOString();
        await db
          .prepare(
            "UPDATE quotations SET status=?,freight_type=?,quotation_date=?,valid_until=?,customer_snapshot=?,cargo_snapshot=?,pricing_snapshot=?,calculated_amount=?,override_amount=?,override_reason=?,final_amount=?,notes=?,updated_at=? WHERE id=?",
          )
          .bind(
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
        units = numeric("units", false);
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
        length: String(form.get("length") || ""),
        width: String(form.get("width") || ""),
        height: String(form.get("height") || ""),
        measurementUnit: String(form.get("measurement_unit") || "cm"),
        cbm,
        weight,
        units,
        supplierName: String(form.get("supplier_name") || "").trim(),
        origin: String(form.get("origin") || ""),
        originWarehouse: String(form.get("origin_warehouse") || ""),
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
          null,
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
          null,
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
      const text = (name: string, label: string, v: unknown, type = "text") =>
        `<label>${label}<input name="${name}" type="${type}" value="${value(v)}"></label>`;
      const choices = (
        name: string,
        label: string,
        v: unknown,
        options: string[],
      ) =>
        `<label>${label}<select name="${name}">${options.map((option) => `<option value="${value(option)}"${String(v) === option ? " selected" : ""}>${value(option)}</option>`).join("")}</select></label>`;
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
        `<section><div class="actions"><a class="button" href="${path}?id=${value(q.id)}">Back</a></div><p class="notice">Loaded from the saved quotation. Saving preserves the snapshot unless a pricing-relevant input changes; then it recalculates using the existing pricing engine.</p><form method="post" class="grid"><input type="hidden" name="csrf" value="${value(csrfToken(env, user.id, path))}"><input type="hidden" name="action" value="update"><input type="hidden" name="quotation_id" value="${value(q.id)}"><p class="wide"><strong>Quotation No.</strong> ${value(q.quotation_number)}</p>${choices("status", "Status", q.status, ["Draft", "Sent", "Approved", "Revised", "Cancelled"])}${text("quotation_date", "Quotation date", q.quotation_date, "date")}${text("valid_until", "Valid until", q.valid_until || "", "date")}${text("customer_name", "Customer name", customer.name)}${text("company", "Company", customer.company)}${text("mobile", "Contact number", customer.mobile)}${text("email", "Email", customer.email, "email")}<label class="wide">Address<textarea name="address">${value(customer.address)}</textarea></label>${text("description", "Customer cargo description", cargo.description)}<section class="wide" data-cargo-details data-sea-categories="${esc(JSON.stringify(itemCategories))}" data-air-items="${esc(JSON.stringify(airItems))}"><h2>2. CARGO DETAILS</h2><div class="grid">${choices("item", "Item / Commodity", cargo.item, itemOptions)}<label>Category<input data-category-output value="${value(cargo.category)}" readonly></label>${text("supplier_name", "Supplier Name", cargo.supplierName)}${text("origin", "Supplier / Origin Location", cargo.origin)}${choices("origin_warehouse", "KargoDoor Warehouse", cargo.originWarehouse, [...originWarehouses])}<label>Total CBM<input name="cbm" data-cbm-output type="number" min="0" step="any" value="${value(cargo.cbm)}" required><small>Editable — use confirmed total package CBM when provided by supplier.</small></label>${choices("freight_type", "Freight Type", q.freight_type, ["Sea Freight", "Air Freight"])}${text("weight", "Actual Weight (kg)", cargo.weight, "number")}<label data-units-field>Units<input name="units" type="number" min="0" step="1" value="${value(cargo.units)}"><small>Applicable to Mobile Phones / Computers / Tablets.</small></label></div>${cbmConverter(cargo)}</section>${seaPricingSection("", savedSea)}${airPricingSection("")}<label class="wide">Admin notes<textarea name="notes">${value(q.notes)}</textarea></label><section class="wide"><h3>Saved pricing snapshot</h3><dl><dt>Final amount</dt><dd>${pesos(q.final_amount)}</dd><dt>Calculated amount</dt><dd>${pesos(q.calculated_amount)}</dd><dt>Override amount</dt><dd>${q.override_amount === null ? "—" : pesos(q.override_amount)}</dd><dt>Override reason</dt><dd>${value(q.override_reason || "—")}</dd><dt>Snapshot</dt><dd>${value(JSON.stringify(pricing))}</dd></dl><p class="muted">This snapshot remains unchanged unless a pricing-relevant input is changed and saved. A recalculation clears any prior override so it must be deliberately re-entered.</p></section><p class="wide actions"><button type="button" data-quotation-calculate>CALCULATE</button><button>Save changes</button></p></form><script src="/admin-quotation-cargo.js" defer></script></section>`,
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
      return page(
        "Quotation",
        `<div class="actions"><a class="button" href="${path}">Back</a><a class="button" href="${path}?edit=${id}">Edit</a><a class="button" href="/admin/quotations/export?id=${id}">Download PDF</a><a class="button" href="/admin/quotations/image?id=${id}">Download Image</a><form method="post"><input type="hidden" name="csrf" value="${esc(csrfToken(env, user.id, path))}"><input type="hidden" name="action" value="duplicate"><input type="hidden" name="quotation_id" value="${esc(id)}"><button>Duplicate</button></form><button onclick="print()">Print / Save PDF</button>${canDeleteAdmin(user) ? `<a class="button" href="${path}?id=${esc(id)}&archive=1">Archive quotation</a>` : ""}</div><details class="admin-collapsible" open>
  <summary>Quotation details</summary>
  ${customerPreview(q)}
  ${quotationCustomerMessage(q)}
  ${quotationMessageCopyScript()}
</details>`,
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
    const createFreight = lead?.service_type === "Air Freight" || url.searchParams.get("freight") === "Air Freight" ? "Air Freight" : "Sea Freight";
    const leadItem = createFreight === "Air Freight" ? "Ordinary Items" : "Bags";
    const leadNotes = lead ? `Website lead ${String(lead.lead_code)}. Public calculator estimate: ${pesos(lead.estimated_rate)}. Confirm quotation details and calculate using the existing quotation workflow.` : "";
    const items = Object.keys(itemCategories)
      .map((x) => `<option value="${esc(x)}"${x === leadItem ? " selected" : ""}>${esc(x)}</option>`)
      .join("");
    return page(
      "Quotations",
      `<section><h2>Saved quotations</h2><p><a class="button" href="${path}?new=1">Create New Quotation</a></p><form method="get" class="search"><label>Search<input name="q" value="${esc(q)}" placeholder="Quotation, customer, company, cargo"></label><label>Status<select name="status"><option value="">All</option>${["Draft", "Sent", "Approved", "Revised", "Cancelled"].map((v) => `<option${statusFilter === v ? " selected" : ""}>${v}</option>`).join("")}</select></label><label>Freight type<select name="freight_type"><option value="">All</option>${["Sea Freight", "Air Freight"].map((v) => `<option${freightFilter === v ? " selected" : ""}>${v}</option>`).join("")}</select></label><label>Date<select name="date"><option value="">All Dates</option><option value="today"${dateFilter === "today" ? " selected" : ""}>Today</option><option value="7"${dateFilter === "7" ? " selected" : ""}>Last 7 Days</option><option value="30"${dateFilter === "30" ? " selected" : ""}>Last 30 Days</option></select></label><button>Filter</button><a href="${path}">Clear</a></form><details class="admin-collapsible"><summary>Quotation records</summary><div class="table"><table><thead><tr><th>Quotation</th><th>Date</th><th>Customer</th><th>Freight</th><th>Cargo / item</th><th>Total</th><th>Status</th><th>Updated</th></tr></thead><tbody>${rows
        .map((q) => {
          const customer = snapshot(q.customer_snapshot).data;
          const cargo = snapshot(q.cargo_snapshot).data;
          return `<tr><td><a href="${path}?id=${q.id}">${esc(q.quotation_number)}</a></td><td>${esc(q.quotation_date)}</td><td>${esc(detailValue(customer.name))}<br>${esc(detailValue(customer.company))}</td><td>${esc(q.freight_type)}</td><td>${esc(detailValue(cargo.description ?? cargo.item))}</td><td>${pesos(q.final_amount)}</td><td>${esc(q.status)}</td><td>${esc(q.updated_at)}</td></tr>`;
        })
        .join(
          "",
        )}</tbody></table></div></details></section>${url.searchParams.get("new") === "1" ? `<section><h2>Create quotation</h2>${lead ? '<p class="notice">Lead details prefilled. Confirm all quotation details before saving.</p>' : ""}<form method="post" class="grid"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="action" value="save"><label>Status<select name="status"><option>Draft</option><option>Sent</option><option>Approved</option><option>Revised</option><option>Cancelled</option></select></label><label>Quotation date<input name="quotation_date" type="date" value="${date()}"></label><label>Valid until<input name="valid_until" type="date" value="${validUntilDate(date())}"></label><label>Customer name *<input name="customer_name" required value="${esc(lead?.full_name ?? "")}"></label><label>Company<input name="company"></label><label>Contact number<input name="mobile" value="${esc(lead?.phone ?? "")}"></label><label>Email<input name="email" type="email" value="${esc(lead?.email ?? "")}"></label><label class="wide">Address<textarea name="address"></textarea></label><label>Customer cargo description<input name="description" value="${lead ? "Website calculator inquiry" : ""}"></label><section class="wide" data-cargo-details data-sea-categories="${esc(JSON.stringify(itemCategories))}" data-air-items="${esc(JSON.stringify(airItems))}"><h2>2. CARGO DETAILS</h2><div class="grid"><label>Item / Commodity<select name="item">${items}${airItems.map((x) => `<option${x === leadItem ? " selected" : ""}>${x}</option>`).join("")}</select></label><label>Category<input data-category-output readonly></label><label>Supplier Name<input name="supplier_name"></label><label>Supplier / Origin Location<input name="origin"></label><label>KargoDoor Warehouse<select name="origin_warehouse">${originWarehouses.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label><label>Total CBM<input name="cbm" data-cbm-output type="number" min="0" step="any" required value="${esc(lead?.cbm ?? "")}"><small>Editable — use confirmed total package CBM when provided by supplier.</small></label><label>Freight Type<select name="freight_type"><option${createFreight === "Sea Freight" ? " selected" : ""}>Sea Freight</option><option${createFreight === "Air Freight" ? " selected" : ""}>Air Freight</option></select></label><label>Actual Weight (kg)<input name="weight" type="number" min="0" step="any" required value="${esc(lead?.weight_kg ?? "")}"></label><label data-units-field>Units<input name="units" type="number" min="0" step="1" value="0"><small>Applicable to Mobile Phones / Computers / Tablets.</small></label></div>${cbmConverter()}</section>${seaPricingSection("")}${airPricingSection("")}<label>Override amount<input name="override_amount" type="number" min="0" step=".01"></label><label>Override reason<input name="override_reason"></label><label class="wide">Admin notes<textarea name="notes">${esc(leadNotes)}</textarea></label><p class="wide muted"><strong>INTERNAL CALCULATION — ADMIN USE ONLY.</strong> The saved quotation retains its pricing snapshot. Customer output shows no internal rates, density rules, costs, margins, formulas, or override reason.</p><p class="wide actions"><button type="button" data-quotation-calculate>CALCULATE</button><button>Save Draft</button></p></form><script src="/admin-quotation-cargo.js" defer></script></section>` : ""}`,
      user.name,
      200,
      url.searchParams.get("new") === "1"
        ? {
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
          }
        : {},
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
