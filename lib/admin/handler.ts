import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { ZodError } from "zod";

import {
  authenticate,
  AdminError,
  canonicalOrigin,
  adminOriginAllowed,
  csrfToken,
  checkCsrf,
  type AdminEnv,
  canMutateAdmin,
  canDeleteAdmin,
  requireAdminDelete,
  canManageStaffRecords,
  isRestrictedStaff,
  requireAdminMutation,
  requireOperationalAdmin,
  secureHeaders,
} from "./security";

import {
  statuses,
  seaFreightStatuses,
  airFreightStatuses,
  legacyShipmentStatuses,
  seaCargoItems,
  shipmentCargoCategory,
  warehouses,
  schemaKeys,
  parseForm,
  type Entity,
  type RecordData,
} from "./validation";

import { financeDashboard } from "./finance-summary";
import { financeCsv } from "./finance-report";
import { expensesPage, mutateExpense } from "./expenses";
import { moneyLedgerPage } from "./money-ledger";
import { deliveryPaymentSection, readDeliveryPayment, recordDeliveryPayment } from "./delivery-payment";
import { financeCashPage, mutateFinanceCash } from "./finance-cash";
import { financeAccountsPage } from "./finance-accounts";
import { saveRecord, archiveOrCancelRecord } from "./data";
import { page, esc, pesos, input, select, hidden, niHaoSourceTag } from "./ui";
import { dashboard, finance, activity, saveStaffFollowUp } from "./reports";
import { createPortal, disablePortal, portalFor, portalStatus, resetPortal } from "./customer-portal";
import { notificationKeyFor, shipmentStatusMessages } from "./customer-messages";
import { messageList } from "./message-list";
import { copyButton, copyScript, customerPortalAccessMessage, customerWelcomeMessage, nihaoAddressBook, shipmentShippingInstructions, warehouseAddress } from "./shipping-instructions";
import { leadsPage } from "./leads";
import { manualShipmentRate, resolveManualShipmentCharge, resolveQuotationShipmentCharge, syncVerifiedFreightToInvoice, verifiedShipmentFreight } from "./shipment-verified-pricing";
import { airItems, itemCategories } from "./quotation-pricing";
import { cargoCategory, cargoCategorySql, cargoItemSql, shipmentCargo, type ShipmentCargo } from "./shipment-cargo";
import { resolveNiHaoCost, shipmentNiHaoEstimate, type NiHaoEstimate } from "./nihao-estimate";
import { lastNiHaoTransferFee, niHaoExpenseCategory, niHaoPaymentSection, readNiHaoPayment, recordNiHaoPayment } from "./nihao-payment";
import { arrivalWindow, arrivalWindowDone, formatArrivalWindow, shortArrivalWindow } from "./arrival-window";
import { readShipmentStatement, shipmentStatementPdf, shipmentsLedgerCsv, statementFilename } from "./shipment-statement";
import { autoDraftInvoice } from "./billing";
import { readShipmentBilling, readShipmentPayments, recordShipmentPayment, shipmentPaymentSection, shipmentPaymentsList } from "./shipment-payment";
import { readTransferFeesPaid, recordGcashTransfer, splitFreightCharge, transferFeeSection, transferFeesPaidSummary } from "./transfer-fees";
import { proofCell, proofCss, readProofs } from "./payment-proof";
import { detachForm } from "./detached-form";
import { niHaoDetailsBox, niHaoDetailsCss, readNiHaoDetails, saveNiHaoDetails, takeNiHaoDetails } from "./nihao-details";

/** Ni Hao cost input with the system estimate shown under it. Clearing the box saves the estimate. */
const niHaoCostField = (record: RecordData, estimate: NiHaoEstimate | null) => {
  const field = input("nihao_cost", "Ni Hao freight cost (PHP)", record, "text", false, 30);
  const tag = record.nihao_cost === null || record.nihao_cost === undefined ? "" : niHaoSourceTag(record.nihao_cost_source);
  const hint = estimate
    ? `Auto from Ni Hao rates: ${pesos(estimate.cost)} · ${esc(estimate.basis)}. If Ni Hao quotes a different amount, type it in. Clear the box to go back to the estimate.`
    : "No estimate yet: needs a sea category or air item (from the quotation, or the Item / Commodity above for a shipment added by hand). Type Ni Hao's cost if you have it.";
  const auto = record.nihao_cost === null || record.nihao_cost === undefined || record.nihao_cost_source === "estimate";
  return field
    .replace('name="nihao_cost"', `name="nihao_cost" data-live-amount="nihao"${auto ? ` data-auto="${esc(record.nihao_cost === null || record.nihao_cost === undefined ? "" : (Number(record.nihao_cost) / 100).toFixed(2))}"` : ""}`)
    .replace("</label>", ` ${tag}<small class="muted" style="display:block" data-live-hint="nihao">${hint}</small></label>`);
};

/** Items priced per piece: only these show the Units box (public/admin-shipment-pricing.js keeps the same list). */
const unitItems = new Set(["Mobile phones", "Computers", "Tablets", "Mobile Phones", "Laptop Computers"]);

/** Cargo details for a shipment added by hand (no source quotation), laid out like the quotation's. */
const manualCargoFields = (record: RecordData) => {
  const item = String(record.cargo_item ?? "");
  const option = (value: string) => `<option value="${esc(value)}"${item === value ? " selected" : ""}>${esc(value)}</option>`;
  return `<label class="wide">Customer cargo description<input name="cargo_description" type="text" value="${esc(record.cargo_description)}" maxlength="200" placeholder="e.g. Kitchen organizers, 3 cartons"><small class="muted" style="display:block">Shown to the customer as the cargo, like on a quotation.</small></label>
    <label>Item / Commodity<select name="cargo_item" data-shipment-cargo-item data-sea-categories="${esc(JSON.stringify(itemCategories))}"><option value="">Choose an item</option><optgroup label="Sea Freight" data-service="Sea Freight">${seaCargoItems.map(option).join("")}</optgroup><optgroup label="Air Freight" data-service="Air Freight">${airItems.map(option).join("")}</optgroup></select><small class="muted" style="display:block">Sets the category used for the KargoDoor charge and the Ni Hao estimate.</small></label>
    <label>Category<input data-shipment-cargo-category value="${esc(record.cargo_category)}" readonly></label>
    <label data-optional-units${record.cargo_quantity || unitItems.has(item) ? "" : " hidden"}>Units<input name="cargo_quantity" type="number" min="1" step="1" maxlength="10" value="${esc(record.cargo_quantity)}"><small class="muted" style="display:block">Applicable to Mobile Phones / Computers / Tablets.</small></label>`;
};

const chargeSourceTag = (source: unknown) =>
  source === "rate"
    ? `<span style="display:inline-block;font-size:.75rem;padding:1px 8px;border-radius:999px;background:#fff4d6;color:#9a5b00">Auto from rates</span>`
    : source === "manual"
      ? `<span style="display:inline-block;font-size:.75rem;padding:1px 8px;border-radius:999px;background:#e3f5ea;color:#1d6b3a">Typed in</span>`
      : "";

/** KargoDoor freight charge input. Hand-added shipments may leave it blank to use the KargoDoor rates. */
const shippingChargeField = (record: RecordData) => {
  if (record.source_quotation_id) {
    // Quotation shipments: the quotation's charge until the warehouse verifies the size, then it follows the verified freight unless typed over.
    const auto = record.shipping_charge_source !== "manual";
    const amount = record.shipping_charge === null || record.shipping_charge === undefined ? "" : (Number(record.shipping_charge) / 100).toFixed(2);
    return input("shipping_charge", "KargoDoor freight charge (PHP)", record, "text", false, 30)
      .replace('name="shipping_charge"', `name="shipping_charge" data-live-amount="kargodoor" data-quotation${auto ? ` data-auto="${esc(amount)}"` : ""}`)
      .replace("</label>", ` ${chargeSourceTag(record.shipping_charge_source)}<small class="muted" style="display:block" data-live-hint="kargodoor">From the quotation. When you enter the verified CBM and weight it is recalculated from the KargoDoor rates, like the Ni Hao cost. Type an amount to override it; clear the box to go back to the rate.</small></label>`);
  }
  const field = input("shipping_charge", "KargoDoor freight charge (PHP)", record, "text", false, 30);
  const rate = manualShipmentRate(record);
  const hint = rate
    ? `From KargoDoor rates: ${pesos(rate.cost)} · ${esc(rate.basis)}. It updates by itself when the size or item changes. Type an amount to override it; clear the box to go back to the rate.`
    : "Computed from the KargoDoor rates once an Item / Commodity, CBM and weight are filled in. Or type the charge.";
  const auto = record.shipping_charge === null || record.shipping_charge === undefined || record.shipping_charge_source === "rate";
  return field
    .replace('name="shipping_charge"', `name="shipping_charge" data-live-amount="kargodoor"${auto ? ` data-auto="${esc(record.shipping_charge === null || record.shipping_charge === undefined ? "" : (Number(record.shipping_charge) / 100).toFixed(2))}"` : ""}`)
    .replace("</label>", ` ${chargeSourceTag(record.shipping_charge_source)}<small class="muted" style="display:block" data-live-hint="kargodoor">${hint}</small></label>`);
};

/** Status choices for a shipment's service. Air Freight gets Air Transit; an older status it already has stays selectable. */
const shipmentStatusOptions = (record: RecordData): readonly string[] => {
  if (record.service_type === "Sea Freight") return seaFreightStatuses;
  if (record.service_type !== "Air Freight") return statuses;
  const current = String(record.status ?? "");
  return (legacyShipmentStatuses as readonly string[]).includes(current) ? [...airFreightStatuses, current] : airFreightStatuses;
};

/** Shipment form page: like the default admin policy, plus fetch to this origin for the live estimate. */
const shipmentFormCsp =
  "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

/** Read-only estimated arrival shown right after the CH warehouse received date in Edit shipment; /admin-arrival-window.js keeps it current. */
const arrivalEstimateField = (record: RecordData) => {
  const window = arrivalWindow(record.service_type, record.warehouse_received_date);
  return `<div class="arrival-estimate" data-arrival-estimate${record.status === "Cancelled" ? " hidden" : ""}>
    <span class="arrival-estimate-label">Estimated arrival</span>
    <output data-arrival-estimate-value>${window ? esc(formatArrivalWindow(window)) : "Enter the CH warehouse received date"}</output>
    <small class="muted" data-arrival-estimate-note>${window ? `Estimate only · ${esc(window.span)} after CH warehouse received date` : "Sea and FCL: 3–5 weeks after · Air: 5–7 days after"}</small>
  </div>
  <style>.arrival-estimate{display:flex;flex-direction:column;gap:4px;padding:10px 14px;border:1px dashed #94a3b8;border-radius:12px;background:#f8fafc}.arrival-estimate[hidden],label[data-show-status][hidden]{display:none}.arrival-estimate-label{font-weight:600}.arrival-estimate output{font-weight:600;color:#1e3a8a}</style>`;
};

/** Green (KargoDoor, money in) and red (Ni Hao, money out) parts of the Edit shipment form. */
const shipmentMoneyCss = `<style>
.shipment-money{border:1.5px solid;border-radius:16px;padding:20px 22px}
.shipment-money>h3{margin:0 0 14px;font-size:1.15rem;display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.shipment-money-tag{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:3px 10px;color:#fff}
.shipment-money input:not(.k-readonly),.shipment-money select,.shipment-money textarea{background:#fff}
.shipment-pay-box{margin-top:18px;padding:16px 18px;border:1.5px solid;border-radius:12px;background:#fff;scroll-margin-top:20px}
.shipment-pay-box h4{margin:0 0 4px;font-size:1rem}
.shipment-pay-box>p{font-size:.92rem}
.shipment-money-kd{background:#e8f6ec;border-color:#a9dbb8}
.shipment-money-kd>h3,.shipment-money-kd h4{color:#17643a}
.shipment-money-kd .shipment-money-tag{background:#1d8a46}
.shipment-money-kd .shipment-pay-box{border-color:#a9dbb8}
html body .shipment-money-kd .shipment-pay-box button{background:linear-gradient(135deg,#17643a,#1d8a46);box-shadow:0 10px 20px -12px rgba(23,100,58,.8)}
.shipment-money-nh{background:#fdecec;border-color:#f0aaa4}
.shipment-money-nh>h3,.shipment-money-nh h4{color:#a3261f}
.shipment-money-nh .shipment-money-tag{background:#c62828}
.shipment-money-nh .shipment-pay-box{border-color:#f0aaa4}
html body .shipment-money-nh .shipment-pay-box button{background:linear-gradient(135deg,#a3261f,#d33a2c);box-shadow:0 10px 20px -12px rgba(163,38,31,.8)}
@media(max-width:520px){.shipment-money{padding:14px}.shipment-pay-box{padding:12px}}
.compact-record-form label[hidden]{display:none!important}
/* Phone: one column that never grows wider than the screen (a wide table used to stretch it). */
@media(max-width:760px){.compact-record-form .grid{grid-template-columns:minmax(0,1fr)!important}.compact-record-form .grid>*{min-width:0}
.shipment-payments-received .table table{min-width:0!important}.shipment-payments-received thead{display:none}
.shipment-payments-received tr{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;padding:10px 0;border-bottom:1px solid #d5e4ed}
.shipment-payments-received td{display:contents}.shipment-payments-received td::before{content:attr(data-label);font-size:.78rem;color:#466177;align-self:center}
.nihao-file-pick input{max-width:100%}}
/* Two tabs: the shipment and KargoDoor money, and Ni Hao (details, file, payment). public/admin-shipment-tabs.js turns them on. */
.shipment-tabs{display:none;gap:8px;margin:0 0 16px;padding:5px;border-radius:999px;background:#eef3fb;border:1px solid #d5e4ed}
form.shipment-tabs-on .shipment-tabs{display:flex}
.shipment-tabs button{flex:1;background:transparent!important;color:#154876!important;box-shadow:none!important;border-radius:999px;padding:10px 14px;font-weight:700;transform:none!important}
.shipment-tabs button[aria-selected="true"]{background:#fff!important;box-shadow:0 4px 12px -6px rgba(0,40,120,.35)!important}
.shipment-tabs button[data-tab="main"][aria-selected="true"]{color:#17643a!important}
.shipment-tabs button[data-tab="nihao"][aria-selected="true"]{color:#a3261f!important}
.shipment-tabs small{display:block;font-weight:600;font-size:.75rem;opacity:.8}
form.shipment-tabs-on[data-tab="main"] .shipment-money-nh{display:none}
form.shipment-tabs-on[data-tab="nihao"]>.grid>:not(.shipment-money-nh),form.shipment-tabs-on[data-tab="nihao"] .shipment-cargo-note{display:none}
</style>`;

/** JSON with the KargoDoor charge (hand-added shipments) and Ni Hao estimate for the values on the shipment form. */
async function shipmentLiveEstimate(db: D1Database, params: URLSearchParams) {
  const id = params.get("id") ?? "";
  if (id && !/^[\da-f-]{36}$/i.test(id)) throw new AdminError("Invalid record ID.");
  const saved = id
    ? await db.prepare("SELECT source_quotation_id, tracking_remarks FROM shipments WHERE id = ?").bind(id).first<RecordData>()
    : null;
  if (id && !saved) throw new AdminError("Record not found.", 404);
  const number = (key: string) => {
    const value = (params.get(key) ?? "").trim().replaceAll(",", "");
    return value && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  };
  const serviceType = params.get("service_type") ?? "";
  const cargoItem = params.get("cargo_item") || null;
  const verifiedCbm = number("verified_cbm"), verifiedWeight = number("verified_weight_kg");
  const measured = verifiedCbm !== null && verifiedWeight !== null;
  const values: RecordData = {
    service_type: serviceType,
    cbm: number("cbm") ?? 0,
    weight_kg: number("weight_kg") ?? 0,
    verified_cbm: measured ? verifiedCbm : null,
    verified_weight_kg: measured ? verifiedWeight : null,
    tracking_remarks: params.get("tracking_remarks") ?? (saved ? saved.tracking_remarks : null),
  };
  if (!saved?.source_quotation_id) {
    values.cargo_item = cargoItem;
    values.cargo_category = shipmentCargoCategory(serviceType, cargoItem);
    values.cargo_quantity = number("cargo_quantity");
  }
  let kargodoor: { cost: number; basis: string } | null = null;
  if (!saved?.source_quotation_id) {
    kargodoor = manualShipmentRate(values);
  } else if (measured) {
    try {
      const freight = await verifiedShipmentFreight(db, id, verifiedCbm, verifiedWeight);
      if (freight) kargodoor = { cost: freight.shippingCharge, basis: `${serviceType === "Air Freight" ? "Air" : "Sea"} · from the quotation · verified size` };
    } catch {
      kargodoor = null;
    }
  }
  const nihao = await shipmentNiHaoEstimate(db, id, values);
  const amount = (estimate: { cost: number; basis: string } | null) =>
    estimate ? { amount: (estimate.cost / 100).toFixed(2), label: `${pesos(estimate.cost)} · ${estimate.basis}` } : null;
  return new Response(JSON.stringify({ kargodoor: amount(kargodoor), nihao: amount(nihao), category: values.cargo_category ?? null }), {
    headers: { ...secureHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

const labels: Record<string, string> = {
  nihao_cost: "Ni Hao freight cost",
  shipping_charge: "KargoDoor freight charge",
  delivery_charge: "Delivery charge",
  china_warehouse: "Origin warehouse",
  customer_code: "Account number",
  full_name: "Full name",
  company_name: "Company",
  mobile: "Mobile",
  email: "Email",
  address: "Address",
  notes: "Notes",

  tracking_number: "Tracking number",
  cargo_item: "Cargo / Item",
  cargo_category: "Category",
  service_type: "Service type",
  warehouse_received_date: "CH warehouse received date",
  departure_date: "Departure date",
  status: "Status",
  estimated_arrival: "Estimated arrival",
  arrival_window: "Est. arrival",
  actual_arrival: "Malabon warehouse received date",
  delivered_date: "Delivered date",
  tracking_remarks: "Tracking remarks",
  cargo_quantity: "Units",
  payment_status: "Payment status",
  nihao_payment: "Ni Hao payment",
  cbm: "Declared CBM",
  weight_kg: "Declared weight (kg)",
  supplier_waybill_number: "Supplier waybill number",
  supplier_courier: "Supplier courier",
  verified_cbm: "Verified CBM",
  verified_weight_kg: "Verified weight (kg)",

  created_at: "Created",
  updated_at: "Updated",
};

function validateFormOrigin(
  request: Request,
  env: AdminEnv,
) {
  const requestOrigin = new URL(request.url).origin;

  if (!adminOriginAllowed(env, requestOrigin)) {
    throw new AdminError(
      "Admin request origin is invalid.",
      403,
    );
  }

  const fetchSite =
    request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    throw new AdminError(
      "Cross-site form submission rejected.",
      403,
    );
  }

  const originHeader =
    request.headers.get("origin");

  if (!originHeader || originHeader === "null") {
    return;
  }

  let submittedOrigin: string;

  try {
    submittedOrigin =
      new URL(originHeader).origin;
  } catch {
    throw new AdminError(
      "Invalid form origin.",
      403,
    );
  }

  if (submittedOrigin !== requestOrigin) {
    throw new AdminError(
      "Cross-site form submission rejected.",
      403,
    );
  }
}

export async function handleAdmin(
  request: Request,
  view?: Entity | "finance" | "finance/expenses" | "finance/cash" | "finance/export" | "finance/reports" | "finance/accounts" | "finance/ledger" | "activity" | "leads" | "customer-preview",
) {
  let localChallenge = false;

  try {
    const { env: cf } =
      await getCloudflareContext();

    const env =
      cf as unknown as AdminEnv;

    localChallenge = env.ADMIN_LOCAL_DEV === "true";

    const user =
      await authenticate(request, env);
    const canWrite = canMutateAdmin(user);
    const staff = isRestrictedStaff(user);

    const db = env.ADMIN_DB;
    const url = new URL(request.url);

    if (view === "leads") return await leadsPage(request, env);

    const entity =
      view === "customers" ||
      view === "shipments"
        ? view
        : undefined;

    const path = view
      ? `/admin/${view}`
      : "/admin/dashboard";

    if (staff && view !== "finance/expenses") {
      throw new AdminError("This account can access only Quotations and Expenses.", 403);
    }
    if (!canWrite && (view === "activity" || view === "finance/export")) {
      requireOperationalAdmin(user);
    }
    if (url.searchParams.has("archive")) {
      requireAdminDelete(user);
    }
    if (!canWrite && !staff && ["new", "edit"].some((key) => url.searchParams.has(key))) {
      if (!canWrite && !(staff && view === "finance/expenses")) requireAdminMutation(user);
    }

    if (
      url.pathname !== path &&
      url.pathname !== `${path}/`
    ) {
      throw new AdminError(
        "Admin page not found.",
        404,
      );
    }

    if (
      request.method !== "GET" &&
      request.method !== "POST"
    ) {
      throw new AdminError(
        "Method not allowed.",
        405,
      );
    }

    if (view === "customer-preview") {
      const customerId = url.searchParams.get("customer_id") ?? "";
      if (!/^[\da-f-]{36}$/i.test(customerId)) throw new AdminError("Choose a valid customer to preview.");
      const customer = await db.prepare("SELECT full_name,customer_code FROM customers WHERE id=? AND archived_at IS NULL").bind(customerId).first<RecordData>();
      if (!customer) throw new AdminError("Customer not found.", 404);
      const shipmentRows = (await db.prepare(`SELECT s.tracking_number,s.service_type,s.cbm,s.weight_kg,s.status,s.shipping_charge,s.delivery_charge,
        i.delivery_charge AS invoice_delivery_charge,i.status AS invoice_status,i.total AS invoice_total,i.other_charge AS invoice_other_charge,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id AND p.customer_id=s.customer_id),0) AS payments_total
        FROM shipments s LEFT JOIN invoices i ON i.shipment_id=s.id AND i.customer_id=s.customer_id AND i.status!='Void' AND i.archived_at IS NULL
        WHERE s.customer_id=? AND s.archived_at IS NULL ORDER BY s.created_at DESC`).bind(customerId).all<RecordData>()).results;
      const row = (shipment: RecordData) => {
        const invoiceDue = Number(shipment.invoice_total ?? 0) + Number(shipment.invoice_other_charge ?? 0);
        const paid = shipment.invoice_status === "Paid" && Number(shipment.payments_total ?? 0) >= invoiceDue;
        const delivery = shipment.invoice_status && shipment.invoice_status !== "Void" && shipment.invoice_delivery_charge !== null ? shipment.invoice_delivery_charge : shipment.delivery_charge;
        const measurement = shipment.service_type === "Sea Freight" ? Number(shipment.cbm) > 0 ? `${Number(shipment.cbm).toLocaleString("en-PH", { maximumFractionDigits: 3 })} CBM` : "—" : Number(shipment.weight_kg) > 0 ? `${Number(shipment.weight_kg).toLocaleString("en-PH", { maximumFractionDigits: 2 })} kg` : "—";
        return `<tr><td>${esc(shipment.tracking_number)}</td><td>${esc(shipment.status)}</td><td>${esc(shipment.service_type)}</td><td>${esc(measurement)}</td><td>${pesos(shipment.shipping_charge)}</td><td>${pesos(delivery)}</td><td><strong>${paid ? "PAID" : "UNPAID"}</strong></td></tr>`;
      };
      const active = shipmentRows.filter((shipment) => shipment.status !== "Delivered" && shipment.status !== "Cancelled");
      const history = shipmentRows.filter((shipment) => shipment.status === "Delivered" || shipment.status === "Cancelled");
      const table = (rows: RecordData[], empty: string) => rows.length ? `<div class="table"><table><thead><tr><th>Tracking No.</th><th>Status</th><th>Service</th><th>CBM / Weight</th><th>Freight</th><th>Delivery</th><th>Payment</th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table></div>` : `<p class="muted">${esc(empty)}</p>`;
      return page("Customer Portal Preview", `<section><p class="notice"><strong>Admin preview only.</strong> This is the customer dashboard view for ${esc(customer.full_name)}. The customer is not signed in and cannot see this preview.</p><div class="actions"><a href="/admin/customers?id=${esc(customerId)}">← Back to customer</a></div></section><section><h2>MY KargoDoorPH</h2><p>Welcome, ${esc(customer.full_name)}</p><p><strong>Account / Cargo Code: ${esc(customer.customer_code)}</strong></p><h2>My Shipments</h2>${table(active, "You have no active shipments.")}<h2>Shipment History</h2>${table(history, "No shipment history yet.")}</section>`, user.name, 200, {}, canWrite, staff);
    }

    // Live KargoDoor charge and Ni Hao estimate for the shipment form, as the admin types.
    if (view === "shipments" && request.method === "GET" && url.searchParams.get("estimate") === "1") {
      requireAdminMutation(user);
      return await shipmentLiveEstimate(db, url.searchParams);
    }

    /*
     * POST
     */
    if (request.method === "POST") {
      requireAdminMutation(user);
      if (!entity && view !== "finance/expenses" && view !== "finance/cash" && view !== undefined) {
        throw new AdminError(
          "Use the customer or shipment form.",
          405,
        );
      }

      validateFormOrigin(
        request,
        env,
      );

      const contentType =
        request.headers
          .get("content-type")
          ?.split(";")[0]
          ?.trim()
          .toLowerCase();

      if (
        contentType !==
        "application/x-www-form-urlencoded"
      ) {
        throw new AdminError(
          "Unsupported form format.",
          415,
        );
      }

      const contentLength =
        Number(
          request.headers.get(
            "content-length",
          ) ?? 0,
        );

      if (
        Number.isFinite(contentLength) &&
        contentLength > 24_000
      ) {
        throw new AdminError(
          "Form is too large.",
          413,
        );
      }

      const reader =
        request.body?.getReader();

      if (!reader) {
        throw new AdminError(
          "Form is empty.",
        );
      }

      const chunks: Uint8Array[] = [];
      let length = 0;

      while (true) {
        const {
          done,
          value,
        } =
          await reader.read();

        if (done) {
          break;
        }

        length +=
          value.length;

        if (
          length > 24_000
        ) {
          await reader.cancel();

          throw new AdminError(
            "Form is too large.",
            413,
          );
        }

        chunks.push(value);
      }

      const form =
        new URLSearchParams(
          Buffer.concat(
            chunks,
          ).toString(
            "utf8",
          ),
        );

      checkCsrf(
        env,
        user.id,
        path,
        form.get("csrf") ?? "",
      );

      const portalAction = form.get("action") ?? "";
      if (entity === "customers" && ["portal_create", "portal_reset", "portal_disable", "portal_reenable"].includes(portalAction)) {
        const allowed = new Set(["csrf", "action", "customer_id"]);
        for (const key of form.keys()) if (!allowed.has(key) || form.getAll(key).length !== 1) throw new AdminError("Unexpected or repeated form field.");
        const customerId = form.get("customer_id") ?? "";
        if (!/^[\da-f-]{36}$/i.test(customerId)) throw new AdminError("Invalid customer ID.");
        const customer = await db.prepare("SELECT email,mobile,full_name,customer_code FROM customers WHERE id=?").bind(customerId).first<RecordData>();
        if (!customer) throw new AdminError("Record not found.", 404);
        if (portalAction === "portal_disable") { await disablePortal(db, customerId); return page("Saved", "", user.name, 303, { Location: `${path}?id=${customerId}&portal_saved=1` }); }
        const result = portalAction === "portal_create" ? await createPortal(db, customerId, customer.email, customer.mobile) : await resetPortal(db, customerId, portalAction === "portal_reenable");
        const portalMessageId = `portal-access-${customerId}`;
        const portalMessage = customerPortalAccessMessage({ name: customer.full_name, customerCode: customer.customer_code, login: result.login, loginLabel: result.loginLabel, temporaryPassword: result.password });
        return page("Customer account created", `<section><h2>Customer account created.</h2><p><strong>Login ${esc(result.loginLabel)}:</strong> ${esc(result.login)}</p><p><strong>Temporary Password:</strong> <code>${esc(result.password)}</code></p><p class="muted">Copy the temporary password now. It is shown only once and the customer must change it after first login.</p></section><section><h2>Send Account Setup</h2><p class="muted">Copy this private message and send it directly to the customer. It has their Account/Cargo Code, portal login and temporary password.</p><textarea id="${esc(portalMessageId)}" readonly aria-label="Account setup message" style="min-height:260px;white-space:pre-wrap">${esc(portalMessage)}</textarea><div class="actions">${copyButton(portalMessageId, "Copy account setup message")}</div>${copyScript()}</section>`, user.name);
      }

      if (!entity && view === undefined) {
        const allowed = new Set(["csrf", "note"]);
        for (const key of form.keys()) {
          if (!allowed.has(key) || form.getAll(key).length !== 1)
            throw new AdminError("Unexpected or repeated form field.");
        }
        const note = (form.get("note") ?? "").trim();
        await saveStaffFollowUp(db, note, user);
        return page("Saved", "", user.name, 303, { Location: "/admin/dashboard?saved=1" });
      }

      if (view === "finance/expenses" && form.get("action") === "gcash_to_unionbank") {
        if (staff) throw new AdminError("Only the owner can record bank transfers.", 403);
        await recordGcashTransfer(db, form, user);
        return page("Saved", "", user.name, 303, { Location: `${path}?transfer=1#gcash-transfer` });
      }
      if (view === "finance/expenses") {
        const outcome = await mutateExpense(db, form, user);
        return page("Saved", "", user.name, 303, { Location: `${path}?${outcome}=1` });
      }
      if (view === "finance/cash") {
        const outcome = await mutateFinanceCash(db, form);
        return page("Saved", "", user.name, 303, { Location: `${path}?${outcome}=1` });
      }

      const action = form.get("action") ?? "";

      if (entity === "shipments" && action === "customer_paid") {
        await recordShipmentPayment(db, form, user);
        return page("Saved", "", user.name, 303, { Location: `${path}?id=${encodeURIComponent(form.get("id") ?? "")}&edit=1&customer_paid=1#customer-payment` });
      }

      if (entity === "shipments" && action === "delivery_paid") {
        await recordDeliveryPayment(db, form, user);
        return page("Saved", "", user.name, 303, { Location: `${path}?id=${encodeURIComponent(form.get("id") ?? "")}&edit=1&delivery_paid=1#delivery-payment` });
      }

      if (entity === "shipments" && action === "nihao_paid") {
        await recordNiHaoPayment(db, form, user);
        return page("Saved", "", user.name, 303, { Location: `${path}?id=${encodeURIComponent(form.get("id") ?? "")}&edit=1&nihao_paid=1#nihao-payment` });
      }

      if (action === "archive") {
        requireAdminDelete(user);

        const allowed = new Set([
          "csrf",
          "action",
          "id",
          "revision",
          "confirm",
        ]);

        for (const key of form.keys()) {
          if (
            !allowed.has(key) ||
            form.getAll(key).length !== 1
          ) {
            throw new AdminError(
              "Unexpected or repeated form field.",
            );
          }
        }

        const deleteId =
          form.get("id") ?? "";

        const deleteRevision =
          form.get("revision") ?? "";

        if (
          !/^[\da-f-]{36}$/i.test(deleteId) ||
          !deleteRevision ||
          deleteRevision.length > 40
        ) {
          throw new AdminError(
            "Invalid record revision.",
          );
        }

        if (form.get("confirm") !== "yes") {
          throw new AdminError(
            "Confirm the archive or cancellation.",
          );
        }

        await archiveOrCancelRecord(
          db,
          entity!,
          deleteId,
          deleteRevision,
          user.id,
        );

        return page(
          "Lifecycle updated",
          "",
          user.name,
          303,
          {
            Location: `${path}?lifecycle=1`,
          },
        );
      }

      // Ni Hao details have their own table; take them out before the shipment fields are checked.
      const niHaoDetails = entity === "shipments" ? takeNiHaoDetails(form) : null;

      let values =
        parseForm(
          entity!,
          form,
        );

      const id =
        form.get("id") ?? "";

      const revision =
        form.get("revision") ?? "";

      if (
        id &&
        (
          !/^[\da-f-]{36}$/i.test(id) ||
          !revision ||
          revision.length > 40
        )
      ) {
        throw new AdminError(
          "Invalid record revision.",
        );
      }

      let measuredCharge = false;
      if (entity === "shipments") {
        const current = values as RecordData;
        const previous = id
          ? await db.prepare("SELECT nihao_cost, nihao_cost_source, shipping_charge, shipping_charge_source, source_quotation_id, payment_status FROM shipments WHERE id = ?").bind(id).first<RecordData>()
          : null;
        // Only invoice payments change the payment status, so it can never say
        // Paid without the money being recorded.
        current.payment_status = previous?.payment_status ?? "Unpaid";
        const submittedCharge = current.shipping_charge === null || current.shipping_charge === undefined ? null : Number(current.shipping_charge);
        if (previous?.source_quotation_id) {
          // Re-price from the quotation with the warehouse-verified size, but keep a typed override.
          const verifiedFreight =
            current.verified_cbm !== null && current.verified_cbm !== undefined &&
            current.verified_weight_kg !== null && current.verified_weight_kg !== undefined
              ? await verifiedShipmentFreight(db, String(id), Number(current.verified_cbm), Number(current.verified_weight_kg))
              : null;
          const charge = resolveQuotationShipmentCharge(submittedCharge, previous, verifiedFreight?.shippingCharge ?? null);
          current.shipping_charge = charge.cost;
          current.shipping_charge_source = charge.source;
          measuredCharge = Boolean(verifiedFreight) && charge.source === "rate";
        } else {
          const charge = resolveManualShipmentCharge(current, previous);
          current.shipping_charge = charge.cost;
          current.shipping_charge_source = charge.source;
        }
        const niHao = resolveNiHaoCost(
          current.nihao_cost === null || current.nihao_cost === undefined ? null : Number(current.nihao_cost),
          previous ? { cost: previous.nihao_cost, source: previous.nihao_cost_source } : null,
          await shipmentNiHaoEstimate(db, String(id), current),
        );
        values = { ...current, nihao_cost: niHao.cost, nihao_cost_source: niHao.source } as unknown as typeof values;
      }

      const recordId =
        await saveRecord(
          db,
          entity!,
          values,
          user.id,
          id,
          revision,
        );

      if (niHaoDetails) await saveNiHaoDetails(db, recordId, niHaoDetails, user.id);

      if (
        entity === "shipments" &&
        id &&
        Number.isSafeInteger((values as RecordData).shipping_charge)
      ) {
        // Keep Draft and Unpaid invoices in step with a verified, rate-updated or edited charge.
        await syncVerifiedFreightToInvoice(
          db,
          recordId,
          Number((values as RecordData).shipping_charge),
          user.id,
          measuredCharge
            ? "Invoice freight updated from verified warehouse measurements."
            : "Invoice freight updated from the shipment's edited shipping charge.",
          Number.isSafeInteger((values as RecordData).delivery_charge)
            ? Number((values as RecordData).delivery_charge)
            : undefined,
        );
      }

      if (entity === "shipments") {
        // Ready to bill (charge + verified size or arrived in PH): make the Draft invoice.
        await autoDraftInvoice(db, recordId, user.id);
      }

      return page(
        "Saved",
        "",
        user.name,
        303,
        {
          Location:
            `${path}?id=${encodeURIComponent(
              recordId,
            )}&saved=1`,
        },
      );
    }

    if (view === "finance/expenses") {
      return await expensesPage(db, url, user, csrfToken(env, user.id, path), canManageStaffRecords(user));
    }
    if (view === "finance/cash") {
      return await financeCashPage(db, url, user.name, csrfToken(env, user.id, path), canWrite);
    }
    if (view === "finance/ledger") {
      return await moneyLedgerPage(db, url, user.name, canWrite);
    }
    if (view === "finance/accounts") {
      return await financeAccountsPage(db, url, user.name, canWrite);
    }

    if (view === "finance/export") {
      if (url.searchParams.get("ledger") === "shipments") return await shipmentsLedgerCsv(db);
      return await financeCsv(db, url);
    }
    if (view === "finance/reports") {
      return await financeDashboard(db, url, user.name, undefined, canWrite, "reports");
    }
    /*
     * REPORT PAGES
     */
    if (
      view ===
      "finance"
    ) {
      if (url.searchParams.get("report") === "freight" || ["q", "missing", "page"].some((key) => url.searchParams.has(key))) {
        return await finance(db, url, user.name, canWrite);
      }
      return await financeDashboard(db, url, user.name, undefined, canWrite);
    }

    if (
      view ===
      "activity"
    ) {
      return await activity(
        db,
        url,
        user.name,
      );
    }

    if (!entity) {
      return await dashboard(db, user, csrfToken(env, user.id, path), canWrite);
    }

    /*
     * CUSTOMER / SHIPMENT ROUTES
     */
    const id =
      url.searchParams.get(
        "id",
      );

    const edit =
      url.searchParams.get(
        "edit",
      ) === "1";

    const add =
      url.searchParams.get(
        "new",
      ) === "1";

    let record: RecordData = {};
    let cargoInfo: ShipmentCargo | null = null;

    if (id) {
      if (
        !/^[\da-f-]{36}$/i.test(
          id,
        )
      ) {
        throw new AdminError(
          "Invalid record ID.",
        );
      }

      const found =
        await db
          .prepare(
            `SELECT * FROM ${entity} WHERE id = ?`,
          )
          .bind(id)
          .first<RecordData>();

      if (!found) {
        throw new AdminError(
          "Record not found.",
          404,
        );
      }

      record =
        found;
      if (entity === "shipments") cargoInfo = await shipmentCargo(db, id);
      if (entity === "shipments" && url.searchParams.get("statement") === "pdf") {
        if (!canWrite) requireOperationalAdmin(user);
        const statement = await readShipmentStatement(db, id);
        return new Response(shipmentStatementPdf(statement), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${statementFilename(statement)}"`,
            "Cache-Control": "no-store, private",
          },
        });
      }
    }

    const title =
      entity ===
      "customers"
        ? "Customers"
        : "Shipments";

    const notice =
      url.searchParams.get(
        "saved",
      ) === "1"
        ? '<p class="notice" role="status">Changes saved.</p>'
        : "";

    /*
     * ADD / EDIT
     */
    if (
      add ||
      edit
    ) {
      if (
        edit &&
        !id
      ) {
        throw new AdminError(
          "Choose a record to edit.",
        );
      }

      let fields =
        "";
      let paymentForms = "";
      let shipmentTabs = "";

      /*
       * CUSTOMER FORM
       */
      if (
        entity ===
        "customers"
      ) {
        fields =
          `<p class="wide muted"><strong>Account Number</strong><br>${id ? esc(record.customer_code) : "Automatically generated when saved."}</p>` +
          input(
            "full_name",
            "Full name",
            record,
            "text",
            true,
          ) +
          input(
            "company_name",
            "Company",
            record,
          ) +
          input(
            "mobile",
            "Mobile",
            record,
            "tel",
            true,
            40,
          ) +
          input(
            "email",
            "Email",
            record,
            "email",
            false,
            254,
          ) +
          `<label class="wide">
            Address
            <textarea
              name="address"
              maxlength="1000"
            >${esc(
              record.address,
            )}</textarea>
          </label>

          <label class="wide">
            Notes
            <textarea
              name="notes"
              maxlength="4000"
            >${esc(
              record.notes,
            )}</textarea>
          </label>`;
      } else {
        /*
         * SHIPMENT FORM
         */
        const customerSearch =
          (
            url.searchParams.get(
              "customer_search",
            ) ?? ""
          ).trim();

        if (
          customerSearch.length >
          160
        ) {
          throw new AdminError(
            "Search is too long.",
          );
        }

        const selectedCustomer =
          String(
            record.customer_id ??
            url.searchParams.get(
              "customer_id",
            ) ??
            "",
          );

        /*
         * CUSTOMER PICKER
         *
         * Always show customers.
         * If a search is entered,
         * narrow the list.
         * Always include the selected
         * customer when editing.
         */
        const result =
          await db
            .prepare(
              `
              SELECT
                id,
                customer_code,
                full_name,
                company_name,
                mobile,
                email
              FROM customers
              WHERE
                (
                  ? = ''

                  OR instr(
                    lower(
                      COALESCE(
                        customer_code,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0

                  OR instr(
                    lower(
                      COALESCE(
                        full_name,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0

                  OR instr(
                    lower(
                      COALESCE(
                        company_name,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0

                  OR instr(
                    COALESCE(
                      mobile,
                      ''
                    ),
                    ?
                  ) > 0

                  OR instr(
                    lower(
                      COALESCE(
                        email,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0
                )

                OR (
                  ? != ''
                  AND id = ?
                )

              ORDER BY
                CASE
                  WHEN id = ?
                  THEN 0
                  ELSE 1
                END,
                full_name,
                customer_code

              LIMIT 50
              `,
            )
            .bind(
              customerSearch,
              customerSearch,
              customerSearch,
              customerSearch,
              customerSearch,
              customerSearch,
              selectedCustomer,
              selectedCustomer,
              selectedCustomer,
            )
            .all<RecordData>();

        const customerRows =
          result.results;

        fields =
          `<label class="wide">
            Customer *

            <select
              name="customer_id"
              required
            >
              <option value="">
                Choose an existing customer
              </option>

              ${customerRows
                .map(
                  (
                    customer,
                  ) =>
                    `<option
                      value="${esc(
                        customer.id,
                      )}"${
                        selectedCustomer ===
                        String(
                          customer.id,
                        )
                          ? " selected"
                          : ""
                      }
                    >${esc(
                      customer.customer_code,
                    )} — ${esc(
                      customer.full_name,
                    )}</option>`,
                )
                .join("")}
            </select>
          </label>`;

        /*
         * SHIPMENT IDENTITY
         */
        fields +=
          `<p class="wide muted"><strong>Tracking Number</strong><br>${id ? esc(record.tracking_number || "Not assigned at supplier intake") : "Automatically generated after supplier dispatch."}</p>` +
          select(
            "service_type",
            "Service type",
            record,
            [
              "Sea Freight",
              "Air Freight",
            ],
          ) +
          select(
            "china_warehouse",
            "Origin warehouse",
            record,
            warehouses,
          );

        /*
         * CARGO (hand-added shipments; quotation-linked ones use the quotation's)
         */
        if (!record.source_quotation_id) fields += manualCargoFields(record);

        /*
         * TRACKING DATES
         */
        // Order (two columns): CH warehouse received date | Estimated arrival,
        // Malabon warehouse received date | Delivered date,
        // Declared CBM | Declared weight, Verified CBM | Verified weight,
        // Status. Air Freight: CH received | Flight date, then Estimated arrival. Supplier waybill and courier sit in
        // the Ni Hao details box below.
        fields +=
          input(
            "warehouse_received_date",
            "CH warehouse received date",
            record,
            "date",
          ).replace("<label>", '<label style="grid-column-start:1">') +
          // Air Freight: Flight date comes right after the CH warehouse received
          // date (it cannot be earlier; the browser picker starts from it too).
          (record.service_type === "Air Freight"
            ? input("departure_date", "Flight date", record, "date").replace(
                'name="departure_date"',
                `name="departure_date" data-after="warehouse_received_date"${record.warehouse_received_date ? ` min="${esc(record.warehouse_received_date)}"` : ""}`,
              ) + arrivalEstimateField(record).replace('class="arrival-estimate"', 'class="arrival-estimate wide"')
            : arrivalEstimateField(record)) +
          // Below them: Malabon warehouse received date (from Malabon Warehouse
          // on) and Delivered date (at Delivered). Both always stay in the form
          // so a saved date is kept; /admin-arrival-window.js shows or hides
          // them as the Status changes.
          input("actual_arrival", "Malabon warehouse received date", record, "date")
            .replace("<label>", `<label style="grid-column-start:1" data-show-status="Malabon Warehouse|Delivered"${["Malabon Warehouse", "Delivered"].includes(String(record.status || "")) ? "" : " hidden"}>`) +
          input("delivered_date", "Delivered date", record, "date")
            .replace("<label>", `<label data-show-status="Delivered"${record.status === "Delivered" ? "" : " hidden"}>`) +
          input(
            "cbm",
            "Declared CBM",
            record,
            "number",
            true,
            160,
            "any",
          ).replace("<label>", '<label style="grid-column-start:1">') +
          input(
            "weight_kg",
            "Declared weight (kg)",
            record,
            "number",
            true,
          ) +
          input(
            "verified_cbm",
            "Verified CBM (number only, e.g. 0.36)",
            record,
            "number",
            false,
            160,
            "any",
          ).replace("<label>", '<label style="grid-column-start:1">') +
          input(
            "verified_weight_kg",
            "Verified weight (kg; number only, e.g. 45)",
            record,
            "number",
            false,
          ) +
          select(
            "status",
            "Status",
            record,
            shipmentStatusOptions(record),
          ).replace("<label>", '<label class="k-status-red" style="grid-column-start:1">') + hidden("estimated_arrival", record.estimated_arrival ?? "") +
          // Sea Freight keeps the flight date hidden (Air shows it after the CH date above).
          (record.service_type === "Air Freight" ? "" : hidden("departure_date", record.departure_date ?? ""));

        /*
         * PUBLIC TRACKING REMARKS
         */
        fields +=
          `<label class="wide">
            Tracking remarks

            <textarea
              name="tracking_remarks"
              maxlength="2000"
              placeholder="Optional update visible in shipment tracking"
            >${esc(
              record.tracking_remarks,
            )}</textarea>
          </label>`;

        /*
         * FINANCIAL DETAILS
         */
        // Money in (KargoDoor, green) and money out (Ni Hao, red), each with
        // its payment box. The payment boxes submit their own forms (see
        // detachForm), placed after the Save shipment form.
        const payable = Boolean(id) && !record.archived_at && record.status !== "Cancelled";
        // Proof of payment boxes for payments already received, each with its own detached upload form.
        let proofForms = "";
        const customerBox = payable
          ? await (async () => {
              const billing = await readShipmentBilling(db, String(id), record);
              const received = await readShipmentPayments(db, billing.invoiceId);
              const proofs = await readProofs(db, "payment", received.map((row) => row.id));
              const cells = received.map((row, index) => {
                const cell = proofCell({
                  kind: "payment", id: row.id, proof: proofs.get(row.id), csrf: csrfToken(env, user.id, path), canWrite,
                  back: `${path}?id=${encodeURIComponent(String(id))}&edit=1#customer-payment`, formId: `payment-proof-form-${index}`,
                });
                proofForms += cell.form;
                return cell.inline;
              });
              return detachForm(shipmentPaymentSection({
                path,
                csrf: csrfToken(env, user.id, path),
                shipmentId: String(id),
                billing,
                canWrite,
                justPaid: url.searchParams.get("customer_paid") === "1",
                title: "Customer payment",
                paymentsList: received.length
                  ? (url.searchParams.get("proof") === "1" ? '<p class="notice" role="status">Proof of payment uploaded.</p>' : "") + shipmentPaymentsList(received, cells) + proofCss
                  : "",
              }), "customer-payment-form");
            })()
          : { inline: "", form: "" };
        const transferFeeBox = payable
          ? transferFeeSection({
              shippingCharge: record.shipping_charge,
              transferFeeCollected: record.transfer_fee_collected,
              fees: await readTransferFeesPaid(db, record.tracking_number),
            })
          : "";
        const niHaoPaid = payable ? await readNiHaoPayment(db, record.tracking_number) : null;
        const deliveryBox = payable
          ? detachForm(deliveryPaymentSection({
              path,
              csrf: csrfToken(env, user.id, path),
              shipmentId: String(id),
              trackingNumber: record.tracking_number,
              deliveryCharge: record.delivery_charge,
              payment: await readDeliveryPayment(db, record.tracking_number),
              canWrite,
              justPaid: url.searchParams.get("delivery_paid") === "1",
            }), "delivery-payment-form")
          : { inline: "", form: "" };
        const niHaoBox = payable
          ? detachForm(niHaoPaymentSection({
              path,
              csrf: csrfToken(env, user.id, path),
              shipmentId: String(id),
              trackingNumber: record.tracking_number,
              nihaoCost: record.nihao_cost,
              payment: niHaoPaid,
              canWrite,
              justPaid: url.searchParams.get("nihao_paid") === "1",
              suggestedFee: canWrite ? await lastNiHaoTransferFee(db) : null,
              title: "Ni Hao payment",
            }), "nihao-payment-form")
          : { inline: "", form: "" };
        const niHaoCustomer = record.customer_id
          ? await db.prepare("SELECT full_name FROM customers WHERE id = ?").bind(record.customer_id).first<{ full_name: string }>()
          : null;
        const niHaoDetailsCard = niHaoDetailsBox({
          shipmentId: String(id ?? ""),
          record,
          details: await readNiHaoDetails(db, String(id ?? "")),
          customerName: niHaoCustomer?.full_name ?? "",
          csrf: csrfToken(env, user.id, path),
          canWrite,
          uploaded: url.searchParams.get("nihao_file") === "1",
          supplierFields:
            input("supplier_waybill_number", "Supplier waybill number", record, "text", false, 120) +
            input("supplier_courier", "Supplier courier", record, "text", false, 120),
        });
        paymentForms = customerBox.form + proofForms + deliveryBox.form + niHaoBox.form + niHaoDetailsCard.form;
        // Opens on the Ni Hao tab right after a Ni Hao upload or payment.
        const niHaoFirst = url.searchParams.get("nihao_file") === "1" || url.searchParams.get("nihao_paid") === "1";
        const niHaoNote = niHaoPaid ? "Paid" : record.nihao_cost === null || record.nihao_cost === undefined || record.nihao_cost === "" ? "Cost not entered" : payable ? "Not paid yet" : "Cost entered";
        shipmentTabs = `<div class="shipment-tabs" role="tablist" aria-label="Edit shipment sections" data-shipment-tabs data-initial="${niHaoFirst ? "nihao" : "main"}">
          <button type="button" role="tab" data-tab="main" aria-selected="${niHaoFirst ? "false" : "true"}">Shipment &amp; KargoDoor<small>Cargo, status, customer pays us</small></button>
          <button type="button" role="tab" data-tab="nihao" aria-selected="${niHaoFirst ? "true" : "false"}">Ni Hao<small>Details, file, payment · ${esc(niHaoNote)}</small></button>
        </div><script src="/admin-shipment-tabs.js" defer></script>`;

        fields +=
          `<div class="wide shipment-money shipment-money-kd">
            <h3><span class="shipment-money-tag">Money in</span> KargoDoor · customer pays us</h3>
            <div class="grid">` +
          shippingChargeField(record) +
          input(
            "delivery_charge",
            "Delivery charge (PHP)",
            record,
            "text",
            true,
            30,
          ) +
          // Payment status follows the invoice; it is shown here, not typed.
          hidden("payment_status", record.payment_status ?? "Unpaid") +
          `</div>${customerBox.inline}${transferFeeBox}${deliveryBox.inline}</div>
          <div class="wide shipment-money shipment-money-nh">
            <h3><span class="shipment-money-tag">Money out</span> Ni Hao · we pay Ni Hao</h3>
            <div class="grid">` +
          niHaoCostField(
            record,
            await shipmentNiHaoEstimate(db, String(record.id ?? ""), record),
          ) +
          `</div>${niHaoDetailsCss}<script src="/admin-copy.js" defer></script>${niHaoDetailsCard.inline}${niHaoBox.inline}</div>`;
      }

      /*
       * CUSTOMER SEARCH
       */
      const picker =
        entity ===
        "shipments"
          ? `
            <section>
              <form
                method="get"
                action="${path}"
                class="search"
              >
                ${
                  id
                    ? hidden(
                        "id",
                        id,
                      ) +
                      hidden(
                        "edit",
                        "1",
                      )
                    : hidden(
                        "new",
                        "1",
                      )
                }

                ${
                  record.customer_id
                    ? hidden(
                        "customer_id",
                        record.customer_id,
                      )
                    : url.searchParams.get(
                          "customer_id",
                        )
                      ? hidden(
                          "customer_id",
                          url.searchParams.get(
                            "customer_id",
                          ),
                        )
                      : ""
                }

                <label>
                  Find customer by account number, name, company, mobile or email

                  <input
                    name="customer_search"
                    maxlength="160"
                    value="${esc(
                      url.searchParams.get(
                        "customer_search",
                      ) ?? "",
                    )}"
                  >
                </label>

                <button
                  type="submit"
                >
                  Find customer
                </button>
              </form>

              <p class="muted">
                Customers are shown automatically below.
                Use search to narrow the list.

                ${canWrite ? `<a
                  href="/admin/customers?new=1"
                >
                  Add a customer
                </a>` : ""}
              </p>
            </section>
          `
          : "";

      return page(
        `${
          id
            ? "Edit"
            : "Add"
        } ${
          entity ===
          "customers"
            ? "customer"
            : "shipment"
        }`,
        `
          ${picker}

          <section class="compact-record-form">
            <form
              method="post"
              action="${path}"
            >
              ${hidden(
                "csrf",
                csrfToken(
                  env,
                  user.id,
                  path,
                ),
              )}

              ${hidden(
                "id",
                id ?? "",
              )}

              ${hidden(
                "revision",
                record.updated_at ??
                  "",
              )}

              ${entity === "shipments" && cargoInfo?.quotationId ? `<p class="notice shipment-cargo-note"><strong>Cargo / Item:</strong> ${esc(cargoInfo.item) || "—"} · <strong>Category:</strong> ${esc(cargoInfo.category) || "—"}${cargoInfo.quotationId ? ` · From quotation <a href="/admin/quotations?id=${esc(cargoInfo.quotationId)}">${esc(cargoInfo.quotationNumber) || "View quotation"}</a>. To change the item or category, edit the quotation.` : ""}</p>` : ""}

              ${entity === "shipments" ? shipmentMoneyCss + shipmentTabs : ""}
              <div class="grid">
                ${fields}
              </div>

              <p class="muted">
                * Required. Optional blank
                values clear the saved field.${paymentForms ? " Record payment, Mark Ni Hao paid and Upload save only their own box. If you changed other fields, click Save shipment first." : ""}
              </p>

              <div class="actions">
                <button
                  type="submit"
                >
                  Save ${
                    entity ===
                    "customers"
                      ? "customer"
                      : "shipment"
                  }
                </button>

                <a
                  href="${path}${
                    id
                      ? `?id=${esc(
                          id,
                        )}`
                      : ""
                  }"
                >
                  Cancel
                </a>
              </div>
            </form>
            ${paymentForms}
            ${entity === "shipments" ? '<script src="/admin-shipment-pricing.js" defer></script><script src="/admin-arrival-window.js" defer></script>' : ""}
          </section>
        `,
        user.name,
        200,
        entity === "shipments" ? { "Content-Security-Policy": shipmentFormCsp } : {},
        canWrite,
      );
    }

    /*
     * RECORD DETAILS
     */
    if (id) {
      const deleting =
        url.searchParams.get("archive") === "1";

      if (deleting) {
        requireAdminDelete(user);

        const recordName =
          entity === "customers"
            ? String(
                record.full_name ??
                record.customer_code ??
                "this customer",
              )
            : String(
                record.tracking_code ??
                "this shipment",
              );

        return page(
          `Archive ${
            entity === "customers"
              ? "Customer"
              : "Shipment"
          }`,
          `
            <section>
              <h2>
                Confirm archive
              </h2>

              <p>
                Are you sure you want to archive
                <strong>${esc(recordName)}</strong>?
              </p>

              <p class="muted">
                Archived records are removed from normal lists but retained
                for audit history and related records.
              </p>

              <div class="actions">
                <form
                  method="post"
                  action="${path}"
                >
                  ${hidden(
                    "csrf",
                    csrfToken(env, user.id, path),
                  )}
                  ${hidden("action", "archive")}
                  ${hidden("id", id)}
                  ${hidden(
                    "revision",
                    String(record.updated_at ?? ""),
                  )}
                  ${hidden("confirm", "yes")}

                  <button type="submit">
                    Archive ${
                      entity === "customers"
                        ? "customer"
                        : "shipment"
                    }
                  </button>
                </form>

                <a
                  class="button"
                  href="${path}?id=${esc(id)}"
                >
                  Cancel
                </a>
              </div>
            </section>
          `,
          user.name,
          200,
          {},
          canWrite,
        );
      }

      let customer =
        "";
      let linkedCustomer: RecordData | null = null;

      if (
        entity ===
        "shipments"
      ) {
        const foundCustomer =
          await db
            .prepare(
              `
              SELECT
                customer_code,
                full_name,
                mobile,
                email
              FROM customers
              WHERE id = ?
              `,
            )
            .bind(
              record.customer_id,
            )
            .first<RecordData>();
        linkedCustomer = foundCustomer;

        customer =
          `<p>
            Customer:
            <a
              href="/admin/customers?id=${esc(
                record.customer_id,
              )}"
            >
              ${esc(
                foundCustomer?.customer_code,
              )}
              —
              ${esc(
                foundCustomer?.full_name,
              )}
            </a>
          </p>`;
      }

      const details =
        schemaKeys[entity]
          .filter(
            (key) =>
              key !== "customer_id" &&
              (key !== "departure_date" || record.service_type === "Air Freight") &&
              key !== "estimated_arrival",
          )
          .concat([
            "created_at",
            "updated_at",
          ])
          .map(
            (key) => {
              const monetary =
                [
                  "shipping_charge",
                  "delivery_charge",
                  "nihao_cost",
                ].includes(
                  key,
                );

              const value =
                monetary
                  ? record[
                        key
                      ] ===
                      null
                    ? "Not entered"
                    : pesos(
                        record[
                          key
                        ],
                      )
                  : esc(
                      record[
                        key
                      ],
                    ) ||
                    "—";

              return `
                <dt>
                  ${esc(
                    (key === "departure_date" ? "Flight date" : labels[
                      key
                    ]) ??
                      key.replaceAll(
                        "_",
                        " ",
                      ),
                  )}
                </dt>

                <dd>
                  ${value}
                </dd>
              `;
            },
          )
          .join("");

      const shipmentDetail = (label: string, value: string) => `
        <div class="shipment-detail-item">
          <dt>${esc(label)}</dt>
          <dd>${value}</dd>
        </div>`;

      // Where the money stands, shown in the summary. Payments are recorded in Edit shipment.
      const paymentSummary = entity === "shipments" ? await (async () => {
        const billing = await readShipmentBilling(db, id, record);
        const niHao = await readNiHaoPayment(db, record.tracking_number);
        const pill = (tone: string, text: string) => `<span class="k-pill" data-k="${tone}">${esc(text)}</span>`;
        const balance = Math.max(billing.total - billing.paid, 0);
        const customerPaid = billing.status === "Paid" || (Boolean(billing.invoiceId) && balance === 0 && billing.paid > 0);
        const customer = customerPaid
          ? `${pill("green", "Paid")} ${esc(pesos(billing.paid))}${billing.lastPaymentDate ? ` on ${esc(billing.lastPaymentDate)}` : ""}`
          : billing.paid > 0
            ? `${pill("amber", "Partly paid")} ${esc(pesos(billing.paid))} of ${esc(pesos(billing.total))}`
            : pill("red", String(record.payment_status || "Unpaid"));
        const nihao = niHao
          ? `${pill("green", "Paid")} ${esc(pesos(niHao.amount))} on ${esc(niHao.lastDate)}`
          : pill("red", "Not paid");
        const editLink = record.archived_at || record.status === "Cancelled" || !canWrite
          ? ""
          : ` <a href="${path}?id=${esc(id)}&edit=1#customer-payment">Record in Edit shipment</a>`;
        return { customer: customer + (customerPaid ? "" : editLink), nihao: nihao + (niHao ? "" : editLink.replace("#customer-payment", "#nihao-payment")) };
      })() : null;

      const transferFeesPaid = entity === "shipments" ? await readTransferFeesPaid(db, record.tracking_number) : [];
      const deliveryPaid = entity === "shipments" ? await readDeliveryPayment(db, record.tracking_number) : null;

      const shipmentDetails = entity === "shipments" ? (() => {
        const status = String(record.status || "");
        const actualArrivalVisible = ["Malabon Warehouse", "Delivered"].includes(status);
        const money = (key: "shipping_charge" | "delivery_charge" | "nihao_cost") =>
          record[key] === null ? "Not entered" : pesos(record[key]);
        const marginValue = record.nihao_cost === null
          ? "Enter Ni Hao cost to calculate"
          : pesos(Number(record.shipping_charge) - Number(record.nihao_cost));

        const shipment = [
          shipmentDetail("Tracking number", esc(record.tracking_number) || "—"),
          shipmentDetail("Cargo / Item", esc(cargoInfo?.item) || "—"),
          shipmentDetail("Category", esc(cargoInfo?.category) || "—"),
          ...(cargoInfo?.quotationId
            ? [shipmentDetail("Quotation", `<a href="/admin/quotations?id=${esc(cargoInfo.quotationId)}">${esc(cargoInfo.quotationNumber) || "View quotation"}</a>`)]
            : record.cargo_quantity
              ? [shipmentDetail("Units", esc(record.cargo_quantity))]
              : []),
          shipmentDetail("Service type", esc(record.service_type) || "—"),
          shipmentDetail("Declared CBM", esc(record.cbm) || "—"),
          shipmentDetail("Declared weight (kg)", esc(record.weight_kg) || "—"),
          shipmentDetail("Origin warehouse", esc(record.china_warehouse) || "—"),
          shipmentDetail("Status", esc(status) || "—"),
          shipmentDetail("CH warehouse received date", esc(record.warehouse_received_date) || "—"),
          ...(status === "Cancelled" ? [] : [shipmentDetail("Estimated arrival", (() => {
            const window = arrivalWindow(record.service_type, record.warehouse_received_date);
            return window
              ? `${esc(formatArrivalWindow(window))}<small class="muted" style="display:block">Estimate only · ${esc(window.span)} after CH warehouse received date</small>`
              : '<span class="muted">Shows once the CH warehouse received date is entered</span>';
          })())]),
          ...(actualArrivalVisible
            ? [shipmentDetail("Malabon warehouse received date", esc(record.actual_arrival) || "Not recorded")]
            : []),
          ...(status === "Delivered"
            ? [shipmentDetail("Delivered date", esc(record.delivered_date) || "Not recorded")]
            : []),
        ].join("");

        const cargo = [
          shipmentDetail("Verified CBM", esc(record.verified_cbm) || "—"),
          shipmentDetail("Verified weight (kg)", esc(record.verified_weight_kg) || "—"),
        ].join("");

        const split = splitFreightCharge(record.shipping_charge, record.transfer_fee_collected);
        const finance = [
          ...(split.fee > 0 && record.shipping_charge !== null
            ? [
                shipmentDetail("KargoDoor base fee", pesos(split.base)),
                shipmentDetail("Transfer fee", `${pesos(split.fee)} <small class="muted">covers the bank fees below</small>`),
              ]
            : []),
          shipmentDetail(split.fee > 0 ? "KargoDoor shipping fee (customer sees)" : "KargoDoor freight charge", `${money("shipping_charge")} ${chargeSourceTag(record.shipping_charge_source)}`),
          ...(split.fee > 0 || transferFeesPaid.length
            ? [shipmentDetail("Transfer fees paid", transferFeesPaid.length
                ? `${esc(transferFeesPaidSummary(transferFeesPaid))} <small class="muted">in Expenses</small>`
                : '<span class="muted">None saved yet</span>')]
            : []),
          shipmentDetail("Ni Hao freight cost", `${money("nihao_cost")} ${record.nihao_cost === null ? "" : niHaoSourceTag(record.nihao_cost_source)}`),
          shipmentDetail("Freight margin", marginValue),
          ...(Number(record.delivery_charge || 0) > 0 || deliveryPaid
            ? [
                shipmentDetail("Delivery charge", money("delivery_charge")),
                shipmentDetail("Delivery paid to rider", deliveryPaid
                  ? `${pesos(deliveryPaid.amount)} <small class="muted">${esc(deliveryPaid.payee || "rider")} · ${esc(deliveryPaid.date)} · in Expenses</small>`
                  : `<span class="muted">Not saved yet</span>${canWrite && !record.archived_at ? ` <a href="${path}?id=${esc(id)}&edit=1#delivery-payment">Record in Edit shipment</a>` : ""}`),
              ]
            : []),
          shipmentDetail("Customer payment", paymentSummary?.customer ?? (esc(record.payment_status) || "—")),
          shipmentDetail("Ni Hao payment", paymentSummary?.nihao ?? "—"),
        ].join("");

        return `
          <div class="shipment-detail-sections">
            <section class="shipment-detail-section">
              <h2>Shipment</h2>
              <dl class="shipment-detail-grid">${shipment}</dl>
            </section>
            <section class="shipment-detail-section">
              <h2>Verified cargo</h2>
              <dl class="shipment-detail-grid">${cargo}</dl>
            </section>
            <section class="shipment-detail-section">
              <h2>Internal finance</h2>
              <dl class="shipment-detail-grid">${finance}</dl>
            </section>
          </div>`;
      })() : "";

      const customerDetails = entity === "customers" ? (() => {
        const detail = (label: string, value: unknown, wide = false) => `
          <div class="customer-detail-item${wide ? " wide" : ""}">
            <dt>${esc(label)}</dt>
            <dd>${esc(value) || "—"}</dd>
          </div>`;
        const notes = String(record.notes || "").trim();

        return `
          <div class="customer-profile">
            <div class="customer-profile-header">
              <div>
                <h2>${esc(record.full_name) || "Customer"}</h2>
                ${record.company_name ? `<p class="muted">${esc(record.company_name)}</p>` : ""}
              </div>
              <span class="customer-account-badge">Account · ${esc(record.customer_code) || "—"}</span>
            </div>
            <dl class="customer-detail-grid">
              ${detail("Mobile", record.mobile)}
              ${detail("Email", record.email)}
              ${detail("Address", record.address, true)}
              ${notes ? detail("Notes", notes, true) : ""}
            </dl>
          </div>`;
      })() : "";

      const margin =
        entity ===
        "shipments"
          ? `
            <dt>
              Freight margin
            </dt>

            <dd>
              ${
                record.nihao_cost ===
                null
                  ? "Enter Ni Hao cost to calculate"
                  : pesos(
                      Number(
                        record.shipping_charge,
                      ) -
                        Number(
                          record.nihao_cost,
                        ),
                    )
              }
            </dd>
          `
          : "";

      const relatedLinks =
        entity ===
          "customers"
          ? `
            <a
              href="/admin/shipments?customer_id=${esc(
                id,
              )}"
            >
              View shipments
            </a>
            <a
              href="/admin/customer-preview?customer_id=${esc(id)}"
            >
              View customer portal preview
            </a>
            ${canWrite ? `
            <a
              href="/admin/shipments?new=1&customer_id=${esc(
                id,
              )}"
            >
              Add shipment
            </a>` : ""}
          `
          : canWrite ? `
            <a
              href="/admin/invoices?new=1&shipment_id=${esc(
                id,
              )}"
            >
              Create or view invoice
            </a>
            <a href="/admin/shipments?id=${esc(id)}&amp;statement=pdf">
              Download Shipment Statement (PDF)
            </a>
          ` : "";

      const portal = entity === "customers" ? await portalFor(db, id) : null;
      const portalActions = canWrite
        ? !portal
          ? `<form method="post" action="${path}">${hidden("csrf",csrfToken(env,user.id,path))}${hidden("action","portal_create")}${hidden("customer_id",id)}<button>Create Customer Account</button></form>`
          : !portal.enabled
            ? `<form method="post" action="${path}">${hidden("csrf",csrfToken(env,user.id,path))}${hidden("action","portal_reenable")}${hidden("customer_id",id)}<button>Re-enable Access</button></form>`
            : `<form method="post" action="${path}">${hidden("csrf",csrfToken(env,user.id,path))}${hidden("action","portal_reset")}${hidden("customer_id",id)}<button>Generate New Temporary Password</button></form><form method="post" action="${path}">${hidden("csrf",csrfToken(env,user.id,path))}${hidden("action","portal_disable")}${hidden("customer_id",id)}<button>Disable Access</button></form>`
        : "";
      const portalSection = entity === "customers" ? `
        <section class="customer-portal-access">
          <div class="customer-portal-main">
            <h2>Customer Portal Access</h2>
            <p class="muted">${portal?.login_mobile ? "Login mobile number" : "Login email"} · ${esc(portal?.login_mobile ?? portal?.login_email ?? record.mobile ?? record.email) || "—"}</p>
            ${portalActions ? `<div class="customer-portal-actions">${portalActions}</div>` : ""}
          </div>
          <dl class="customer-portal-status">
            <dt>Status</dt>
            <dd>${portalStatus(portal)}</dd>
          </dl>
        </section>` : "";
      const accountMessageId = `account-created-${id}`;
      const instructionId = `shipping-instructions-${id}`;
      const accountMessage = entity === "customers"
        ? customerWelcomeMessage({
            name: record.full_name,
            customerCode: record.customer_code,
            login: portal ? portal.login_mobile ?? portal.login_email : record.mobile || record.email,
            loginLabel: (portal ? portal.login_mobile : record.mobile) ? "mobile number" : "email",
            temporaryPassword: portal
              ? "[Click Generate New Temporary Password above]"
              : "[Click Create Customer Account above]",
          })
        : "";
      const instructionMessage = entity === "shipments"
        ? shipmentShippingInstructions({
            name: linkedCustomer?.full_name,
            customerCode: record.cargo_code || linkedCustomer?.customer_code,
            service: record.service_type,
            warehouse: record.china_warehouse,
            warehouseAddress: warehouseAddress(record.china_warehouse),
            supplierCourier: record.supplier_courier,
            supplierWaybill: record.supplier_waybill_number,
          })
        : "";
      const shippingInstructions = !canWrite ? "" : entity === "customers"
        ? `<section><h2>Send Account Setup</h2><p class="muted">Send this first so the customer has their Account/Cargo Code and portal login before their supplier ships any package. Click Create Customer Account or Generate New Temporary Password above, and the same message appears with the temporary password filled in.</p><textarea id="${accountMessageId}" readonly aria-label="Account setup message" style="min-height:260px;white-space:pre-wrap">${esc(accountMessage)}</textarea><div class="actions">${copyButton(accountMessageId, "Copy account setup message")}</div>${copyScript()}</section>`
        : entity === "shipments" ? "" : `<section><h2>Send Warehouse Instructions</h2><p class="muted">The address of this shipment’s China warehouse is added automatically.</p><textarea id="${instructionId}" readonly aria-label="Warehouse instructions" style="min-height:260px;white-space:pre-wrap">${esc(instructionMessage)}</textarea><div class="actions">${copyButton(instructionId, "Copy warehouse instructions")}</div>${copyScript()}</section>`;
      const customerNotifications = entity === "shipments" && canWrite ? (() => {
        const messages = shipmentStatusMessages({
          customerName: linkedCustomer?.full_name,
          tracking: record.tracking_number,
          cargoCode: record.cargo_code || linkedCustomer?.customer_code,
          item: cargoInfo?.item,
          service: record.service_type,
          warehouse: record.china_warehouse,
          received: record.warehouse_received_date,
          departure: record.departure_date,
          flightDate: record.service_type === "Air Freight" ? record.departure_date : null,
          eta: record.estimated_arrival || (() => {
            const window = arrivalWindow(record.service_type, record.warehouse_received_date);
            return window ? `${formatArrivalWindow(window)} (estimate)` : null;
          })(),
          arrival: record.actual_arrival,
          delivered: record.delivered_date,
          paymentStatus: record.payment_status,
          declaredCbm: record.cbm,
          declaredWeight: record.weight_kg,
          verifiedCbm: record.verified_cbm,
          verifiedWeight: record.verified_weight_kg,
          shippingCharge: record.shipping_charge,
          deliveryCharge: record.delivery_charge,
        });

        const clientMessages: Array<[string, string, string]> = [
          ["customer-account-info", "Customer Account Info", customerWelcomeMessage({
            name: linkedCustomer?.full_name,
            customerCode: record.cargo_code || linkedCustomer?.customer_code,
            login: linkedCustomer?.mobile || linkedCustomer?.email,
            loginLabel: linkedCustomer?.mobile ? "mobile number" : "email",
            temporaryPassword: "[Generate a temporary password on the customer page]",
          })],
          ["supplier-instructions", "Supplier Instructions", instructionMessage],
        ];
        const category = (heading: string, note: string, tabs: string) =>
          `<div class="message-category"><h3 class="message-category-title">${esc(heading)}</h3><p class="muted">${esc(note)}</p>${tabs}</div>`;

        return `<section>
          <h2>Customer Notifications</h2>
          <p class="muted">Choose a message below. Review and edit before sending. Copying a message does not change the shipment.</p>
          <style>.message-category{padding-top:18px}.message-category+.message-category{margin-top:22px;border-top:2px solid var(--k-line,#d5e4ed)}.message-category-title{margin:0 0 4px;font-size:1.15rem;color:var(--k-blue,#0753ad)}</style>
          ${category("1. Client", "Account details and the instructions the customer forwards to their supplier.", messageList({
            groupId: `client-messages-${id}`,
            messages: clientMessages,
            ariaLabelSuffix: "client message",
          }))}
          ${category("2. Status", "One message per shipment status. The current status is open.", messageList({
            groupId: `customer-notification-${id}`,
            messages,
            openKey: notificationKeyFor(record.status, record.service_type),
            ariaLabelSuffix: "status notification",
          }))}
          ${category("3. Nihao", "Warehouse addresses, ready to copy. This shipment's warehouse is open.", messageList({
            groupId: `nihao-addresses-${id}`,
            messages: nihaoAddressBook().map(([warehouse, address]) => [warehouse.replace(/\W+/g, "-").toLowerCase(), warehouse, address]),
            openKey: String(record.china_warehouse || "").replace(/\W+/g, "-").toLowerCase(),
            openLabel: "assigned",
            ariaLabelSuffix: "warehouse address",
          }))}
        </section>`;
      })() : "";


      // The record's own name as the page title: tracking number or customer name.
      const recordTitle =
        entity === "shipments"
          ? String(record.tracking_number || "Shipment (no tracking number yet)")
          : entity === "customers"
            ? String(record.full_name || title)
            : title;
      return page(
        recordTitle,
        `
          ${notice}

          <section class="compact-record-details">
            ${customer}

            ${entity === "shipments" ? shipmentDetails : entity === "customers" ? customerDetails : `<dl class="compact-details-grid">${details}${margin}</dl>`}

            <div class="actions">
              ${canWrite ? `<a
                class="button"
                href="${path}?id=${esc(
                  id,
                )}&edit=1"
              >
                Edit ${
                  entity ===
                  "customers"
                    ? "customer"
                    : "shipment"
                }
              </a>` : ""}

              ${canDeleteAdmin(user) ? `<a
                class="button"
                href="${path}?id=${esc(
                  id,
                )}&archive=1"
              >
                ${entity === "customers" ? "Archive customer" : "Archive shipment"}
              </a>` : ""}

              ${relatedLinks}

              ${canWrite ? `<a
                href="/admin/activity?entity_type=${entity}&entity_id=${esc(
                  id,
                )}"
              >
                View activity
              </a>` : ""}
            </div>
          </section>
          ${portalSection}
          ${shippingInstructions}
          ${customerNotifications}
        `,
        user.name,
        200,
        {},
        canWrite,
      );
    }

    /*
     * SEARCH / LIST
     */
    const q =
      (
        url.searchParams.get(
          "q",
        ) ?? ""
      ).trim();

    const status =
      url.searchParams.get(
        "status",
      ) ?? "";

    const customer =
      url.searchParams.get(
        "customer_id",
      ) ?? "";

    const pageNumber =
      Number(
        url.searchParams.get(
          "page",
        ) ?? 1,
      );

    if (
      q.length > 160 ||
      (
        status &&
        !statuses.includes(
          status as (
            typeof statuses
          )[number],
        )
      ) ||
      !Number.isSafeInteger(
        pageNumber,
      ) ||
      pageNumber < 1 ||
      pageNumber >
        100_000
    ) {
      throw new AdminError(
        "Invalid search or filter.",
      );
    }

    const offset =
      (pageNumber - 1) *
      25;

    let rows:
      RecordData[];

    if (
      entity ===
      "customers"
    ) {
      rows =
        (
          await db
            .prepare(
              `
              SELECT
                id,
                customer_code,
                full_name,
                mobile,
                email
              FROM customers
              WHERE archived_at IS NULL
                AND (
                instr(
                  lower(customer_code),
                  lower(?)
                ) > 0

                OR instr(
                  lower(full_name),
                  lower(?)
                ) > 0

                OR instr(
                  mobile,
                  ?
                ) > 0

                OR instr(
                  lower(
                    COALESCE(
                      company_name,
                      ''
                    )
                  ),
                  lower(?)
                ) > 0

                OR instr(
                  lower(
                    COALESCE(
                      email,
                      ''
                    )
                  ),
                  lower(?)
                ) > 0
                )

              ORDER BY
                created_at DESC,
                id

              LIMIT 26
              OFFSET ?
              `,
            )
            .bind(
              q,
              q,
              q,
              q,
              q,
              offset,
            )
            .all<RecordData>()
        ).results;
    } else {
      const shipmentStatusClause = status ? "AND s.status = ?" : "AND s.status != 'Cancelled'";
      const shipmentCustomerClause = customer ? "AND s.customer_id = ?" : "";
      const shipmentBindings = [q, q, q, ...(status ? [status] : []), ...(customer ? [customer] : []), offset];
      rows =
        (
          await db
            .prepare(
              `
              SELECT
                s.id,
                s.tracking_number,
                c.full_name,
                ${cargoItemSql} AS cargo_item,
                ${cargoCategorySql.item} AS cargo_category_item,
                ${cargoCategorySql.group} AS cargo_category_group,
                s.status,
                s.service_type,
                s.warehouse_received_date,
                s.payment_status,
                CASE WHEN EXISTS (
                  SELECT 1 FROM expenses e
                  WHERE e.category = '${niHaoExpenseCategory}'
                    AND e.tracking_number = s.tracking_number COLLATE NOCASE
                ) THEN 'Paid' ELSE 'Unpaid' END AS nihao_payment
              FROM shipments s
              JOIN customers c
                ON c.id =
                   s.customer_id
              LEFT JOIN quotations q
                ON q.id = s.source_quotation_id
              WHERE
                s.archived_at IS NULL
                AND (
                  instr(
                    lower(
                      s.tracking_number
                    ),
                    lower(?)
                  ) > 0

                  OR

                  instr(
                    lower(
                      COALESCE(
                        s.cargo_code,
                        ''
                      )
                    ),
                    lower(?)
                  ) > 0

                  OR

                  instr(
                    lower(
                      c.full_name
                    ),
                    lower(?)
                  ) > 0
                )

                ${shipmentStatusClause}
                ${shipmentCustomerClause}

              ORDER BY
                s.created_at DESC,
                s.id

              LIMIT 26
              OFFSET ?
              `,
            )
            .bind(...shipmentBindings)
            .all<RecordData>()
        ).results;
    }

    const keys =
      entity ===
      "customers"
        ? [
            "customer_code",
            "full_name",
            "mobile",
            "email",
          ]
        : [
            "tracking_number",
            "full_name",
            "cargo_item",
            "cargo_category",
            "status",
            "arrival_window",
            "payment_status",
            "nihao_payment",
          ];
    if (entity === "shipments") {
      for (const row of rows) {
        row.cargo_category = cargoCategory(row.cargo_category_item, row.cargo_category_group);
        const window = arrivalWindowDone(row.status) ? null : arrivalWindow(row.service_type, row.warehouse_received_date);
        row.arrival_window = window ? shortArrivalWindow(window) : null;
      }
    }

    const table =
      rows.length
        ? `
          ${entity === "customers" && rows.length > 10 ? `<input id="customer-list-expand" class="customer-list-expand" type="checkbox"><style>.customer-list-expand{position:absolute;inline-size:1px;block-size:1px;opacity:0}.customer-list-expand:not(:checked)~.table tr.customer-list-extra{display:none}.customer-list-expand:checked~.customer-list-show-more .more{display:none}.customer-list-expand:not(:checked)~.customer-list-show-more .less{display:none}</style>` : ""}
          <div class="table">
            <table>
              <thead>
                <tr>
                  ${keys
                    .map(
                      (key) =>
                        `<th>${esc(
                          labels[
                            key
                          ] ??
                            key.replaceAll(
                              "_",
                              " ",
                            ),
                        )}</th>`,
                    )
                    .join("")}

                  ${entity === "customers" && canWrite ? `<th>
                    Shipment
                  </th>` : ""}
                </tr>
              </thead>

              <tbody>
                ${rows
                  .slice(
                    0,
                    25,
                  )
                  .map(
                    (row, index) =>
                      `<tr${entity === "customers" && index >= 10 ? ' class="customer-list-extra"' : ""}>
                        ${keys
                          .map(
                            (
                              key,
                            ) => {
                              const value = esc(row[key]) || "—";
                              return `<td>${key === keys[0] ? `<a class="record-identifier" href="${path}?id=${esc(row.id)}">${value}</a>` : value}</td>`;
                            },
                          )
                          .join("")}

                        ${entity === "customers" && canWrite ? `<td>
                          <a
                            class="button"
                            href="/admin/shipments?new=1&customer_id=${esc(row.id)}"
                          >
                            Add shipment
                          </a>
                        </td>` : ""}
                      </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          ${entity === "customers" && rows.length > 10 ? `<label class="button customer-list-show-more" for="customer-list-expand"><span class="more">Show ${rows.length - 10} more customers</span><span class="less">Show fewer customers</span></label>` : ""}
        `
        : "<p>No matching records.</p>";

    const pageLink =
      (
        number:
          number,
      ) => {
        const params =
          new URLSearchParams(
            url.searchParams,
          );

        params.set(
          "page",
          String(
            number,
          ),
        );

        return `${path}?${esc(
          params.toString(),
        )}`;
      };

    return page(
      title,
      `
        ${notice}

        <section>
          <form
            method="get"
            action="${path}"
            class="search"
          >
            <label>
              Search ${entity}

              <input
                name="q"
                maxlength="160"
                value="${esc(
                  q,
                )}"
              >
            </label>

            ${
              customer
                ? hidden(
                    "customer_id",
                    customer,
                  )
                : ""
            }

            ${
              entity ===
              "shipments"
                ? `
                  <label>
                    Status

                    <select
                      name="status"
                    >
                      <option
                        value=""
                      >
                        All statuses
                      </option>

                      ${statuses
                        .map(
                          (
                            value,
                          ) =>
                            `<option${
                              status ===
                              value
                                ? " selected"
                                : ""
                            }>${esc(
                              value,
                            )}</option>`,
                        )
                        .join("")}
                    </select>
                  </label>
                `
                : ""
            }

            <button
              type="submit"
            >
              Search
            </button>

            <a
              href="${path}"
            >
              Clear
            </a>
          </form>

          ${canWrite ? `<div class="actions">
            <a
              class="button"
              href="${path}?new=1"
            >
              Add ${
                entity ===
                "customers"
                  ? "customer"
                  : "shipment"
              }
            </a>
          </div>` : ""}
          </section>

        <section>
          <h2>${entity === "customers" ? "Customers" : "Shipments"}</h2>
          ${table}

          <div class="actions">
            ${
              pageNumber >
              1
                ? `<a
                    href="${pageLink(
                      pageNumber -
                        1,
                    )}"
                  >
                    Previous
                  </a>`
                : ""
            }

            <span>
              Page ${pageNumber}
            </span>

            ${
              rows.length >
              25
                ? `<a
                    href="${pageLink(
                      pageNumber +
                        1,
                    )}"
                  >
                    Next
                  </a>`
                : ""
            }
          </div>
        </section>
      `,
      user.name,
      200,
      {},
      canWrite,
    );
  } catch (error) {
    const known =
      error instanceof
      AdminError;

    const invalid =
      error instanceof
      ZodError;

    if (
      !known &&
      !invalid
    ) {
      console.error(
        "KargoDoor admin request failed",
        {
          path:
            new URL(
              request.url,
            ).pathname,

          error:
            error instanceof
            Error
              ? error.message
              : "Unknown error",
        },
      );
    }

    const message =
      known
        ? error.message
        : invalid
          ? error.issues
              .map(
                (
                  issue,
                ) =>
                  `${issue.path.join(
                    " ",
                  )}: ${issue.message}`,
              )
              .join(
                "; ",
              )
          : "Unable to complete this request. Please try again. If it continues, ask the system owner to check the admin configuration.";

    const status =
      known
        ? error.status
        : invalid
          ? 400
          : 500;

    return page(
      "Admin",
      `
        <p
          class="notice"
          role="alert"
        >
          ${esc(
            message,
          )}
        </p>

        <p>
          For form errors, use your
          browser’s Back button to
          correct the values. For a
          conflicting edit, reload
          the record first.
        </p>

        <a
          href="/admin/dashboard"
        >
          Return to admin
        </a>
      `,
      "",
      status,
      status ===
          401 &&
        localChallenge
        ? {
            "WWW-Authenticate":
              'Basic realm="KargoDoor local admin", charset="UTF-8"',
          }
        : {},
    );
  }
}
