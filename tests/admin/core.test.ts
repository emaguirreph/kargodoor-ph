import { paymentInstructions } from "../../lib/admin/customer-messages";
import { financeAccountsPage } from "../../lib/admin/finance-accounts";
import { niHaoCopyText, niHaoDetailsBox, niHaoFileResponse, readNiHaoDetails, readNiHaoFile, saveNiHaoDetails, saveNiHaoFile, takeNiHaoDetails } from "../../lib/admin/nihao-details";
import { kargodoorBankAccounts, nihaoBankAccounts } from "../../lib/admin/bank-accounts";
import { mutateFinanceCash } from "../../lib/admin/finance-cash";
import type { D1Database } from "@cloudflare/workers-types";
import { itemCategories } from "../../lib/admin/quotation-pricing";
import { calculateCbmConversion, calculateTotalCbm } from "../../lib/admin/quotation-cbm";
import { calculateDensity, densityStatus, densityThreshold } from "../../lib/admin/quotation-density";
import { calculateAdminAirQuote, calculateAdminSeaQuote } from "../../lib/admin/quotation-calculation";
import { isQuotationNumeric, nihaoQuoteLines } from "../../lib/admin/quotations";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import {
  customerSchema,
  shipmentSchema,
  parseForm,
  parseExpenseForm,
  type RecordData,
} from "../../lib/admin/validation";
import { marginSummarySql, finance, activity, dashboard, saveStaffFollowUp } from "../../lib/admin/reports";
import { saveRecord } from "../../lib/admin/data";
import { createShipmentFromApprovedQuotation } from "../../lib/admin/quotation-shipment";
import { shipmentNiHaoEstimate } from "../../lib/admin/nihao-estimate";
import { resolveManualShipmentCharge, resolveQuotationShipmentCharge, syncVerifiedFreightToInvoice, verifiedShipmentFreight } from "../../lib/admin/shipment-verified-pricing";
import { shipmentCargo } from "../../lib/admin/shipment-cargo";
import { archiveInvoice, createInvoice, createView, issueInvoice, recordPayment, voidInvoice } from "../../lib/admin/billing";
import {
  validateJwt,
  csrfToken,
  checkCsrf,
  canonicalOrigin,
  adminOriginAllowed,
  authenticate,
  canDeleteAdmin,
  requireAdminDelete,
  type AdminEnv,
  canMutateAdmin,
  requireAdminMutation,
  secureHeaders,
} from "../../lib/admin/security";
import { expensesPage, saveExpense, mutateExpense } from "../../lib/admin/expenses";
import { proofCell, readProofFile, readProofs, saveProof } from "../../lib/admin/payment-proof";
import { readShipmentPayments, shipmentPaymentsList } from "../../lib/admin/shipment-payment";
import { customerShippingInstructions, customerWarehouseAddressMessage, nihaoAddressBook, shipmentShippingInstructions, warehouseAddress } from "../../lib/admin/shipping-instructions";
import { notificationKeyFor, shipmentStatusMessages } from "../../lib/admin/customer-messages";
function database(includePhase1 = true) {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0002_freight_cost.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0003_invoices_payments.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0004_public_tracking.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0005_expenses.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0006_admin_viewer_role.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0007_staff_follow_up.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0008_customer_accounts.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0010_quotations.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0011_finance_cash_entries.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0012_staff_quotation_expense_access.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0013_promote_managers_to_admin.sql", "utf8"));
  if (includePhase1)
    sql.exec(readFileSync("migrations/admin/0014_approved_quotation_shipments.sql", "utf8"));
  if (includePhase1)
    sql.exec(readFileSync("migrations/admin/0016_cargo_intake_workflow.sql", "utf8"));
  if (includePhase1)
    sql.exec(readFileSync("migrations/admin/0017_message_library.sql", "utf8"));
  if (includePhase1) {
    sql.exec(readFileSync("migrations/admin/0018_record_lifecycle_states.sql", "utf8"));
    sql.exec(readFileSync("migrations/admin/0019_archive_shipments_quotations_invoices.sql", "utf8"));
    sql.exec(readFileSync("migrations/admin/0020_leads.sql", "utf8"));
    sql.exec(readFileSync("migrations/admin/0021_lead_contact_and_lifecycle.sql", "utf8"));
    sql.exec(readFileSync("migrations/admin/0022_full_container_quotations.sql", "utf8"));
    sql.exec(readFileSync("migrations/admin/0023_fcl_shipments.sql", "utf8"));
    sql.exec(readFileSync("migrations/admin/0025_sea_freight_tracking_statuses.sql", "utf8"));
    sql.exec(readFileSync("migrations/admin/0026_bulk_quotation_shipments.sql", "utf8"));
    sql.exec(readFileSync("migrations/admin/0028_invoice_reissue_after_void.sql", "utf8"));
  }
  sql.exec(readFileSync("migrations/admin/0029_nihao_cost_source.sql", "utf8"));
  if (includePhase1)
    sql.exec(readFileSync("migrations/admin/0030_manual_shipment_cargo.sql", "utf8"));
  if (includePhase1)
    sql.exec(readFileSync("migrations/admin/0031_manual_shipment_description_and_auto_charge.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0033_transfer_fee_collected.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0034_bank_accounts.sql", "utf8"));
  if (includePhase1)
    sql.exec(readFileSync("migrations/admin/0035_air_transit_status.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0036_shipment_nihao_details.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0037_shipment_delivered_date.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0038_payment_proofs.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0039_account_transfers.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0041_client_source_referrals.sql", "utf8"));
  const user = randomUUID();
  sql
    .prepare("INSERT INTO admin_users VALUES (?,?,?,?,?,?)")
    .run(
      user,
      "Admin",
      "admin@example.test",
      "admin",
      "2026-01-01",
      "2026-01-01",
    );
  function prepare(query: string) {
    let args: unknown[] = [];
    return {
      bind(...v: unknown[]) {
        args = v;
        return this;
      },
      async first() {
        return sql.prepare(query).get(...(args as never[])) ?? null;
      },
      async all() {
        return { results: sql.prepare(query).all(...(args as never[])) };
      },
      async run() {
        return { meta: sql.prepare(query).run(...(args as never[])) };
      },
    };
  }
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        sql.exec("COMMIT");
        return out;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  return { sql, db, user };
}
const customer = customerSchema.parse({
  customer_code: "KD-001",
  full_name: "Test customer",
  company_name: "",
  mobile: "+639171234567",
  email: "",
  address: "",
  notes: "",
});
const shipmentInput = (id: string) =>
  ({
    customer_id: id,
    tracking_number: "KDOOR-0001",
    cargo_code: "",
    service_type: "Sea Freight",
    china_warehouse: "Guangzhou",
    warehouse_received_date: "",
    departure_date: "",
    cbm: "1.250",
    weight_kg: "425",
    status: "China Warehouse",
    estimated_arrival: "2026-10-01",
    actual_arrival: "",
    delivered_date: "",
    tracking_remarks: "",
    shipping_charge: "6500.25",
    nihao_cost: "",
    delivery_charge: "0",
    payment_status: "Unpaid",
    supplier_waybill_number: "",
    supplier_courier: "",
    verified_cbm: "",
    verified_weight_kg: "",
  });
const shipment = (id: string) => shipmentSchema.parse(shipmentInput(id));

test("shipping instructions include the customer account code and supplier details", () => {
  const customerMessage = customerShippingInstructions({ name: "Maria", customerCode: "KD-10025", service: "Air Freight", warehouse: "Guangzhou" });
  assert.match(customerMessage, /Hi Maria/);
  assert.match(customerMessage, /Cargo Code: KD-10025/);
  assert.match(customerMessage, /Shipping Method: Air Freight ✈️/);
  assert.match(customerMessage, /Assigned Warehouse: Guangzhou/);
  assert.match(customerMessage, /广州市白云区江高镇沙溪东路18号166通达仓库/);
  assert.match(customerMessage, /中文说明（请转发供应商）/);
  assert.match(customerMessage, /ENGLISH – SHIPPING REMINDERS/);
  assert.ok(customerMessage.includes("SEA KD-10025"));
  assert.ok(customerMessage.includes("AIR KD-10025"));
  assert.match(customerMessage, /will NOT be accepted by the warehouse/);
  assert.match(customerMessage, /ONCE SHIPPED, PLEASE SEND US/);
  assert.match(customerMessage, /Thank you for trusting KargoDoorPH\.com! 💚 💙$/);

  const addressMessage = customerWarehouseAddressMessage({ name: "Maria", customerCode: "KD-10025", warehouse: "Yiwu" });
  assert.match(addressMessage, /Hi Maria/);
  assert.match(addressMessage, /Account\/Cargo Code: KD-10025/);
  assert.ok(addressMessage.includes(warehouseAddress("Yiwu")));
  assert.doesNotMatch(addressMessage, /中文说明/);
  assert.match(customerWarehouseAddressMessage({ name: "Maria", warehouse: "Taiwan" }), /\[Add warehouse address\]/);
  assert.match(warehouseAddress("Hong Kong"), /香港新界葵涌贷柜码头路51-63号葵顺工业中心9楼E室/);

  // Hong Kong sea cargo is labelled TD KDOOR-XXXX; other sea routes keep SEA KDOOR-XXXX.
  const hongKongMessage = customerShippingInstructions({ name: "Maria", customerCode: "KDOOR-1234", service: "Sea Freight", warehouse: "Hong Kong" });
  assert.match(hongKongMessage, /Shipping Mark: TD KDOOR-1234/);
  assert.match(hongKongMessage, /SEA FREIGHT \(HONG KONG\) – Label Example\n\nTD KDOOR-1234\n/);
  assert.doesNotMatch(hongKongMessage, /SEA KDOOR-1234|AIR KDOOR-1234/);
  assert.match(customerWarehouseAddressMessage({ name: "Maria", customerCode: "KDOOR-1234", warehouse: "Hong Kong" }), /place TD KDOOR-1234 clearly/);
  const guangzhouMessage = customerShippingInstructions({ name: "Maria", customerCode: "KDOOR-1234", service: "Sea Freight", warehouse: "Guangzhou" });
  assert.match(guangzhouMessage, /\nSEA KDOOR-1234\n/);
  assert.match(guangzhouMessage, /\(Hong Kong warehouse: TD KDOOR-1234\)/);
  assert.doesNotMatch(guangzhouMessage, /Shipping Mark:/);

  const shipmentMessage = shipmentShippingInstructions({
    name: "Maria",
    customerCode: "KD-10025",
    service: "Sea Freight",
    warehouse: "Guangzhou",
  });
  assert.match(shipmentMessage, /Shipping Method: Sea Freight 🚢/);
  assert.match(shipmentMessage, /Assigned Warehouse: Guangzhou/);
  assert.match(shipmentMessage, /广州市白云区江高镇沙溪东路18号166通达仓库/);
  assert.match(shipmentMessage, /Courier: SF Express/);
  assert.match(shipmentMessage, /Tracking\/Waybill No\.: SF123456789/);
  assert.match(shipmentMessage, /Packing List/);
  assert.match(warehouseAddress("Tongda Air Cargo"), /TONGDA AIR CARGO/);
});

function insertQuotation(sql: DatabaseSync, values: {
  id?: string;
  number?: string;
  status?: string;
  freightType?: string;
  customerId?: string | null;
  customer?: Record<string, unknown>;
  cargo?: Record<string, unknown>;
} = {}) {
  const id = values.id ?? randomUUID();
  const now = "2026-09-15T00:00:00.000Z";
  sql.prepare(`INSERT INTO quotations (
    id, quotation_number, customer_id, status, freight_type, quotation_date,
    valid_until, prepared_by, customer_snapshot, cargo_snapshot, pricing_snapshot,
    calculated_amount, override_amount, override_reason, final_amount, backend_cost,
    additional_cost, delivery_cost, notes, prepared_by_admin_user_id, created_at, updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,
    values.number ?? `KD-Q-2026-${id.slice(0, 3)}`,
    values.customerId ?? null,
    values.status ?? "Approved",
    values.freightType ?? "Sea Freight",
    "2026-09-15",
    null,
    "Admin",
    JSON.stringify(values.customer ?? {
      name: "Quotation customer", company: "Test Co", mobile: "+639171234567",
      email: "quotation@example.test", address: "Manila",
    }),
    JSON.stringify(values.cargo ?? {
      item: "Bags", description: "Bags", cbm: "1.25", weight: "425",
      originWarehouse: "Guangzhou",
    }),
    JSON.stringify({ final: 5000 }),
    500000,
    null,
    null,
    500000,
    null,
    null,
    null,
    null,
    null,
    now,
    now,
  );
  return id;
}





test("live admin Air calculation delegates to the authoritative pricing engine", () => {
  const ordinary = calculateAdminAirQuote({ freightType: "Air Freight", item: "Ordinary Items", cbm: "0.10", weight: "10", quantity: "1" });
  assert.equal(ordinary.rate, 500);
  assert.equal(ordinary.volumetricWeight, 16.7);
  assert.equal(ordinary.billableWeight, 17);
  assert.equal(ordinary.final, 8530);
  const actualWeight = calculateAdminAirQuote({ freightType: "Air Freight", item: "Ordinary Items", cbm: "0.01", weight: "20.1", quantity: "1" });
  assert.equal(actualWeight.billableWeight, 21);
  assert.equal(calculateAdminAirQuote({ freightType: "Air Freight", item: "Liquid, Powder, Food, Computer Parts, Electronics", cbm: "0.01", weight: "1", quantity: "1" }).rate, 600);
  assert.equal(calculateAdminAirQuote({ freightType: "Air Freight", item: "Medicine and Food Supplements", cbm: "0.01", weight: "1", quantity: "1" }).rate, 650);
  for (const [item, rate] of [["Mobile Phones", 950], ["Tablets", 1200], ["Laptop Computers", 2800]] as const) {
    const result = calculateAdminAirQuote({ freightType: "Air Freight", item, cbm: "0", weight: "0", quantity: "2" });
    assert.equal(result.rateBasis, "Per piece");
    assert.equal(result.final, rate * 2 + 30);
  }
});
test("live admin Sea calculation delegates to the authoritative pricing engine", () => {
  const solar = calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Solar panels", cbm: "8.38593", weight: "3400", units: "0", pricingDate: "2026-11-09T08:00:00.000Z" });
  assert.equal(solar.category, "COMMODITIES");
  assert.equal(solar.cbmRate, 9500);
  assert.equal(solar.packageTier, "KD Standard");
  assert.equal(solar.densityApplies, false);
  assert.equal(solar.final.toFixed(2), "79696.34");
  // The same cargo on a quotation created from 2026-11-10 uses the new rates (KargoDoor ₱11,199, Ni Hao ₱9,500).
  const solarNew = calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Solar panels", cbm: "8.38593", weight: "3400", units: "0", pricingDate: "2026-11-10T00:30:00.000Z" });
  assert.equal(solarNew.cbmRate, 11199);
  assert.equal(solarNew.final.toFixed(2), (8.38593 * 11199 + 30).toFixed(2));
  assert.equal(solarNew.niHaoEstimate, Math.round(8.38593 * 9500 * 100) / 100);
  assert.equal(solar.niHaoEstimate, Math.round(8.38593 * 8500 * 100) / 100);
  const denseSolar = calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Solar panels", cbm: "0.126", weight: "1000", units: "0" });
  assert.equal(denseSolar.category, "COMMODITIES");
  assert.equal(denseSolar.packageTier, "KD Max");
  assert.equal(denseSolar.densityApplies, true);
  assert.equal(denseSolar.base, 1700);
  assert.equal(denseSolar.densityCharge, 22000);
  assert.equal(denseSolar.final, 22030);
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "0.01", weight: "1", units: "0" }).packageTier, "KD Mini");
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "0.05", weight: "1", units: "0" }).packageTier, "KD Lite");
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "0.125", weight: "1", units: "0" }).packageTier, "KD Plus");
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "1", weight: "425", units: "0" }).densityApplies, false);
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "1", weight: "500", units: "0" }).packageTier, "KD Max");
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "0.01", weight: "100", units: "0" }).packageTier, "KD Max");
  for (const item of ["Mobile phones", "Computers", "Tablets"]) {
    assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item, cbm: "1", weight: "1", units: "1", pricingDate: "2026-11-09" }).final, 10780);
    assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item, cbm: "1", weight: "1", units: "1", pricingDate: "2026-11-10" }).final, 13279);
  }
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Mobile / computer parts & accessories", cbm: "1", weight: "1", units: "1" }).category, "MOBILE / COMPUTERS / TABLETS");
});
test("admin quotation density uses the strict 425 kg/CBM threshold", () => {
  assert.equal(densityThreshold, 425);
  assert.equal(calculateDensity("8.38593", "3400")!.toFixed(2), "405.44");
  assert.equal(calculateDensity("2", "800"), 400);
  assert.equal(densityStatus(calculateDensity("2", "800")), "WITHIN THRESHOLD");
  assert.equal(calculateDensity("2", "850"), 425);
  assert.equal(densityStatus(calculateDensity("2", "850")), "WITHIN THRESHOLD");
  assert.equal(densityStatus(calculateDensity("2", "850.01")), "ABOVE THRESHOLD — WEIGHT CHARGE COMPARISON APPLIES");
  assert.equal(calculateDensity("0", "100"), null);
  assert.throws(() => calculateDensity("1", "-1"));
});
test("admin quotation CBM conversion is authoritative and rejects invalid dimensions", () => {
  assert.equal(calculateTotalCbm({ length: "1000", width: "500", height: "200", measurementUnit: "mm", quantity: "2" }), 0.2);
  assert.equal(calculateTotalCbm({ length: "100", width: "50", height: "20", measurementUnit: "cm", quantity: "1" }), 0.1);
  assert.equal(calculateTotalCbm({ length: "2", width: "1", height: "0.5", measurementUnit: "m", quantity: "3" }), 3);
  assert.equal(calculateTotalCbm({ length: "2465", width: "1134", height: "30", measurementUnit: "mm", quantity: "100" }), 8.38593);
  for (const input of [
    { length: "0", width: "1", height: "1", measurementUnit: "m", quantity: "1" },
    { length: "-1", width: "1", height: "1", measurementUnit: "m", quantity: "1" },
    { length: "1", width: "", height: "1", measurementUnit: "m", quantity: "1" },
    { length: "1", width: "1", height: "1", measurementUnit: "in", quantity: "1" },
  ]) assert.throws(() => calculateTotalCbm(input));
  assert.equal(calculateTotalCbm({ length: "", width: "", height: "", measurementUnit: "cm", quantity: "1" }), null);
});
test("CBM converter uses cm or mm, quantity, and never yields invalid results", () => {
  assert.deepEqual(calculateCbmConversion({ length: "100", width: "50", height: "20", unit: "cm", quantity: "2" }), { single: 0.1, total: 0.2 });
  assert.deepEqual(calculateCbmConversion({ length: "1000", width: "500", height: "200", unit: "mm", quantity: "2" }), { single: 0.1, total: 0.2 });
  assert.equal(calculateCbmConversion({ length: "", width: "50", height: "20", unit: "cm", quantity: "1" }), null);
  for (const input of [
    { length: "0", width: "1", height: "1", unit: "cm", quantity: "1" },
    { length: "1", width: "1", height: "1", unit: "cm", quantity: "0" },
    { length: "1", width: "1", height: "1", unit: "cm", quantity: "1.5" },
    { length: "NaN", width: "1", height: "1", unit: "cm", quantity: "1" },
  ]) assert.throws(() => calculateCbmConversion(input));
});
test("quotation category mapping and origin warehouses stay controlled", () => {
  assert.equal(itemCategories["Solar panels"], "COMMODITIES");
  assert.equal(itemCategories["Mobile phones"], "MOBILE / COMPUTERS / TABLETS");
  assert.equal(itemCategories.Computers, "MOBILE / COMPUTERS / TABLETS");
  assert.equal(itemCategories.Tablets, "MOBILE / COMPUTERS / TABLETS");
  assert.equal(itemCategories["Mobile / computer parts & accessories"], "MOBILE / COMPUTERS / TABLETS");
  const quotationSource = readFileSync("lib/admin/quotations.ts", "utf8");
  assert.match(quotationSource, /const originWarehouses = \[/);
  for (const warehouse of ["Guangzhou", "Yiwu", "Shishi", "Hong Kong", "Taiwan"])
    assert.ok(quotationSource.includes(`"${warehouse}"`));
  assert.doesNotMatch(quotationSource.match(/const originWarehouses[^;]+;/)![0], /Malabon/i);
});
test("quotation numeric validator accepts valid decimals and rejects malformed values", () => {
  for (const value of ["8", "8.38593", ".125", "0.10", "3400", "2465", "0", "80000"])
    assert.equal(isQuotationNumeric(value), true, value);
  for (const value of ["abc", "8.3.2", "NaN", "Infinity", "-Infinity"])
    assert.equal(isQuotationNumeric(value), false, value);
  assert.equal(isQuotationNumeric("8.38593"), true);
});
test("approved quotations create one pending, unpaid shipment with a safe customer match and audit log", async () => {
  const { sql, db, user } = database();
  const existingCustomerId = await saveRecord(db, "customers", {
    ...customer,
    customer_code: "KD-EXISTING",
    email: "quotation@example.test",
  }, user, "", "");
  const quotationId = insertQuotation(sql);
  const result = await createShipmentFromApprovedQuotation(db, user, quotationId);
  const created = sql.prepare("SELECT * FROM shipments WHERE id = ?").get(result.shipmentId)!;
  assert.equal(result.customerId, existingCustomerId);
  assert.equal(result.customerCreated, false);
  assert.match(result.trackingNumber, /^KDSEA-[1-9]\d{5}$/);
  assert.equal(created.source_quotation_id, quotationId);
  assert.equal(created.status, "Awaiting Supplier Dispatch");
  assert.equal(created.payment_status, "Unpaid");
  assert.equal(created.warehouse_received_date, null);
  assert.equal(created.departure_date, null);
  assert.equal(created.shipping_charge, 500000);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM invoices").get()!.n, 0);
  const log = sql.prepare("SELECT * FROM activity_log WHERE entity_id = ? AND action = 'create_from_approved_quotation'").get(result.shipmentId)!;
  assert.equal(log.admin_user_id, user);
  assert.equal(JSON.parse(String(log.new_value)).source_quotation_id, quotationId);
  await assert.rejects(createShipmentFromApprovedQuotation(db, user, quotationId), /already exists/);
});
/** Freezes the clock on 2026-11-09 (Manila) so records made in the test are priced on the pre-2026-11-10 sea rates. */
const pinBeforeNewSeaRates = (t: { mock: { timers: { enable: (options: { apis: "Date"[]; now: number }) => void } } }) =>
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-09T08:00:00.000Z") });
test("shipments get a Ni Hao cost estimate from the Ni Hao rates unless Ni Hao's actual cost is known", async (t) => {
  pinBeforeNewSeaRates(t); // expected amounts below use the sea rates before 2026-11-10
  const { sql, db, user } = database();
  const estimated = await createShipmentFromApprovedQuotation(db, user, insertQuotation(sql));
  const row = sql.prepare("SELECT nihao_cost, nihao_cost_source FROM shipments WHERE id = ?").get(estimated.shipmentId)!;
  assert.equal(row.nihao_cost, 875000, "1.25 CBM of Bags × ₱7,000");
  assert.equal(row.nihao_cost_source, "estimate");

  const quotedId = insertQuotation(sql, { cargo: { item: "Bags", category: "LOW VALUE GOODS", cbm: "1", weight: "100", originWarehouse: "Guangzhou" } });
  sql.prepare("UPDATE quotations SET backend_cost = 650000, backend_cost_source = 'actual' WHERE id = ?").run(quotedId);
  const quoted = await createShipmentFromApprovedQuotation(db, user, quotedId);
  assert.deepEqual({ ...sql.prepare("SELECT nihao_cost, nihao_cost_source FROM shipments WHERE id = ?").get(quoted.shipmentId) }, { nihao_cost: 650000, nihao_cost_source: "actual" });

  const verified = await shipmentNiHaoEstimate(db, estimated.shipmentId, { service_type: "Sea Freight", cbm: 1.25, weight_kg: 425, verified_cbm: 1, verified_weight_kg: 600 });
  assert.equal(verified?.cost, 840000, "verified size is used; 600 kg/CBM is over 500, so 600 kg × ₱14");

  const manual = await shipmentNiHaoEstimate(db, "", { service_type: "Air Freight", cbm: 0.0381, weight_kg: 7.5, tracking_remarks: "Item: Ordinary Items" });
  assert.equal(manual?.cost, 280000, "hand-added shipments use the Item line in their remarks");
  assert.equal(await shipmentNiHaoEstimate(db, "", { service_type: "FCL", cbm: 30, weight_kg: 1000 }), null);
});
test("air shipments get an Air Transit notification with the flight date", () => {
  const air = shipmentStatusMessages({ customerName: "Ana", tracking: "KDAIR-123456", service: "Air Freight", flightDate: "2026-10-30" });
  const message = air.find(([key]) => key === "air-transit")![2];
  assert.match(message, /on its flight to the Philippines/);
  assert.match(message, /Flight Date: 2026-10-30/);
  const sea = shipmentStatusMessages({ customerName: "Ana", tracking: "KDSEA-123456", service: "Sea Freight", flightDate: "2026-10-30" });
  assert.doesNotMatch(sea.find(([key]) => key === "sea-transit")![2], /Flight Date/);
  assert.doesNotMatch(sea.find(([key]) => key === "china-port")![2], /Flight Date/);
});
test("migration 0035 moves Air Freight shipments on Sea Transit to Air Transit", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", { ...customer, customer_code: "KD-AIRMIG", email: "airmig@example.test" }, user, "", "");
  const insert = sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  insert.run("air", customerId, "KDAIR-200001", "Air Freight", "Guangzhou", 0, 5, "Sea Transit", 0, 0, "Unpaid", "2026-10-01", "2026-10-01");
  insert.run("sea", customerId, "KDSEA-200002", "Sea Freight", "Guangzhou", 1, 5, "Sea Transit", 0, 0, "Unpaid", "2026-10-01", "2026-10-01");
  const migration = readFileSync("migrations/admin/0035_air_transit_status.sql", "utf8");
  // The test database already has 0035, so run it again under another temporary column name.
  sql.exec(migration.replaceAll("status_next", "status_again"));
  assert.deepEqual(sql.prepare("SELECT id, status FROM shipments ORDER BY id").all().map((row) => [row.id, row.status]), [["air", "Air Transit"], ["sea", "Sea Transit"]]);
  assert.throws(() => sql.exec("UPDATE shipments SET status = 'Flying'"), /CHECK/);
});
test("shipments added by hand carry their own cargo details and compute the KargoDoor charge and Ni Hao cost automatically", async (t) => {
  pinBeforeNewSeaRates(t); // expected amounts below use the sea rates before 2026-11-10
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", { ...customer, customer_code: "KD-MANUAL", email: "manual@example.test" }, user, "", "");
  const { tracking_number: _t, cargo_code: _c, ...formInput } = shipmentInput(customerId);
  void _t; void _c;
  const form = (values: Record<string, string>) => parseForm("shipments", new URLSearchParams(Object.entries({ ...formInput, ...values }))) as RecordData;

  assert.throws(() => form({ cargo_item: "Mobile Phones" }), /Sea Freight item/);
  assert.throws(() => form({ service_type: "Air Freight", status: "In Transit", cargo_item: "LED lights" }), /Air Freight item/);
  assert.throws(() => form({ cargo_item: "Something else" }));
  assert.throws(() => form({ cargo_quantity: "0" }));

  // Sea: description shows as the cargo, the item sets the category, and a blank charge comes from the rates.
  const sea = form({ cargo_description: "Kitchen organizers", cargo_item: "LED lights", shipping_charge: "" });
  assert.deepEqual([sea.cargo_description, sea.cargo_item, sea.cargo_category, sea.shipping_charge], ["Kitchen organizers", "LED lights", "COMMODITIES", null]);
  const seaCharge = resolveManualShipmentCharge(sea, null);
  assert.deepEqual(seaCharge, { cost: 1190500, source: "rate" }, "1.25 CBM of Commodities × ₱9,500");
  const seaId = await saveRecord(db, "shipments", { ...sea, shipping_charge: seaCharge.cost, shipping_charge_source: seaCharge.source }, user, "", "");
  assert.deepEqual({ ...(await shipmentCargo(db, seaId)) }, { item: "Kitchen organizers", category: "LED lights (Commodities)", quotationId: null, quotationNumber: null });
  assert.equal((await shipmentNiHaoEstimate(db, seaId, sea))?.cost, 1062500, "1.25 CBM of Commodities × ₱8,500");

  // Saving the verified size with the charge untouched moves the charge to the new rate.
  const saved = sql.prepare("SELECT shipping_charge, shipping_charge_source FROM shipments WHERE id = ?").get(seaId)!;
  const verified = form({ cargo_item: "LED lights", shipping_charge: "11905.00", verified_cbm: "1", verified_weight_kg: "300" });
  assert.deepEqual(resolveManualShipmentCharge(verified, saved), { cost: 953000, source: "rate" });
  // A typed charge is kept, also after the size changes.
  assert.deepEqual(resolveManualShipmentCharge(form({ cargo_item: "LED lights", shipping_charge: "5000" }), saved), { cost: 500000, source: "manual" });
  assert.deepEqual(resolveManualShipmentCharge(verified, { shipping_charge: 1190500, shipping_charge_source: "manual" }), { cost: 1190500, source: "manual" });
  // Clearing the box goes back to the rate; nothing to price and no charge is an error.
  assert.deepEqual(resolveManualShipmentCharge({ ...verified, shipping_charge: null }, { shipping_charge: 500000, shipping_charge_source: "manual" }), { cost: 953000, source: "rate" });
  assert.throws(() => resolveManualShipmentCharge(form({ shipping_charge: "" }), null), /Item \/ Commodity/);

  // Air piece items use Units.
  const air = form({ service_type: "Air Freight", status: "In Transit", cargo_item: "Mobile Phones", cargo_quantity: "3", shipping_charge: "" });
  assert.equal(air.cargo_category, "Mobile Phones");
  assert.deepEqual(resolveManualShipmentCharge(air, null), { cost: 288000, source: "rate" }, "3 units × ₱950");
  assert.equal((await shipmentNiHaoEstimate(db, "", air))?.cost, 240000, "3 units × ₱800");

  // Air Freight uses Air Transit with a flight date; Sea Transit stays sea-only.
  const airTransit = form({ service_type: "Air Freight", status: "Air Transit", cargo_item: "Mobile Phones", cargo_quantity: "3", departure_date: "2026-10-30" });
  assert.deepEqual([airTransit.status, airTransit.departure_date], ["Air Transit", "2026-10-30"]);
  assert.throws(() => form({ service_type: "Air Freight", status: "Sea Transit", cargo_item: "Mobile Phones" }), /Use Air Transit/);
  assert.throws(() => form({ status: "Air Transit", cargo_item: "LED lights" }), /only for Air Freight/);
  assert.equal(form({ status: "Sea Transit", cargo_item: "LED lights" }).status, "Sea Transit");

  // Older hand-added shipments with only an "Item:" remarks line still get a Ni Hao estimate.
  const legacyId = randomUUID();
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, tracking_remarks, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(legacyId, customerId, "KDAIR-100001", "Air Freight", "Guangzhou", 0.0381, 7.5, "In Transit", "Item: Ordinary Items\nPacked in 2 boxes", 300000, 0, "Unpaid", "2026-10-01", "2026-10-01");
  const migration = readFileSync("migrations/admin/0030_manual_shipment_cargo.sql", "utf8");
  sql.exec(migration.slice(migration.indexOf("UPDATE shipments")));
  assert.equal(sql.prepare("SELECT cargo_item FROM shipments WHERE id = ?").get(legacyId)!.cargo_item, "Ordinary Items", "migration 0030 copies the Item line");
  assert.equal((await shipmentNiHaoEstimate(db, legacyId, { service_type: "Air Freight", cbm: 0.0381, weight_kg: 7.5 }))?.cost, 280000);
  assert.equal(await verifiedShipmentFreight(db, legacyId, 0.0381, 7.5), null, "hand-added shipments are not repriced through the quotation path");
});
test("from 2026-11-10 new sea rates price new work while earlier quotations and shipments keep their rates", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-15T03:00:00.000Z") });
  const { sql, db, user } = database();
  const cargo = { item: "Bags", category: "LOW VALUE GOODS", cbm: "2", weight: "300", originWarehouse: "Guangzhou" };

  // Quotation made on 2026-09-15 (before), with a saved final amount.
  const oldQuotation = insertQuotation(sql, { cargo });
  const oldSaved = sql.prepare("SELECT final_amount, calculated_amount, pricing_snapshot FROM quotations WHERE id = ?").get(oldQuotation)!;
  const oldShipment = await createShipmentFromApprovedQuotation(db, user, oldQuotation);
  assert.deepEqual(await verifiedShipmentFreight(db, oldShipment.shipmentId, 2, 300), { shippingCharge: (2 * 7999 + 30) * 100, pricingMethod: "CBM-Based" });
  assert.equal((await shipmentNiHaoEstimate(db, oldShipment.shipmentId, { service_type: "Sea Freight", verified_cbm: 2, verified_weight_kg: 300 }))?.cost, 2 * 7000 * 100);
  assert.deepEqual({ ...sql.prepare("SELECT final_amount, calculated_amount, pricing_snapshot FROM quotations WHERE id = ?").get(oldQuotation)! }, { ...oldSaved }, "saved quotation amounts are untouched");

  // The same cargo on a quotation made on 2026-11-10 (Manila) uses the new rates.
  const newQuotation = insertQuotation(sql, { cargo });
  sql.prepare("UPDATE quotations SET created_at = '2026-11-09T16:00:00.000Z' WHERE id = ?").run(newQuotation);
  const newShipment = await createShipmentFromApprovedQuotation(db, user, newQuotation);
  assert.deepEqual(await verifiedShipmentFreight(db, newShipment.shipmentId, 2, 300), { shippingCharge: (2 * 9499 + 30) * 100, pricingMethod: "CBM-Based" });
  assert.equal((await shipmentNiHaoEstimate(db, newShipment.shipmentId, { service_type: "Sea Freight", verified_cbm: 2, verified_weight_kg: 300 }))?.cost, 2 * 8000 * 100);

  // Shipments added by hand follow their own date.
  const values = { service_type: "Sea Freight", cargo_item: "Batteries", cargo_category: "SENSITIVE - BATTERIES", cbm: 1, weight_kg: 300, shipping_charge: null };
  assert.deepEqual(resolveManualShipmentCharge({ ...values, created_at: "2026-11-01T02:00:00.000Z" }, null), { cost: 1603000, source: "rate" }, "before: ₱16,000 + ₱30");
  assert.deepEqual(resolveManualShipmentCharge({ ...values, created_at: null }, null), { cost: 1902900, source: "rate" }, "new shipment: ₱18,999 + ₱30");
});
test("verified warehouse measurements recalculate Sea and Air freight and refresh only eligible invoices", async (t) => {
  pinBeforeNewSeaRates(t); // expected amounts below use the sea rates before 2026-11-10
  const { sql, db, user } = database();

  const seaQuotationId = insertQuotation(sql, {
    cargo: {
      item: "Bags",
      category: "LOW VALUE GOODS",
      cbm: "1.25",
      weight: "425",
      originWarehouse: "Guangzhou",
    },
  });
  const seaShipment = await createShipmentFromApprovedQuotation(db, user, seaQuotationId);
  const seaInvoice = await createInvoice(db, {
    shipment_id: seaShipment.shipmentId,
    delivery_charge: "100",
    other_charge: "0",
    status: "Draft",
    issued_at: "",
    due_at: "",
  }, user);
  const sea = await verifiedShipmentFreight(db, seaShipment.shipmentId, 1, 500);
  assert.deepEqual(sea, { shippingCharge: 953000, pricingMethod: "Density-Based" });
  await syncVerifiedFreightToInvoice(db, seaShipment.shipmentId, sea!.shippingCharge, user);
  const verifiedInvoice = sql.prepare("SELECT subtotal,total FROM invoices WHERE id=?").get(seaInvoice)!;
  assert.equal(verifiedInvoice.subtotal, 953000);
  assert.equal(verifiedInvoice.total, 963000);

  const airQuotationId = insertQuotation(sql, {
    freightType: "Air Freight",
    cargo: {
      item: "Ordinary Items",
      category: "Ordinary Items",
      cbm: "0.009",
      weight: "1.02",
      packageQuantity: "1",
      calculatorQuantity: "1",
      originWarehouse: "Guangzhou",
    },
  });
  const airShipment = await createShipmentFromApprovedQuotation(db, user, airQuotationId);
  const air = await verifiedShipmentFreight(db, airShipment.shipmentId, 0.009, 1.02);
  assert.deepEqual(air, {
    shippingCharge: 103000,
    pricingMethod: "CEILING(MAX(Declared Weight, CBM × 167)) × rate",
  });

  sql.prepare("UPDATE invoices SET status='Paid' WHERE id=?").run(seaInvoice);
  await syncVerifiedFreightToInvoice(db, seaShipment.shipmentId, 123400, user);
  const paidInvoice = sql.prepare("SELECT subtotal,total FROM invoices WHERE id=?").get(seaInvoice)!;
  assert.equal(paidInvoice.subtotal, 953000);
  assert.equal(paidInvoice.total, 963000);
});
test("approved FCL quotations create an FCL shipment and invoice-ready manual rate", async () => {
  const { sql, db, user } = database();
  const quotationId = insertQuotation(sql, {
    freightType: "Full Container",
    cargo: { item: "Full Container Shipment", description: "FCL test", cbm: "0", weight: "0", originWarehouse: "Ningbo Port", containerSize: "40 ft HQ", containerQuantity: "1" },
  });
  const result = await createShipmentFromApprovedQuotation(db, user, quotationId);
  const shipment = sql.prepare("SELECT service_type,china_warehouse,shipping_charge FROM shipments WHERE id=?").get(result.shipmentId)!;
  assert.equal(result.trackingNumber.startsWith("KDFCL"), true);
  assert.equal(shipment.service_type, "FCL");
  assert.equal(shipment.china_warehouse, "Ningbo Port");
  assert.equal(shipment.shipping_charge, 500000);
  const invoiceId = await createInvoice(db, { shipment_id: result.shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user);
  assert.equal(sql.prepare("SELECT shipment_id FROM invoices WHERE id=?").get(invoiceId)!.shipment_id, result.shipmentId);
});
test("an approved bulk furniture quotation creates one trackable shipment per package and keeps invoices separate", async (t) => {
  pinBeforeNewSeaRates(t); // expected amounts below use the sea rates before 2026-11-10
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", { ...customer, customer_code: "KDOOR-6690", email: "juan.test@example.com" }, user, "", "");
  const packages = [
    ["Wooden Dining Table", .288, 45, 273600, 45000],
    ["Dining Chairs (Set of 4)", .48, 35, 456000, 60000],
    ["Two-Seater Fabric Sofa", 1.148, 65, 1090600, 95000],
    ["Wooden Coffee Table", .264, 25, 250800, 30000],
    ["Wooden Bookshelf", .648, 40, 615600, 70000],
  ].map(([item, cbm, weight, charge, nihaoCost]) => ({ item, catalogItem: "Furniture", category: "COMMODITIES", length: 1, width: 1, height: 1, cbm, weight, charge, nihaoCost, status: "China Warehouse" }));
  const quotationId = insertQuotation(sql, { customerId, cargo: { bulkPackages: packages, originWarehouse: "Guangzhou", cbm: 2.828, weight: 210 } });
  await createShipmentFromApprovedQuotation(db, user, quotationId);
  const shipments = sql.prepare("SELECT tracking_number,source_quotation_id,status,tracking_remarks,shipping_charge,nihao_cost FROM shipments WHERE source_quotation_id=? ORDER BY created_at,id").all(quotationId);
  assert.equal(shipments.length, 5);
  assert.equal(new Set(shipments.map((shipment: any) => shipment.tracking_number)).size, 5);
  for (const shipment of shipments as any[]) {
    assert.match(shipment.tracking_number, /^KDSEA-[1-9]\d{5}$/);
    assert.equal(shipment.source_quotation_id, quotationId);
    assert.equal(shipment.status, "China Warehouse");
    assert.match(shipment.tracking_remarks, /Item:/);
  }
  assert.equal(shipments.reduce((sum: number, shipment: any) => sum + shipment.shipping_charge, 0), 2686600);
  assert.equal(shipments.reduce((sum: number, shipment: any) => sum + shipment.nihao_cost, 0), 300000);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM invoices").get()!.n, 0);
});
test("quotation shipment conversion rejects non-approved quotes and creates a customer for ambiguous or absent matches", async () => {
  const { sql, db, user } = database();
  const draftId = insertQuotation(sql, { status: "Draft" });
  await assert.rejects(createShipmentFromApprovedQuotation(db, user, draftId), /Only approved/);
  const firstId = await saveRecord(db, "customers", { ...customer, customer_code: "KD-ONE", email: "shared@example.test" }, user, "", "");
  await saveRecord(db, "customers", { ...customer, customer_code: "KD-TWO", email: "different@example.test" }, user, "", "");
  sql.prepare("UPDATE customers SET email = ? WHERE id != ? AND customer_code = 'KD-TWO'").run("shared@example.test", firstId);
  const quotationId = insertQuotation(sql, { customer: {
    name: "New customer", company: "New Co", mobile: "+639179999999",
    email: "shared@example.test", address: "Cebu",
  } });
  const result = await createShipmentFromApprovedQuotation(db, user, quotationId);
  assert.equal(result.customerCreated, true);
  assert.equal(sql.prepare("SELECT full_name FROM customers WHERE id = ?").get(result.customerId)!.full_name, "New customer");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM customers WHERE lower(email) = 'shared@example.test'").get()!.n, 3);
});
test("approved quotation conversion validates required saved operational details", async () => {
  const { sql, db, user } = database();
  const quotationId = insertQuotation(sql, { cargo: { cbm: "1", weight: "10", originWarehouse: "" } });
  await assert.rejects(createShipmentFromApprovedQuotation(db, user, quotationId), /China warehouse/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM shipments").get()!.n, 0);
});
test("phase 1 migration preserves existing shipment, invoice, and payment relationships", async () => {
  const { sql, db, user } = database(false);
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const legacyShipment = {
    ...Object.fromEntries(Object.entries(shipment(customerId)).filter(([key]) => !["supplier_waybill_number", "supplier_courier", "verified_cbm", "verified_weight_kg"].includes(key))),
    status: "Received at Warehouse",
  };
  const shipmentId = await saveRecord(db, "shipments", legacyShipment, user, "", "");
  const invoiceId = randomUUID();
  sql.prepare(`INSERT INTO invoices (id, invoice_number, customer_id, shipment_id, subtotal, delivery_charge, total, status, issued_at, due_at, created_at, updated_at, other_charge)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceId, "INV-MIGRATE", customerId, shipmentId, 10000, 0, 10000, "Unpaid", null, null, "2026-09-15", "2026-09-15", 0);
  sql.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?,?,?)").run(randomUUID(), invoiceId, customerId, 1000, "Cash", null, "2026-09-15", null, "2026-09-15");
  sql.exec(readFileSync("migrations/admin/0014_approved_quotation_shipments.sql", "utf8"));
  assert.equal(sql.prepare("SELECT source_quotation_id FROM shipments WHERE id = ?").get(shipmentId)!.source_quotation_id, null);
  assert.equal(sql.prepare("SELECT shipment_id FROM invoices WHERE id = ?").get(invoiceId)!.shipment_id, shipmentId);
  assert.equal(sql.prepare("SELECT invoice_id FROM payments").get()!.invoice_id, invoiceId);
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), customerId, "KDSEA999999", "Sea Freight", "Guangzhou", 0, 0, "Pending Warehouse Receipt", 0, 0, "Unpaid", "2026-09-15", "2026-09-15");
});
test("cargo intake migration maps status, preserves relationships, and permits untracked intake", async () => {
  const { sql, db, user } = database(false);
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  sql.exec(readFileSync("migrations/admin/0014_approved_quotation_shipments.sql", "utf8"));
  const shipmentId = randomUUID();
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(shipmentId, customerId, "KDSEA999998", "Sea Freight", "Guangzhou", 1, 100, "Pending Warehouse Receipt", 500000, 0, "Unpaid", "2026-09-15", "2026-09-15");
  const invoiceId = randomUUID();
  sql.prepare("INSERT INTO invoices (id, invoice_number, customer_id, shipment_id, subtotal, delivery_charge, total, status, created_at, updated_at, other_charge) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(invoiceId, "INV-CARGO-INTAKE", customerId, shipmentId, 500000, 0, 500000, "Unpaid", "2026-09-15", "2026-09-15", 0);
  const paymentId = randomUUID();
  sql.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?,?,?)").run(paymentId, invoiceId, customerId, 1000, "Cash", null, "2026-09-15", null, "2026-09-15");
  sql.exec(readFileSync("migrations/admin/0016_cargo_intake_workflow.sql", "utf8"));
  const migrated = sql.prepare("SELECT tracking_number, supplier_waybill_number, supplier_courier, verified_cbm, verified_weight_kg, status FROM shipments WHERE id=?").get(shipmentId)!;
  assert.equal(migrated.tracking_number, "KDSEA999998");
  assert.equal(migrated.supplier_waybill_number, null);
  assert.equal(migrated.supplier_courier, null);
  assert.equal(migrated.verified_cbm, null);
  assert.equal(migrated.verified_weight_kg, null);
  assert.equal(migrated.status, "Awaiting Supplier Dispatch");
  assert.equal(sql.prepare("SELECT shipment_id FROM invoices WHERE id=?").get(invoiceId)!.shipment_id, shipmentId);
  assert.equal(sql.prepare("SELECT invoice_id FROM payments WHERE id=?").get(paymentId)!.invoice_id, invoiceId);
  const pendingId = randomUUID();
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(pendingId, customerId, null, "Sea Freight", "Guangzhou", 1, 100, "Awaiting Supplier Dispatch", 500000, 0, "Unpaid", "2026-09-16", "2026-09-16");
  assert.equal(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(pendingId)!.tracking_number, null);
});
test("customer account foundation preserves existing records and enforces isolated credential structures", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const accountId = randomUUID();
  const account = [accountId, customerId, "customer@example.test", "a".repeat(64), "b".repeat(32), "scrypt", 32768, 8, 1, 64, 1, "2026-09-09T00:00:00.000Z", "2026-09-09T00:00:00.000Z"];
  sql.prepare(`INSERT INTO customer_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...account);
  assert.equal(sql.prepare("SELECT full_name FROM customers WHERE id=?").get(customerId)!.full_name, "Test customer");
  assert.equal(sql.prepare("SELECT role FROM admin_users WHERE id=?").get(user)!.role, "admin");
  assert.throws(() => sql.prepare(`INSERT INTO customer_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), customerId, "other@example.test", "a".repeat(64), "b".repeat(32), "scrypt", 32768, 8, 1, 64, 1, "2026-09-09T00:00:00.000Z", "2026-09-09T00:00:00.000Z"), /UNIQUE/);
  assert.throws(() => sql.prepare(`INSERT INTO customer_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), randomUUID(), "UPPER@example.test", "a".repeat(64), "b".repeat(32), "scrypt", 32768, 8, 1, 64, 1, "2026-09-09T00:00:00.000Z", "2026-09-09T00:00:00.000Z"), /CHECK|FOREIGN KEY/);
  assert.throws(() => sql.prepare(`INSERT INTO customer_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), randomUUID(), "missing@example.test", "a".repeat(64), "b".repeat(32), "scrypt", 32768, 8, 1, 64, 1, "2026-09-09T00:00:00.000Z", "2026-09-09T00:00:00.000Z"), /FOREIGN KEY/);
  sql.prepare("INSERT INTO customer_sessions VALUES (?,?,?,?,?)").run(randomUUID(), accountId, "c".repeat(64), "2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z");
  sql.prepare("INSERT INTO customer_password_reset_tokens VALUES (?,?,?,?,?,NULL)").run(randomUUID(), accountId, "d".repeat(64), "2026-09-09T00:00:00.000Z", "2026-09-09T01:00:00.000Z");
  assert.throws(() => sql.prepare("INSERT INTO customer_sessions VALUES (?,?,?,?,?)").run(randomUUID(), randomUUID(), "e".repeat(64), "2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z"), /FOREIGN KEY/);
  assert.throws(() => sql.prepare("INSERT INTO customer_password_reset_tokens VALUES (?,?,?,?,?,?)").run(randomUUID(), accountId, "f".repeat(64), "2026-09-09T00:00:00.000Z", "2026-09-09T01:00:00.000Z", "2026-09-08T00:00:00.000Z"), /CHECK/);
  assert.equal(sql.prepare("SELECT customer_account_id FROM customer_sessions").get()!.customer_account_id, accountId);
  assert.equal(sql.prepare("SELECT used_at FROM customer_password_reset_tokens").get()!.used_at, null);
});
test("dashboard attention and shared follow-up note preserve role boundaries", async () => {
  const { sql, db, user } = database();
  const admin = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  let html = await (await dashboard(db, admin, "csrf", true)).text();
  assert.match(html, /Team note:<\/strong> No note yet/);
  assert.doesNotMatch(html, /\+ Create Invoice|Record Payment/);
  assert.match(html, /Needs Attention/);
  assert.match(html, /All caught up/);
  assert.match(html, /href="\/admin\/quotations\?new=1"/);
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", shipment(customerId), user, "", "");
  const invoiceId = randomUUID();
  sql.prepare(`INSERT INTO invoices (id,invoice_number,customer_id,shipment_id,subtotal,delivery_charge,total,status,issued_at,due_at,created_at,updated_at,other_charge)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceId, "INV-ATTN", customerId, shipmentId, 100000, 0, 100000, "Partial", "2026-09-01", "2026-09-15", "2026-09-01", "2026-09-01", 0);
  sql.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?,?,?)").run(randomUUID(), invoiceId, customerId, 25000, "Cash", null, "2026-09-02", null, "2026-09-02");
  html = await (await dashboard(db, admin, "csrf", true)).text();
  assert.doesNotMatch(html, /New Leads|<span>Customers<\/span>/);
  assert.match(html, /<h2>Money<\/h2>/);
  assert.match(html, /Money we have now/);
  assert.match(html, /Going out to Ni Hao/);
  assert.match(html, /Open Money In &amp; Out/);
  assert.doesNotMatch(html, /Overall profit after expenses/);
  assert.match(html, /Shipments · 1 active/);
  assert.match(html, /<th>Customer paid<\/th>/);
  assert.match(html, /<th>Ni Hao paid<\/th>/);
  assert.match(html, /data-k="amber">Partly paid/);
  assert.match(html, /1 invoice not fully paid · ₱750\.00/);
  assert.match(html, /1 is past the due date/);
  assert.doesNotMatch(html, /Recent Invoices/);
  assert.doesNotMatch(html, /Finance Overview/);
  assert.doesNotMatch(html, /<h2>Expenses<\/h2>/);
  assert.doesNotMatch(html, /href="\/admin\/finance\/expenses\?new=1"/);
  assert.match(html, new RegExp(`/admin/shipments\\?id=${shipmentId}`));
  sql.prepare("UPDATE shipments SET archived_at='2026-09-09T00:00:00.000Z' WHERE id=?").run(shipmentId);
  html = await (await dashboard(db, admin, "csrf", true)).text();
  assert.match(html, /Shipments · 0 active/);
  assert.ok(!html.includes(`/admin/shipments?id=${shipmentId}`));
  await saveStaffFollowUp(db, "Call customer\nConfirm delivery", admin);
  await saveStaffFollowUp(db, "Updated priority", admin);
  await assert.rejects(saveStaffFollowUp(db, "x".repeat(4001), admin), /4,000/);
  assert.equal(sql.prepare("SELECT note FROM staff_follow_up WHERE id=1").get()!.note, "Updated priority");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE entity_type='staff_follow_up'").get()!.n, 2);
  html = await (await dashboard(db, { ...admin, role: "viewer" }, "csrf", false)).text();
  assert.match(html, /Updated priority/);
  assert.ok(!html.includes("Save follow-up"));
  assert.ok(!html.includes("Save note"));
  assert.ok(!html.includes("Shipments missing Nihao cost"));
  assert.ok(!html.includes('href="/admin/quotations?new=1"'));
});
test("required fields, dates, enum, numeric precision and overposting are validated", () => {
  assert.throws(() => customerSchema.parse({ ...customer, full_name: " " }));
  assert.throws(() =>
    parseForm("customers", new URLSearchParams("customer_code=X&role=owner")),
  );
  const form = new URLSearchParams("customer_code=A&customer_code=B");
  assert.throws(() => parseForm("customers", form));
  const {
    tracking_number: _trackingNumber,
    cargo_code: _cargoCode,
    ...shipmentFormInput
  } = shipmentInput(randomUUID());
  assert.equal(_trackingNumber, "KDOOR-0001");
  assert.equal(_cargoCode, "");
  const parsedShipmentForm = parseForm(
    "shipments",
    new URLSearchParams(Object.entries(shipmentFormInput)),
  );
  assert.equal("cargo_code" in parsedShipmentForm, false);
  const verifiedShipmentForm = parseForm(
    "shipments",
    new URLSearchParams(Object.entries({
      ...shipmentFormInput,
      cbm: "0.330456",
      verified_cbm: "0.360789",
      verified_weight_kg: "45",
    })),
  );
  assert.equal(verifiedShipmentForm.cbm, 0.330456);
  assert.equal(verifiedShipmentForm.verified_cbm, 0.360789);
  assert.equal(verifiedShipmentForm.verified_weight_kg, 45);
  const shorthandVerifiedMeasurement = parseForm(
    "shipments",
    new URLSearchParams(Object.entries({
      ...shipmentFormInput,
      verified_cbm: ".36",
    })),
  );
  assert.equal(shorthandVerifiedMeasurement.verified_cbm, 0.36);
  const formattedVerifiedMeasurement = parseForm(
    "shipments",
    new URLSearchParams(Object.entries({
      ...shipmentFormInput,
      verified_cbm: "1,000.36",
      verified_weight_kg: "1,200",
    })),
  );
  assert.equal(formattedVerifiedMeasurement.verified_cbm, 1000.36);
  assert.equal(formattedVerifiedMeasurement.verified_weight_kg, 1200);
  assert.equal(shipment(randomUUID()).shipping_charge, 650025);
  assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), china_warehouse: "Tongda Air Cargo" }).success, true);
  assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), cbm: "2.000123" }).success, true);
  for (const bad of ["-1", "Infinity", "NaN", "1e3", "2.0001234", ""])
    assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), cbm: bad }).success, false);
  for (const bad of ["-1", "1.001", "", "NaN"])
    assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), shipping_charge: bad }).success, false);
  assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), estimated_arrival: "2026-02-30" }).success, false);
  assert.equal(shipmentSchema.safeParse({ ...shipmentInput(randomUUID()), status: "bad" }).success, false);
});
test("customer and shipment writes create correct atomic immutable audit logs", async () => {
  const { sql, db, user } = database();
  const id = await saveRecord(db, "customers", customer, user, "", "");
  const c = sql.prepare("SELECT * FROM customers").get()!;
  await saveRecord(
    db,
    "customers",
    { ...customer, full_name: "Edited" },
    user,
    id,
    String(c.updated_at),
  );
  const sid = await saveRecord(db, "shipments", shipment(id), user, "", "");
  const s = sql.prepare("SELECT * FROM shipments").get()!;
  await saveRecord(
    db,
    "shipments",
    {
      ...shipment(id),
      status: "Sea Transit",
      cbm: 2,
      weight_kg: 500,
      shipping_charge: 700000,
    },
    user,
    sid,
    String(s.updated_at),
  );
  const logs = sql
    .prepare("SELECT * FROM activity_log ORDER BY created_at")
    .all();
  assert.equal(logs.length, 8);
  assert.deepEqual(
    logs
      .filter(x => String(x.action).startsWith("change_"))
      .map((x) => x.action)
      .sort(),
    [
      "change_cbm",
      "change_shipping_charge",
      "change_status",
      "change_weight_kg",
    ],
  );
  assert.equal(logs[0].admin_user_id, user);
  assert.equal(logs[0].old_value, null);
  assert.equal(
    JSON.parse(String(logs.find(x=>x.action === "update" && x.entity_type === "shipments")!.old_value)).status,
    "China Warehouse",
  );
  assert.equal(JSON.parse(String(logs.find(x=>x.action === "update" && x.entity_type === "shipments")!.new_value)).status, "Sea Transit");
  assert.throws(() => sql.exec("DELETE FROM activity_log"), /immutable/);
  assert.throws(
    () => sql.exec("UPDATE activity_log SET action='tamper'"),
    /immutable/,
  );
  await assert.rejects(
    saveRecord(db, "shipments", shipment(id), user, sid, String(s.updated_at)),
    /Another admin/,
  );
  assert.equal(
    sql.prepare("SELECT COUNT(*) AS n FROM activity_log").get()!.n,
    8,
  );
});
test("duplicate, foreign-key and audit failure roll back entire write", async () => {
  const { sql, db, user } = database();
  await saveRecord(db, "customers", customer, user, "", "");
  await assert.rejects(
    saveRecord(db, "customers", customer, user, "", ""),
    /already exists/,
  );
  await assert.rejects(
    saveRecord(db, "shipments", shipment(randomUUID()), user, "", ""),
    /existing customer/,
  );
  await assert.rejects(
    saveRecord(
      db,
      "customers",
      { ...customer, customer_code: "OTHER" },
      randomUUID(),
      "",
      "",
    ),
  );
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM customers").get()!.n, 1);
  assert.equal(
    sql.prepare("SELECT COUNT(*) AS n FROM activity_log").get()!.n,
    1,
  );
});
test("one account number can own multiple shipments with unique tracking numbers", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", { ...customer, customer_code: "KDOOR-0001" }, user, "", "");
  const sea = await saveRecord(db, "shipments", { ...shipment(customerId), tracking_number: "KD-SEA-000001", cargo_code: null }, user, "", "");
  const air = await saveRecord(db, "shipments", { ...shipment(customerId), tracking_number: "KD-AIR-000001", cargo_code: null, service_type: "Air Freight" }, user, "", "");
  assert.notEqual(sea, air);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM shipments WHERE customer_id = ?").get(customerId)!.n, 2);
  await assert.rejects(saveRecord(db, "shipments", { ...shipment(customerId), tracking_number: "KD-SEA-000001", cargo_code: null }, user, "", ""), /tracking number already exists/);
});
test("new records receive random immutable account and tracking numbers", async () => {
  const { sql, db, user } = database();
  const { customer_code: _account, ...newCustomer } = customer;
  assert.equal(_account, "KD-001");
  const firstCustomer = await saveRecord(db, "customers", newCustomer, user, "", "");
  const secondCustomer = await saveRecord(db, "customers", { ...newCustomer, full_name: "Second customer", mobile: "+639171234568" }, user, "", "");
  const firstAccount = String(sql.prepare("SELECT customer_code FROM customers WHERE id=?").get(firstCustomer)!.customer_code);
  const secondAccount = String(sql.prepare("SELECT customer_code FROM customers WHERE id=?").get(secondCustomer)!.customer_code);
  assert.match(firstAccount, /^KDOOR-[1-9]\d{3}$/);
  assert.match(secondAccount, /^KDOOR-[1-9]\d{3}$/);
  assert.notEqual(firstAccount, secondAccount);
  const { tracking_number: _tracking, cargo_code: _cargo, ...newShipment } = shipment(firstCustomer);
  assert.equal(_tracking, "KDOOR-0001");
  assert.equal(_cargo, null);
  const seaOne = await saveRecord(db, "shipments", newShipment, user, "", "");
  const seaTwo = await saveRecord(db, "shipments", { ...newShipment, cargo_code: null }, user, "", "");
  const air = await saveRecord(db, "shipments", { ...newShipment, service_type: "Air Freight" }, user, "", "");
  const seaOneTracking = String(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(seaOne)!.tracking_number);
  const seaTwoTracking = String(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(seaTwo)!.tracking_number);
  const airTracking = String(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(air)!.tracking_number);
  assert.match(seaOneTracking, /^KDSEA-[1-9]\d{5}$/);
  assert.match(seaTwoTracking, /^KDSEA-[1-9]\d{5}$/);
  assert.match(airTracking, /^KDAIR-[1-9]\d{5}$/);
  assert.notEqual(seaOneTracking, seaTwoTracking);
  const customerRow = sql.prepare("SELECT * FROM customers WHERE id=?").get(firstCustomer)!;
  await saveRecord(db, "customers", newCustomer, user, firstCustomer, String(customerRow.updated_at));
  assert.equal(sql.prepare("SELECT customer_code FROM customers WHERE id=?").get(firstCustomer)!.customer_code, firstAccount);
  const shipmentRow = sql.prepare("SELECT * FROM shipments WHERE id=?").get(seaOne)!;
  await saveRecord(db, "shipments", newShipment, user, seaOne, String(shipmentRow.updated_at));
  assert.equal(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(seaOne)!.tracking_number, seaOneTracking);
});
test("legacy identifiers remain compatible with random new identifiers", async () => {
  const { sql, db, user } = database();
  const legacyCustomer = await saveRecord(db, "customers", { ...customer, customer_code: "KDOOR-0002" }, user, "", "");
  const { customer_code: _account, ...newCustomer } = customer;
  assert.equal(_account, "KD-001");
  const newCustomerId = await saveRecord(db, "customers", { ...newCustomer, full_name: "New customer", mobile: "+639171234568" }, user, "", "");
  assert.match(String(sql.prepare("SELECT customer_code FROM customers WHERE id=?").get(newCustomerId)!.customer_code), /^KDOOR-[1-9]\d{3}$/);

  await saveRecord(db, "shipments", { ...shipment(legacyCustomer), tracking_number: "KD-SEA-000002", cargo_code: null }, user, "", "");
  await saveRecord(db, "shipments", { ...shipment(legacyCustomer), tracking_number: "KD-AIR-000002", cargo_code: null, service_type: "Air Freight" }, user, "", "");
  const { tracking_number: _tracking, ...newShipment } = shipment(newCustomerId);
  assert.equal(_tracking, "KDOOR-0001");
  const sea = await saveRecord(db, "shipments", newShipment, user, "", "");
  const air = await saveRecord(db, "shipments", { ...newShipment, service_type: "Air Freight" }, user, "", "");
  assert.match(String(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(sea)!.tracking_number), /^KDSEA-[1-9]\d{5}$/);
  assert.match(String(sql.prepare("SELECT tracking_number FROM shipments WHERE id=?").get(air)!.tracking_number), /^KDAIR-[1-9]\d{5}$/);
});
test("invoice and payment customer links cannot disagree and deletes are restricted", async () => {
  const { sql, db, user } = database();
  const a = await saveRecord(db, "customers", customer, user, "", "");
  const b = await saveRecord(
    db,
    "customers",
    { ...customer, customer_code: "B" },
    user,
    "",
    "",
  );
  const s = await saveRecord(db, "shipments", shipment(a), user, "", "");
  const insert = sql.prepare(
    "INSERT INTO invoices (id,invoice_number,customer_id,shipment_id,subtotal,delivery_charge,total,status,created_at,updated_at) VALUES (?,?,?,?,100,0,100,'Unpaid','now','now')",
  );
  assert.throws(() => insert.run("i", "INV-1", b, s), /FOREIGN KEY/);
  insert.run("i", "INV-1", a, s);
  assert.throws(
    () =>
      sql
        .prepare(
          "INSERT INTO payments VALUES ('p','i',?,100,'Cash',NULL,'2026-01-01',NULL,'now')",
        )
        .run(b),
    /FOREIGN KEY/,
  );
  assert.throws(
    () => sql.prepare("DELETE FROM customers WHERE id=?").run(a),
    /FOREIGN KEY/,
  );
});
test("CSRF is signed, expiring, user-bound and route-bound; origin fails closed", () => {
  const env = { ADMIN_CSRF_SECRET: "x".repeat(32) } as AdminEnv;
  const token = csrfToken(env, "u", "/admin/customers");
  checkCsrf(env, "u", "/admin/customers", token);
  for (const [u, p, t] of [
    ["other", "/admin/customers", token],
    ["u", "/admin/shipments", token],
    ["u", "/admin/customers", token + "x"],
    ["u", "/admin/customers", csrfToken(env, "u", "/admin/customers", 1)],
  ])
    assert.throws(() => checkCsrf(env, u, p, t));
  assert.throws(() =>
    canonicalOrigin({
      ...env,
      ADMIN_ORIGIN: "http://public.example.com",
      ADMIN_LOCAL_DEV: "true",
    }),
  );
});
test("admin production origin allows only KargoDoor apex and www hosts", () => {
  const env = { ADMIN_ORIGIN: "https://kargodoorph.com" } as AdminEnv;
  assert.equal(adminOriginAllowed(env, "https://kargodoorph.com"), true);
  assert.equal(adminOriginAllowed(env, "https://www.kargodoorph.com"), true);
  for (const origin of [
    "https://evil.test",
    "https://kargodoorph.com.evil.test",
    "http://kargodoorph.com",
    "https://admin.kargodoorph.com",
  ]) assert.equal(adminOriginAllowed(env, origin), false);
  const local = {
    ADMIN_ORIGIN: "http://localhost:8787",
    ADMIN_LOCAL_DEV: "true",
  } as AdminEnv;
  assert.equal(adminOriginAllowed(local, "http://localhost:8787"), true);
  assert.equal(adminOriginAllowed(local, "http://127.0.0.1:8787"), false);
});
test("viewer authorization is centralized and mutation attempts are forbidden", () => {
  assert.equal(canMutateAdmin({ role: "owner" }), true);
  assert.equal(canMutateAdmin({ role: "admin" }), true);
  assert.equal(canMutateAdmin({ role: "viewer" }), false);
  assert.equal(canDeleteAdmin({ role: "owner" }), true);
  assert.equal(canDeleteAdmin({ role: "admin" }), false);
  assert.throws(
    () => requireAdminMutation({ role: "viewer" }),
    (error: unknown) => error instanceof Error && error.message === "Viewer access is read-only." &&
      "status" in error && error.status === 403,
  );
  assert.throws(
    () => requireAdminDelete({ role: "admin" }),
    (error: unknown) => error instanceof Error && error.message === "Only the owner can delete records." &&
      "status" in error && error.status === 403,
  );
});

test("viewer migration preserves users and seeds the exact approved role records", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(`INSERT INTO admin_users VALUES
    ('existing-owner','Existing Owner','owner@example.test','owner','created-owner','updated-owner'),
    ('existing-admin','Existing Admin','archie.aguirre@gmail.com','admin','created-admin','updated-admin'),
    ('existing-disabled','Disabled','disabled@example.test','disabled','created-disabled','updated-disabled')`);
  // This historical migration rebuilds its parent table; FK integrity is tested below on its resulting schema.
  sql.exec(readFileSync("migrations/admin/0006_admin_viewer_role.sql", "utf8"));
  const roles = sql.prepare("SELECT id,email,role,created_at FROM admin_users ORDER BY email").all();
  assert.ok(roles.some((row) => row.id === "existing-owner" && row.role === "owner" && row.created_at === "created-owner"));
  assert.ok(roles.some((row) => row.id === "existing-admin" && row.email === "archie.aguirre@gmail.com" && row.role === "admin" && row.created_at === "created-admin"));
  assert.ok(roles.some((row) => row.id === "existing-disabled" && row.role === "disabled"));
  for (const [email, role] of [
    ["em.aguirreph@gmail.com", "owner"],
    ["lapid.patrick@gmail.com", "viewer"],
    ["keahreyes.inquiry@gmail.com", "viewer"],
  ]) assert.ok(roles.some((row) => row.email === email && row.role === role));
  assert.throws(() => sql.exec("INSERT INTO admin_users VALUES ('x','X','x@example.test','other','x','x')"), /CHECK/);
});

test("activity log foreign key remains enforced after viewer role migration", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0006_admin_viewer_role.sql", "utf8"));
  sql.exec("INSERT INTO admin_users VALUES ('admin','Admin','admin@example.test','admin','created','updated')");
  sql.exec("INSERT INTO activity_log VALUES ('log','admin','create_customer','customers','customer',NULL,NULL,NULL,'then')");
  assert.throws(
    () => sql.exec("INSERT INTO activity_log VALUES ('invalid','missing','create_customer','customers','customer',NULL,NULL,NULL,'then')"),
    /FOREIGN KEY/,
  );
  assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);
});
test("JWT rejects forged, expired, wrong audience/issuer and missing identity tokens", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const key = { ...publicKey.export({ format: "jwk" }), kid: "test" } as {
    kid: string;
    kty: string;
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "https://team.cloudflareaccess.com",
    aud: ["aud"],
    sub: "u",
    email: "ADMIN@example.test",
    iat: now,
    exp: now + 600,
  };
  const jwt = (p: object, alg = "RS256") => {
    const body = [{ alg, kid: "test" }, p]
      .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
      .join(".");
    return (
      body +
      "." +
      sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")
    );
  };
  const check = (token: string) =>
    validateJwt(token, [key], payload.iss, "aud");
  assert.equal(check(jwt(payload)), "admin@example.test");
  for (const p of [
    { ...payload, exp: now - 1 },
    { ...payload, aud: ["other"] },
    { ...payload, iss: "https://evil.test" },
    { ...payload, sub: "" },
    { ...payload, email: null },
  ])
    assert.throws(() => check(jwt(p)));
  assert.throws(() => check(jwt(payload, "none")));
  assert.throws(() => check(jwt(payload).slice(0, -10) + "tampered"));
});
test("missing identity, unapproved identity and non-canonical host denied", async () => {
  const { db } = database();
  const env = {
    ADMIN_DB: db,
    ADMIN_ORIGIN: "https://kargodoorph.com",
    ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    ACCESS_AUD: "aud",
  };
  await assert.rejects(
    authenticate(new Request("https://kargodoorph.com/admin"), env),
    /Sign in/,
  );
  await assert.rejects(
    authenticate(new Request("https://alternate.workers.dev/admin"), env),
    /address/,
  );
});
test("valid Access identity still requires an enabled admin database entry", async () => {
  const { sql, db } = database();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const key = { ...publicKey.export({ format: "jwk" }), kid: "allowlist" };
  const env = {
    ADMIN_DB: db,
    ADMIN_ORIGIN: "https://kargodoorph.com",
    ACCESS_TEAM_DOMAIN: "allowlist.cloudflareaccess.com",
    ACCESS_AUD: "admin-app",
  };
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [key] });
  const request = (email: string, origin = env.ADMIN_ORIGIN) => {
    const now = Math.floor(Date.now() / 1000);
    const body = [
      { alg: "RS256", kid: "allowlist" },
      {
        iss: "https://allowlist.cloudflareaccess.com",
        aud: ["admin-app"],
        email,
        sub: "identity",
        iat: now,
        exp: now + 300,
      },
    ]
      .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
      .join(".");
    const token =
      body +
      "." +
      sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
    return new Request(origin + "/admin", {
      headers: { "cf-access-jwt-assertion": token },
    });
  };
  try {
    assert.equal(
      (await authenticate(request("admin@example.test"), env)).role,
      "admin",
    );
    assert.equal(
      (await authenticate(request("admin@example.test", "https://www.kargodoorph.com"), env)).role,
      "admin",
    );
    await assert.rejects(
      authenticate(request("customer@example.test"), env),
      /not authorized/,
    );
    sql.exec("UPDATE admin_users SET role='viewer'");
    assert.equal(
      (await authenticate(request("admin@example.test"), env)).role,
      "viewer",
    );
    sql.exec("UPDATE admin_users SET role='disabled'");
    await assert.rejects(
      authenticate(request("admin@example.test"), env),
      /not authorized/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("cost upgrade preserves existing shipments and distinguishes missing, zero and loss", async () => {
  const {sql,db,user} = database();
  const customerId = await saveRecord(db,"customers",customer,user,"","");
  const values = shipment(customerId);
  const id = await saveRecord(db,"shipments",values,user,"","");
  assert.equal(sql.prepare("SELECT nihao_cost FROM shipments").get()!.nihao_cost,null);
  let summary = sql.prepare(marginSummarySql).get()!;
  assert.equal(summary.costed,0);
  assert.equal(summary.margin,0);
  const row = sql.prepare("SELECT * FROM shipments").get()!;
  await saveRecord(db,"shipments",{...values,nihao_cost:0},user,id,String(row.updated_at));
  summary = sql.prepare(marginSummarySql).get()!;
  assert.equal(summary.costed,1);
  assert.equal(summary.margin,650025);
  const revision = sql.prepare("SELECT updated_at FROM shipments").get()!.updated_at;
  await saveRecord(db,"shipments",{...values,nihao_cost:700000},user,id,String(revision));
  summary = sql.prepare(marginSummarySql).get()!;
  assert.equal(summary.margin,-49975);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE action='change_nihao_cost'").get()!.n,2);
  assert.throws(()=>sql.exec("UPDATE shipments SET nihao_cost=-1"),/CHECK/);
  assert.throws(()=>sql.exec("UPDATE shipments SET nihao_cost=0.5"),/CHECK/);
  sql.exec("UPDATE shipments SET status='Cancelled'");
  assert.equal(sql.prepare(marginSummarySql).get()!.costed,0);
});

test("second migration is additive for a populated Phase 1 database", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql","utf8"));
  sql.exec("INSERT INTO customers VALUES ('c','C-1','Existing customer',NULL,'12345',NULL,NULL,NULL,'then','then')");
  sql.exec("INSERT INTO shipments VALUES ('s','c','KDOOR-0001','Sea Freight','Guangzhou',1,100,'In Transit',NULL,NULL,10000,0,'Unpaid','then','then')");
  const before = sql.prepare("SELECT * FROM shipments").get()!;
  sql.exec(readFileSync("migrations/admin/0002_freight_cost.sql","utf8"));
  const after = sql.prepare("SELECT * FROM shipments").get()!;
  assert.equal(after.nihao_cost,null);
  delete after.nihao_cost;
  assert.deepEqual(after,before);
  sql.close();
});

test("reports paginate, filter and escape stored customer and audit content", async () => {
  const {sql,db,user} = database();
  const cid = await saveRecord(db,"customers",{...customer,full_name:"<script>unsafe</script>"},user,"","");
  for(let i=0;i<27;i++) await saveRecord(db,"shipments",{...shipment(cid),tracking_number:`KDOOR-${String(i).padStart(4,"0")}`,nihao_cost:i===0 ? null : 500000},user,"","");
  const financeResponse = await finance(db,new URL("https://example.test/admin/finance"),"Admin");
  const html = await financeResponse.text();
  assert.ok(html.includes("Next"));
  assert.ok(html.includes("&lt;script&gt;unsafe"));
  assert.ok(!html.includes("<script>unsafe"));
  const filtered = await (await finance(db,new URL("https://example.test/admin/finance?missing=1"),"Admin")).text();
  assert.ok(filtered.includes("KDOOR-0000"));
  assert.ok(!filtered.includes("KDOOR-0001"));
  const log = await (await activity(db,new URL(`https://example.test/admin/activity?entity_type=customers&entity_id=${cid}`),"Admin")).text();
  assert.ok(log.includes("&lt;script&gt;unsafe"));
  assert.ok(!log.includes("<script>unsafe"));
  assert.equal(sql.prepare(marginSummarySql).get()!.margin,26*150025);
  await assert.rejects(activity(db,new URL("https://example.test/admin/activity?entity_type=users"),"Admin"),/Invalid/);
});

test("invoice snapshots connected records and supports partial and multiple payments", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", { ...shipment(customerId), shipping_charge: 700000, delivery_charge: 5000 }, user, "", "");
  const invoiceId = await createInvoice(db, {
    shipment_id: shipmentId, delivery_charge: "100", other_charge: "50.25",
    status: "Unpaid", issued_at: "2026-09-07", due_at: "2026-09-30",
  }, user);
  const invoice = sql.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId)!;
  assert.equal(invoice.customer_id, customerId);
  assert.equal(invoice.subtotal, 700000);
  assert.equal(invoice.delivery_charge, 10000);
  assert.equal(invoice.other_charge, 5025);
  assert.equal(Number(invoice.total) + Number(invoice.other_charge), 715025);
  assert.equal(sql.prepare("SELECT payment_status FROM shipments WHERE id=?").get(shipmentId)!.payment_status, "Unpaid");
  await assert.rejects(createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user), /already has an invoice/);
  await recordPayment(db, { invoice_id: invoiceId, amount: "2000", payment_method: "Bank Transfer", reference_number: "REF-1", payment_date: "2026-09-10", notes: "First" }, user);
  let state = sql.prepare("SELECT status FROM invoices WHERE id=?").get(invoiceId)!;
  assert.equal(state.status, "Partial");
  assert.equal(sql.prepare("SELECT payment_status FROM shipments WHERE id=?").get(shipmentId)!.payment_status, "Partial");
  await recordPayment(db, { invoice_id: invoiceId, amount: "5150.25", payment_method: "GCash", reference_number: "REF-2", payment_date: "2026-09-11", notes: "Final" }, user);
  state = sql.prepare("SELECT status FROM invoices WHERE id=?").get(invoiceId)!;
  assert.equal(state.status, "Paid");
  assert.equal(sql.prepare("SELECT SUM(amount) AS n FROM payments WHERE invoice_id=?").get(invoiceId)!.n, 715025);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM payments WHERE invoice_id=?").get(invoiceId)!.n, 2);
  assert.equal(sql.prepare("SELECT payment_status FROM shipments WHERE id=?").get(shipmentId)!.payment_status, "Paid");
  await assert.rejects(recordPayment(db, { invoice_id: invoiceId, amount: "1", payment_method: "Cash", reference_number: "", payment_date: "2026-09-12", notes: "" }, user), /remaining balance|fully paid|changed/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE entity_type IN ('invoices','payments')").get()!.n, 5);
});

test("recording a payment on a Draft invoice issues it and marks it paid", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", { ...shipment(customerId), shipping_charge: 100000 }, user, "", "");
  const invoiceId = await createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user);
  await recordPayment(db, { invoice_id: invoiceId, amount: "1000", payment_method: "GCash", reference_number: "GC-1", payment_date: "2026-11-02", notes: "" }, user);
  const invoice = sql.prepare("SELECT status, issued_at FROM invoices WHERE id=?").get(invoiceId)!;
  assert.equal(invoice.status, "Paid");
  assert.equal(invoice.issued_at, "2026-11-02");
  assert.equal(sql.prepare("SELECT payment_status FROM shipments WHERE id=?").get(shipmentId)!.payment_status, "Paid");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE entity_id=? AND action='issue_invoice'").get(invoiceId)!.n, 1);
  await assert.rejects(recordPayment(db, { invoice_id: invoiceId, amount: "1", payment_method: "Cash", reference_number: "", payment_date: "2026-11-02", notes: "" }, user), /fully paid/);
});

test("create-or-view invoice link opens the shipment's existing invoice", async () => {
  const { db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", { ...shipment(customerId), shipping_charge: 100000 }, user, "", "");
  const env = { ADMIN_CSRF_SECRET: "x".repeat(32) } as AdminEnv;
  const admin = { id: user, name: "Admin" };
  const before = await createView(db, env, admin, new URL(`https://example.test/admin/invoices?new=1&shipment_id=${shipmentId}`));
  assert.equal(before.status, 200);
  const invoiceId = await createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user);
  const after = await createView(db, env, admin, new URL(`https://example.test/admin/invoices?new=1&shipment_id=${shipmentId}`));
  assert.equal(after.status, 303);
  assert.equal(after.headers.get("Location"), `/admin/invoices?id=${invoiceId}`);
});

test("only Draft or Void invoices can be archived, and a voided shipment can be invoiced again", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", { ...shipment(customerId), shipping_charge: 100000 }, user, "", "");
  const first = await createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Unpaid", issued_at: "2026-09-07", due_at: "" }, user);
  await recordPayment(db, { invoice_id: first, amount: "300", payment_method: "Cash", reference_number: "", payment_date: "2026-09-08", notes: "" }, user);
  const revision = () => String(sql.prepare("SELECT updated_at FROM invoices WHERE id=?").get(first)!.updated_at);
  await assert.rejects(archiveInvoice(db, first, revision(), user), /Void this invoice before archiving/);
  await voidInvoice(db, first, revision(), user);
  assert.equal(sql.prepare("SELECT status FROM invoices WHERE id=?").get(first)!.status, "Void");
  await assert.rejects(voidInvoice(db, first, revision(), user), /already voided/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM payments WHERE invoice_id=?").get(first)!.n, 1);
  const second = await createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user);
  assert.notEqual(second, first);
  await assert.rejects(createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user), /already has an invoice/);
  await archiveInvoice(db, first, revision(), user);
  assert.ok(sql.prepare("SELECT archived_at FROM invoices WHERE id=?").get(first)!.archived_at);
});

test("editing a shipment charge updates its Draft or Unpaid invoice once", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", { ...shipment(customerId), shipping_charge: 100000 }, user, "", "");
  const invoiceId = await createInvoice(db, { shipment_id: shipmentId, delivery_charge: "50", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user);
  assert.equal(await syncVerifiedFreightToInvoice(db, shipmentId, 100000, user, "Edited charge."), 0);
  assert.equal(await syncVerifiedFreightToInvoice(db, shipmentId, 120000, user, "Edited charge."), 1);
  const invoice = sql.prepare("SELECT subtotal, total FROM invoices WHERE id=?").get(invoiceId)!;
  assert.equal(invoice.subtotal, 120000);
  assert.equal(invoice.total, 125000);
  assert.equal(sql.prepare("SELECT notes FROM activity_log WHERE action='update_verified_freight'").get()!.notes, "Edited charge.");
});

test("editing a shipment delivery charge updates its Draft or Unpaid invoice", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", { ...shipment(customerId), shipping_charge: 53000 }, user, "", "");
  const invoiceId = await createInvoice(db, { shipment_id: shipmentId, delivery_charge: "247", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user);
  assert.equal(await syncVerifiedFreightToInvoice(db, shipmentId, 53000, user, "Edited charge.", 24700), 0);
  assert.equal(await syncVerifiedFreightToInvoice(db, shipmentId, 53000, user, "Edited charge.", 23100), 1);
  const invoice = sql.prepare("SELECT subtotal, delivery_charge, total FROM invoices WHERE id=?").get(invoiceId)!;
  assert.equal(invoice.subtotal, 53000);
  assert.equal(invoice.delivery_charge, 23100);
  assert.equal(invoice.total, 76100);
});

test("draft invoices can be issued and reject invalid charges, dates and overpayments", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", shipment(customerId), user, "", "");
  const invoiceId = await createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user);
  await assert.rejects(recordPayment(db, { invoice_id: invoiceId, amount: "999999", payment_method: "Cash", reference_number: "", payment_date: "2026-09-07", notes: "" }, user), /exceed/);
  assert.equal(sql.prepare("SELECT status FROM invoices WHERE id=?").get(invoiceId)!.status, "Draft");
  await assert.rejects(issueInvoice(db, { invoice_id: invoiceId, issued_at: "2026-09-10", due_at: "2026-09-01" }, user));
  await issueInvoice(db, { invoice_id: invoiceId, issued_at: "2026-09-10", due_at: "2026-09-30" }, user);
  assert.equal(sql.prepare("SELECT status FROM invoices WHERE id=?").get(invoiceId)!.status, "Unpaid");
  await assert.rejects(issueInvoice(db, { invoice_id: invoiceId, issued_at: "2026-09-10", due_at: "" }, user), /Only a Draft/);
  await assert.rejects(recordPayment(db, { invoice_id: invoiceId, amount: "999999", payment_method: "Cash", reference_number: "", payment_date: "2026-09-10", notes: "" }, user), /exceed/);
  await assert.rejects(createInvoice(db, { shipment_id: crypto.randomUUID(), delivery_charge: "-1", other_charge: "0", status: "Unpaid", issued_at: "", due_at: "" }, user));
});

test("Phase 2B migration preserves populated Phase 2A invoice and payment records", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.exec(readFileSync("migrations/admin/0002_freight_cost.sql", "utf8"));
  sql.exec("INSERT INTO customers VALUES ('c','C-1','Existing',NULL,'12345',NULL,NULL,NULL,'then','then')");
  sql.exec("INSERT INTO shipments VALUES ('s','c','KDOOR-0001','Sea Freight','Guangzhou',1,1,'In Transit',NULL,NULL,10000,0,'Partial','then','then',NULL)");
  sql.exec("INSERT INTO invoices (id,invoice_number,customer_id,shipment_id,subtotal,delivery_charge,total,status,created_at,updated_at) VALUES ('i','INV-1','c','s',10000,0,10000,'Partial','then','then')");
  sql.exec("INSERT INTO payments VALUES ('p','i','c',2500,'Cash','R','2026-01-01',NULL,'then')");
  sql.exec(readFileSync("migrations/admin/0003_invoices_payments.sql", "utf8"));
  assert.equal(sql.prepare("SELECT other_charge FROM invoices WHERE id='i'").get()!.other_charge, 0);
  assert.equal(sql.prepare("SELECT amount FROM payments WHERE id='p'").get()!.amount, 2500);
  sql.exec("PRAGMA optimize");
  const plan = sql.prepare("EXPLAIN QUERY PLAN SELECT * FROM invoices ORDER BY updated_at DESC,id LIMIT 25").all().map((r) => String(r.detail)).join(" ");
  assert.match(plan, /idx_invoices_updated/);
  sql.close();
});

const expenseInput = { expense_date: "2026-09-08", category: "Office / Rent", description: "Supplies <script>", amount: "123.45" };
test("expenses page and add form load; valid expense saves integer centavos and escapes list", async () => {
  const { db, sql } = database();
  const url = new URL("https://admin.test/admin/finance/expenses");
  const empty = await expensesPage(db, url, "Admin", "token");
  assert.equal(empty.status, 200);
  assert.match(await empty.text(), /No expenses found/);
  const form = await expensesPage(db, new URL(url + "?new=1"), "Admin", "token");
  assert.match(await form.text(), /name="csrf" value="token"/);
  await saveExpense(db, parseExpenseForm(new URLSearchParams(expenseInput)));
  const row = sql.prepare("SELECT * FROM expenses").get()!;
  assert.equal(row.amount, 12345);
  assert.equal(row.payee, null);
  assert.equal(row.reference_number, null);
  assert.equal(row.notes, null);
  assert.equal(row.payment_method, null);
  assert.equal(row.tracking_number, null);
  const html = await (await expensesPage(db, url, "Admin", "token")).text();
  assert.match(html, /123.45/);
  assert.match(html, /Supplies &lt;script&gt;/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log").get()!.n, 0);
});
for (const amount of ["0", "-1", "1.001"]) {
  test(`expense amount ${amount} rejected`, () => {
    assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, amount })));
  });
}
test("expense required fields and overposting rejected", () => {
  for (const field of ["expense_date", "category", "description", "amount"]) {
    assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, [field]: "" })));
  }
  assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, id: "overwrite" })));
  const repeated = new URLSearchParams(expenseInput);
  repeated.append("amount", "1");
  assert.throws(() => parseExpenseForm(repeated));
});

test("expense migration preserves existing records", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("migrations/admin/0001_phase1.sql", "utf8"));
  sql.prepare("INSERT INTO expenses VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("existing", "Office", "Existing expense", 150, "2026-09-01", "REF", "Notes", "2026-09-01");
  sql.exec(readFileSync("migrations/admin/0005_expenses.sql", "utf8"));
  const row = sql.prepare("SELECT * FROM expenses").get()!;
  assert.equal(row.amount, 150);
  assert.equal(row.reference_number, "REF");
  assert.equal(row.updated_at, row.created_at);
  assert.equal(row.payee, null);
  sql.close();
});


test("expense form has exact controlled dropdowns and an optional tracking field", async () => {
  const { db } = database();
  const response = await expensesPage(db, new URL("https://admin.test/admin/finance/expenses?new=1"), "Admin", "token");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /name="tracking_number"/);
  assert.doesNotMatch(html, /name="tracking_number"[^>]*required/);
  const categories = ["Freight / Ni Hao Cost", "Local Delivery / Trucking", "Marketing / Advertising",
    "Salaries / Wages", "Management / Administrative", "Office / Rent", "Website / Technology",
    "Permits / Government Fees", "Transportation / Fuel / Parking", "Supplies / Packaging",
    "Professional Fees", "Utilities", "Bank / Payment Fees", "Referral Commission", "Repairs / Maintenance",
    "Meals / Representation", "Taxes", "Miscellaneous"];
  const categorySelect = html.match(/<select name="category" required>([\s\S]*?)<\/select>/)![1];
  assert.deepEqual([...categorySelect.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]), categories.map((c) => [c, c]));
  const methods = ["Cash", "Bank Transfer", "GCash", "Credit Card", "Debit Card", "Check", "Other"];
  const paymentSelect = html.match(/<select name="payment_method">([\s\S]*?)<\/select>/)![1];
  assert.deepEqual([...paymentSelect.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]), methods.map((m) => [m, m]));
  for (const field of ["expense_date", "description", "amount"])
    assert.match(html, new RegExp(`<(?:input|textarea)[^>]*name="${field}"[^>]*required`));
  for (const field of ["payee", "reference_number", "notes"])
    assert.doesNotMatch(html.match(new RegExp(`<(?:input|textarea)[^>]*name="${field}"[^>]*>`))![0], /required/);
  for (const category of categories)
    assert.equal(parseExpenseForm(new URLSearchParams({ ...expenseInput, category })).category, category);
  for (const payment_method of methods)
    assert.equal(parseExpenseForm(new URLSearchParams({ ...expenseInput, payment_method })).payment_method, payment_method);
  for (const category of ["Office", "Arbitrary", "office / rent"])
    assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, category })));
  assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, payment_method: "Arbitrary" })));
  assert.equal(parseExpenseForm(new URLSearchParams({ ...expenseInput, tracking_number: "KDSEA000001" })).tracking_number, "KDSEA000001");
  assert.equal(parseExpenseForm(new URLSearchParams(expenseInput)).tracking_number, null);
});

test("historical expense categories display safely and stored tracking remains untouched", async () => {
  const { db, sql } = database();
  sql.prepare(`INSERT INTO expenses (id, category, description, amount, expense_date, created_at, updated_at, tracking_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("historical", "Old category <script>", "Old expense", 150, "2026-09-01", "then", "then", "HISTORICAL-TRACKING");
  const before = sql.prepare("SELECT * FROM expenses WHERE id='historical'").get();
  const schemaBefore = sql.prepare("SELECT sql FROM sqlite_master ORDER BY name").all();
  await saveExpense(db, parseExpenseForm(new URLSearchParams(expenseInput)));
  const response = await expensesPage(db, new URL("https://admin.test/admin/finance/expenses"), "Admin", "token");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Old category &lt;script&gt;/);
  assert.doesNotMatch(html, /tracking_number|Tracking number|HISTORICAL-TRACKING/i);
  assert.deepEqual(sql.prepare("SELECT * FROM expenses WHERE id='historical'").get(), before);
  assert.deepEqual(sql.prepare("SELECT sql FROM sqlite_master ORDER BY name").all(), schemaBefore);
});


test("expense edit preloads values, validates input and preserves immutable fields", async () => {
  const { db, sql } = database();
  const editor = { id: "editor", name: "Editor", email: "editor@example.test", role: "admin" as const };
  sql.prepare("INSERT INTO admin_users VALUES ('editor','Editor','editor@example.test','admin','2026-01-01','2026-01-01')").run();
  await saveExpense(db, parseExpenseForm(new URLSearchParams({ ...expenseInput, payee: "Old Payee", notes: "Old notes", payment_method: "GCash", reference_number: "REF" })));
  const original = sql.prepare("SELECT * FROM expenses").get()!;
  sql.prepare("UPDATE expenses SET tracking_number='KEEP' WHERE id=?").run(original.id as string);
  const response = await expensesPage(db, new URL(`https://admin.test/admin/finance/expenses?edit=${original.id}`), "Admin", "token");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Edit Expense/);
  assert.match(html, /value="Office \/ Rent" selected/);
  assert.match(html, /value="GCash" selected/);
  for (const value of ["123.45", "Old Payee", "Old notes", "REF", 'name="tracking_number"', 'value="KEEP"']) assert.ok(html.includes(value));
  assert.doesNotMatch(html, /created_at/);
  const edit = { ...expenseInput, action: "edit", id: String(original.id), revision: String(original.updated_at), amount: "0.30", description: "Changed", tracking_number: "KEEP" };
  for (const amount of ["0", "-1", "1.001"])
    await assert.rejects(mutateExpense(db, new URLSearchParams({ ...edit, amount })));
  await assert.rejects(mutateExpense(db, new URLSearchParams({ ...edit, category: "Old category" })));
  await assert.rejects(mutateExpense(db, new URLSearchParams({ ...edit, created_at: "rewrite" })));
  assert.equal(await mutateExpense(db, new URLSearchParams(edit), editor), "updated");
  const saved = sql.prepare("SELECT * FROM expenses").get()!;
  assert.equal(saved.id, original.id);
  assert.equal(saved.created_at, original.created_at);
  assert.equal(saved.tracking_number, "KEEP");
  assert.notEqual(saved.updated_at, original.updated_at);
  assert.equal(saved.amount, 30);
  assert.equal(saved.description, "Changed");
  const log = sql.prepare("SELECT old_value, new_value FROM activity_log WHERE entity_type='expenses' AND action='update'").get()!;
  assert.equal(JSON.parse(String(log.old_value)).amount, 12345);
  assert.equal(JSON.parse(String(log.new_value)).amount, 30);
  await assert.rejects(mutateExpense(db, new URLSearchParams(edit), editor), /changed or no longer exists/);
});

test("expense deletion requires confirmation, preserves other rows and rejects stale confirmation", async () => {
  const { db, sql } = database();
  await saveExpense(db, parseExpenseForm(new URLSearchParams(expenseInput)));
  await saveExpense(db, parseExpenseForm(new URLSearchParams({ ...expenseInput, description: "Keep this expense" })));
  const original = sql.prepare("SELECT * FROM expenses WHERE description=?").get(expenseInput.description)!;
  const owner = { id: "owner", name: "Owner", email: "owner@example.test", role: "owner" as const };
  const admin = { id: "admin", name: "Admin", email: "admin@example.test", role: "admin" as const };
  sql.prepare("INSERT INTO admin_users VALUES ('owner','Owner','owner@example.test','owner','2026-01-01','2026-01-01')").run();
  const response = await expensesPage(db, new URL(`https://admin.test/admin/finance/expenses?delete=${original.id}`), owner, "token");
  const html = await response.text();
  assert.match(html, /Confirm Delete/);
  assert.match(html, /method="post"/);
  assert.match(html, /name="confirm" value="yes"/);
  assert.match(html, /2026-09-08/);
  assert.match(html, /Supplies &lt;script&gt;/);
  assert.match(html, /123.45/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n, 2);
  const deletion = { action: "delete", id: String(original.id), revision: String(original.updated_at) };
  await assert.rejects(mutateExpense(db, new URLSearchParams({ ...deletion, confirm: "yes" }), admin), /Only the owner/);
  await assert.rejects(mutateExpense(db, new URLSearchParams(deletion), owner), /Confirm/);
  await assert.rejects(mutateExpense(db, new URLSearchParams({ ...deletion, confirm: "yes", revision: "stale" }), owner), /changed or no longer exists/);
  assert.equal(await mutateExpense(db, new URLSearchParams({ ...deletion, confirm: "yes" }), owner), "deleted");
  const remaining = sql.prepare("SELECT * FROM expenses").all();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].description, "Keep this expense");
  const log = sql.prepare("SELECT admin_user_id, old_value FROM activity_log WHERE entity_type='expenses' AND action='delete'").all();
  assert.equal(log.length, 1);
  assert.equal(log[0].admin_user_id, "owner");
  assert.equal(JSON.parse(String(log[0].old_value)).description, expenseInput.description);
});

test("expense filters and search combine with exact integer totals and clear restores all rows", async () => {
  const { db } = database();
  const seed = [
    { expense_date: "2026-09-01", category: "Website / Technology", payment_method: "GCash", payee: "Alpha", description: "First item", amount: "0.10", reference_number: "REF-A", notes: "Subscription" },
    { expense_date: "2026-09-08", category: "Website / Technology", payment_method: "GCash", payee: "Beta", description: "Second item", amount: "0.20", reference_number: "REF-B", notes: "Hosting" },
    { expense_date: "2026-09-10", category: "Office / Rent", payment_method: "Cash", payee: "Gamma", description: "Third item", amount: "100.01", reference_number: "REF-C", notes: "Rent" },
  ];
  for (const row of seed) await saveExpense(db, parseExpenseForm(new URLSearchParams(row)));
  const cases: [string, number[], string][] = [
    ["", [0, 1, 2], "100.31"], ["from=2026-09-08", [1, 2], "100.21"],
    ["to=2026-09-08", [0, 1], "0.30"], ["from=2026-09-02&to=2026-09-09", [1], "0.20"],
    ["category=Website+%2F+Technology", [0, 1], "0.30"], ["payment_method=Cash", [2], "100.01"],
    ["q=ALPHA", [0], "0.10"], ["q=SECOND", [1], "0.20"], ["q=ref-c", [2], "100.01"],
    ["q=HOSTING", [1], "0.20"],
    ["from=2026-09-02&to=2026-09-09&category=Website+%2F+Technology&payment_method=GCash&q=hosting", [1], "0.20"],
    ["q=%27+OR+1%3D1--", [], "0.00"],
  ];
  for (const [query, expected, total] of cases) {
    const response = await expensesPage(db, new URL(`https://admin.test/admin/finance/expenses?${query}`), "Admin", "token");
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const [i, row] of seed.entries()) assert.equal(html.includes(`<td class="exp-wide">${row.description}</td>`), expected.includes(i), query);
    assert.ok(html.includes(`<strong>₱${total}</strong>`), query + " total");
    assert.match(html, /href="\/admin\/finance\/expenses">Clear Filters/);
  }
  for (const query of ["from=2026-02-30", "from=2026-09-10&to=2026-09-01", "category=arbitrary", "payment_method=arbitrary"])
    await assert.rejects(expensesPage(db, new URL(`https://admin.test/admin/finance/expenses?${query}`), "Admin", "token"));
});

import "./finance.test";
import "./finance-phase4.test";
import "./nihao-pricing.test";
import "../messenger.test";

import "./quotation-renderer.test";

test("quotation shipments recalculate the KargoDoor charge from the verified size but keep a typed override", () => {
  const quoted = { shipping_charge: 170000, shipping_charge_source: null };
  // No verified size yet: the quotation's charge, or an edit to it, is saved as typed.
  assert.deepEqual(resolveQuotationShipmentCharge(170000, quoted, null), { cost: 170000, source: null });
  assert.deepEqual(resolveQuotationShipmentCharge(180000, quoted, null), { cost: 180000, source: "manual" });
  assert.throws(() => resolveQuotationShipmentCharge(null, quoted, null), /Enter the KargoDoor freight charge/);
  // Verified size with the charge untouched (or live-updated to the new rate): follows the rate.
  assert.deepEqual(resolveQuotationShipmentCharge(170000, quoted, 950000), { cost: 950000, source: "rate" });
  assert.deepEqual(resolveQuotationShipmentCharge(950000, quoted, 950000), { cost: 950000, source: "rate" });
  // A typed override is saved and not replaced by the recalculation.
  assert.deepEqual(resolveQuotationShipmentCharge(1000000, quoted, 950000), { cost: 1000000, source: "manual" });
  assert.deepEqual(resolveQuotationShipmentCharge(1000000, { shipping_charge: 1000000, shipping_charge_source: "manual" }, 960000), { cost: 1000000, source: "manual" });
  // Clearing the box goes back to the rate.
  assert.deepEqual(resolveQuotationShipmentCharge(null, { shipping_charge: 1000000, shipping_charge_source: "manual" }, 960000), { cost: 960000, source: "rate" });
  // A rate-following charge moves when the verified size changes again.
  assert.deepEqual(resolveQuotationShipmentCharge(950000, { shipping_charge: 950000, shipping_charge_source: "rate" }, 990000), { cost: 990000, source: "rate" });
});

test("bank accounts: Ni Hao and KargoDoor tabs, account tags on expenses and cash records", async () => {
  const { db, sql } = database();
  // Exact Ni Hao 2026 account numbers and the KargoDoor accounts customers pay into.
  assert.deepEqual(nihaoBankAccounts.map((a) => [a.bank, a.accountName, a.accountNumber]), [
    ["Sterling Bank of Asia", "NIHAO EXPRESS LOGISTICS CORPORATION", "532600010047"],
    ["Metrobank", "NIHAO EXPRESS LOGISTICS CORPORATION", "279-7-27901627-7"],
    ["BDO", "NIHAO EXPRESS LOGISTICS CORPORATION", "0128 8800 1087"],
  ]);
  for (const account of kargodoorBankAccounts)
    assert.ok(paymentInstructions.some((line) => line.includes(account.accountNumber)), account.accountNumber);

  // Account fields are optional; unknown or mismatched accounts are rejected.
  assert.equal(parseExpenseForm(new URLSearchParams(expenseInput)).paid_from_account, null);
  assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, paid_to_account: "kd-gcash" })));
  assert.throws(() => parseExpenseForm(new URLSearchParams({ ...expenseInput, paid_from_account: "nihao-bdo" })));

  await saveExpense(db, parseExpenseForm(new URLSearchParams({ ...expenseInput, category: "Freight / Ni Hao Cost", description: "KDSEA000005 freight",
    amount: "25415", paid_from_account: "kd-unionbank", paid_to_account: "nihao-bdo" })));
  await saveExpense(db, parseExpenseForm(new URLSearchParams({ ...expenseInput, description: "Tape", amount: "100", paid_from_account: "kd-gcash" })));
  const saved = sql.prepare("SELECT paid_from_account, paid_to_account FROM expenses WHERE description = 'KDSEA000005 freight'").get()!;
  assert.deepEqual({ ...saved }, { paid_from_account: "kd-unionbank", paid_to_account: "nihao-bdo" });

  const csrf = "token";
  await mutateFinanceCash(db, new URLSearchParams({ csrf, entry_date: "2026-09-08", entry_type: "Owner Contribution", customer_id: "",
    related_entry_id: "", amount: "5000", reference_number: "", notes: "Top up", bank_account: "kd-gcash" }));
  await assert.rejects(mutateFinanceCash(db, new URLSearchParams({ csrf, entry_date: "2026-09-08", entry_type: "Owner Contribution", customer_id: "",
    related_entry_id: "", amount: "5000", reference_number: "", notes: "Wrong", bank_account: "nihao-bdo" })));

  const nihao = await (await financeAccountsPage(db, new URL("https://admin.test/admin/finance/accounts"), "Admin")).text();
  assert.match(nihao, /aria-current="page">Ni Hao Bank Accounts/);
  for (const number of ["532600010047", "279-7-27901627-7", "0128 8800 1087"]) assert.match(nihao, new RegExp(number));
  assert.match(nihao, /KDSEA000005 freight/);
  assert.match(nihao, /₱25,415\.00/);
  assert.match(nihao, /paid_to_account=nihao-bdo/);
  assert.doesNotMatch(nihao, /Tape/);

  const kd = await (await financeAccountsPage(db, new URL("https://admin.test/admin/finance/accounts?tab=kargodoor"), "Admin")).text();
  assert.match(kd, /aria-current="page">KargoDoor Bank Accounts/);
  assert.match(kd, /002170017106/);
  assert.match(kd, /0919 932 3077/);
  assert.match(kd, /Top up/);
  assert.match(kd, /Tape/);
  assert.match(kd, /₱4,900\.00/); // GCash net: 5,000 in − 100 out

  const form = await (await expensesPage(db, new URL("https://admin.test/admin/finance/expenses?new=1&paid_to_account=nihao-sterling&category=Freight%20%2F%20Ni%20Hao%20Cost"), "Admin", "token")).text();
  assert.match(form, /<option value="nihao-sterling" selected>/);
  assert.match(form, /<option value="Freight \/ Ni Hao Cost" selected>/);
  assert.match(form, /value="NIHAO EXPRESS LOGISTICS CORPORATION"/);
  const viewer = await (await financeAccountsPage(db, new URL("https://admin.test/admin/finance/accounts"), "Viewer", false)).text();
  assert.doesNotMatch(viewer, /Record payment to Ni Hao/);
});

test("shipment notifications include warehouse pickup instructions after Malabon Warehouse", () => {
  const messages = shipmentStatusMessages({ customerName: "Maria", tracking: "KDSEA-123456" });
  const keys = messages.map(([key]) => key);
  assert.equal(keys.indexOf("pickup-instructions"), keys.indexOf("malabon-warehouse") + 1);
  const body = messages.find(([key]) => key === "pickup-instructions")![2];
  assert.match(body, /^📦 KARGODOOR PH – WAREHOUSE PICKUP INSTRUCTIONS\n\nHi Maria! 😊/);
  assert.match(body, /Old 59, New 36 Rivera St Brgy Tañong Malabon City/);
  assert.match(body, /FSW COMMERCIAL WAREHOUSE RENTAL/);
  assert.match(body, /Wingvan Trucks\nAllowed only from 10:00 PM – 2:00 AM\./);
  assert.doesNotMatch(body, /\*\*/);
  assert.match(body, /Thank you for trusting KargoDoorPH\.com! 💚 💙$/);
});

test("shipment status notifications follow Em's order and Nihao addresses end with Malabon", () => {
  const titles = shipmentStatusMessages({ customerName: "Maria" }).map(([, title]) => title);
  assert.deepEqual(titles, [
    "Awaiting Supplier Package", "China Warehouse", "China Port", "Sea Transit", "Air Transit", "Manila Port",
    "Gatepass", "Malabon Warehouse", "Pickup Instructions", "Lalamove Rider Pickup", "Payment Instructions Reminder", "Out for Delivery",
    "Delivered", "Feedback / Referral",
  ]);
  assert.equal(notificationKeyFor("Sea Transit", "Air Freight"), "air-transit");
  assert.equal(notificationKeyFor("Sea Transit", "Sea Freight"), "sea-transit");
  assert.equal(notificationKeyFor("Air Transit", "Air Freight"), "air-transit");
  const book = nihaoAddressBook().map(([name]) => name);
  assert.deepEqual(book, ["Guangzhou", "Yiwu", "Shishi", "Tongda Air Cargo", "Hong Kong", "Malabon Warehouse"]);
  assert.match(nihaoAddressBook()[5][1], /^Tongda Malabon Warehouse Address\nPIN: FSW COMMERCIAL WAREHOUSE RENTAL/);
});

test("every customer message ends with the KargoDoorPH.com footer, once", () => {
  const all = [
    ...shipmentStatusMessages({ customerName: "Maria", tracking: "KDSEA-1" }).filter(([key]) => key !== "rider-pickup").map(([, , body]) => body),
    customerShippingInstructions({ name: "Maria", customerCode: "KD-1", warehouse: "Yiwu" }),
    customerWarehouseAddressMessage({ name: "Maria", customerCode: "KD-1", warehouse: "Yiwu" }),
  ];
  for (const body of all) {
    assert.ok(body.endsWith("Thank you for trusting KargoDoorPH.com! 💚 💙"), body.slice(-80));
    assert.equal(body.split("Thank you for trusting KargoDoorPH.com!").length, 2);
    assert.doesNotMatch(body, /China to PH, Made SIMPLE/);
  }
});

test("rider pickup message carries the shipment's KDOOR code and stays under 500 characters", () => {
  const rider = shipmentStatusMessages({ customerName: "Maria", cargoCode: "KDOOR-0009", item: "RC Cars", tracking: "KDSEA-123456" })
    .find(([key]) => key === "rider-pickup")![2];
  assert.match(rider, /^Hi Rider! Pagdating po sa warehouse:\nAccount\/ Cargo Code: KDOOR-0009\nItem: RC Cars\n/);
  assert.match(rider, /2 valid government IDs/);
  assert.doesNotMatch(rider, /\*\*/);
  assert.ok(rider.endsWith("Salamat po! 💚"));
  assert.ok(rider.length < 500, String(rider.length));
});

test("marking Ni Hao paid on a shipment creates one linked expense and no double count", async () => {
  const { db, sql, user } = database();
  const { recordNiHaoPayment, readNiHaoPayment, niHaoPaymentSection } = await import("../../lib/admin/nihao-payment");
  const { readSimpleSummary } = await import("../../lib/admin/finance-summary");
  const { readCashOnHand } = await import("../../lib/admin/finance-cash");
  const customerId = randomUUID();
  const shipmentId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(customerId, "KD-NH", "Ni Hao Test", "+639170000000", "2026-10-01", "2026-10-01");
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, nihao_cost, nihao_cost_source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(shipmentId, customerId, "KDSEA777001", "Sea Freight", "Guangzhou", 1, 100, "Malabon Warehouse", 3000000, 0, "Unpaid", 2500000, "estimate", "2026-10-01", "2026-10-01");
  const actor = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };

  const before = await readSimpleSummary(db);
  assert.equal(before.goingOut, BigInt(2500000));
  const cashBefore = await readCashOnHand(db, "2026-12-31");
  const unpaid = niHaoPaymentSection({ path: "/admin/shipments", csrf: "t", shipmentId, trackingNumber: "KDSEA777001", nihaoCost: 2500000, payment: null, canWrite: true });
  assert.match(unpaid, /Mark Ni Hao paid/);
  assert.match(unpaid, /value="25000\.00"/);

  const form = new URLSearchParams({ csrf: "t", action: "nihao_paid", id: shipmentId, expense_date: "2026-11-02", amount: "25415.00", payment_method: "Bank Transfer", reference_number: "SOA 9784", notes: "" });
  await recordNiHaoPayment(db, form, actor);

  const expense = sql.prepare("SELECT * FROM expenses").get()!;
  assert.equal(expense.category, "Freight / Ni Hao Cost");
  assert.equal(expense.payee, "Ni Hao");
  assert.equal(expense.amount, 2541500);
  assert.equal(expense.tracking_number, "KDSEA777001");
  assert.equal(expense.reference_number, "SOA 9784");
  const shipment = sql.prepare("SELECT nihao_cost, nihao_cost_source FROM shipments WHERE id = ?").get(shipmentId)!;
  assert.equal(shipment.nihao_cost, 2541500);
  assert.equal(shipment.nihao_cost_source, "actual");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE action = 'nihao_paid' AND entity_id = ?").get(shipmentId)!.n, 1);

  // Cash goes down once; the shipment is no longer owed to Ni Hao; profit
  // still counts the cost once (from the shipment, not the expense too).
  const after = await readSimpleSummary(db);
  assert.equal(after.goingOut, BigInt(0));
  assert.equal(after.allTimeExpenses, before.allTimeExpenses);
  assert.equal(after.expectedProfit, BigInt(3000000 - 2541500));
  const cashAfter = await readCashOnHand(db, "2026-12-31");
  assert.equal(cashBefore.total - cashAfter.total, BigInt(2541500));

  const payment = await readNiHaoPayment(db, "kdsea777001");
  assert.equal(payment?.amount, 2541500);
  assert.match(niHaoPaymentSection({ path: "/admin/shipments", csrf: "t", shipmentId, trackingNumber: "KDSEA777001", nihaoCost: 2541500, payment, canWrite: true }), /Paid/);

  await assert.rejects(recordNiHaoPayment(db, form, actor), /already marked paid/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n, 1);
  await assert.rejects(recordNiHaoPayment(db, new URLSearchParams({ ...Object.fromEntries(form), extra: "x" }), actor), /Unexpected/);
});

test("shipment statement PDF and ledger CSV join customer, KD billing and Ni Hao payment", async () => {
  const { db, sql, user } = database();
  const { recordNiHaoPayment } = await import("../../lib/admin/nihao-payment");
  const { readShipmentStatement, shipmentStatementPdf, shipmentsLedgerCsv, statementFilename } = await import("../../lib/admin/shipment-statement");
  const customerId = randomUUID();
  const shipmentId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, company_name, mobile, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(customerId, "KDOOR-9001", "Statement Tester", "Test Co", "09170000001", "tester@example.test", "2026-10-01", "2026-10-01");
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, nihao_cost, nihao_cost_source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(shipmentId, customerId, "KDAIR-900001", "Air Freight", "Guangzhou", 0.01, 2, "Malabon Warehouse", 100000, 24700, "Unpaid", 70000, "actual", "2026-10-01", "2026-10-01");

  let statement = await readShipmentStatement(db, shipmentId);
  assert.equal(statement.invoice, null);
  assert.equal(statement.billed, 124700);
  assert.equal(statement.balance, 124700);
  assert.equal(statement.niHaoOwed, 70000);
  assert.equal(statement.profit, 30000);
  assert.equal(statementFilename(statement), "KDAIR-900001 - Statement Tester.pdf");

  await recordNiHaoPayment(db, new URLSearchParams({ csrf: "t", action: "nihao_paid", id: shipmentId, expense_date: "2026-11-02", amount: "700.00", payment_method: "GCash", reference_number: "SOA 9986", notes: "" }),
    { id: user, name: "Admin", email: "admin@example.test", role: "admin" });
  statement = await readShipmentStatement(db, shipmentId);
  assert.equal(statement.niHaoPaid, 70000);
  assert.equal(statement.niHaoOwed, 0);
  const pdf = new TextDecoder().decode(shipmentStatementPdf(statement, "2026-11-02"));
  assert.match(pdf, /^%PDF-1\.4/);
  for (const expected of ["Statement Tester", "Test Co", "09170000001", "tester@example.test", "KDOOR-9001", "KDAIR-900001", "SOA 9986", "30.0% margin", "Not issued yet"])
    assert.ok(pdf.includes(expected), expected);

  const csv = await (await shipmentsLedgerCsv(db, "2026-11-02")).text();
  const [header, row] = csv.replace(/^﻿/, "").trim().split("\r\n");
  const cells = Object.fromEntries(header.split(",").map((name, i) => [name, row.split(",")[i]]));
  assert.equal(cells["Customer"], "Statement Tester");
  assert.equal(cells["Mobile"], "09170000001");
  assert.equal(cells["KD Billed PHP"], "1247.00");
  assert.equal(cells["Ni Hao Paid PHP"], "700.00");
  assert.equal(cells["Ni Hao Reference"], "SOA 9986");
  assert.equal(cells["Owed to Ni Hao PHP"], "0.00");
  assert.equal(cells["Freight Profit PHP"], "300.00");
  assert.equal(cells["Margin %"], "30.0");
});

test("Ni Hao payment with a transfer fee saves the fee as its own Bank / Payment Fees expense", async () => {
  const { db, sql, user } = database();
  const { recordNiHaoPayment, readNiHaoPayment } = await import("../../lib/admin/nihao-payment");
  const { readShipmentStatement, shipmentsLedgerCsv } = await import("../../lib/admin/shipment-statement");
  const customerId = randomUUID();
  const shipmentId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(customerId, "KD-FEE", "Fee Tester", "+639170000002", "2026-10-01", "2026-10-01");
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, nihao_cost, nihao_cost_source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(shipmentId, customerId, "KDAIR-900002", "Air Freight", "Guangzhou", 0.01, 2, "Malabon Warehouse", 100000, 0, "Unpaid", 70000, "actual", "2026-10-01", "2026-10-01");
  const actor = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  const form = new URLSearchParams({ csrf: "t", action: "nihao_paid", id: shipmentId, expense_date: "2026-11-02", amount: "700.00", paid_from: "GCash", paid_to_account: "nihao-bdo", transfer_fee: "10.00", reference_number: "GC-1", notes: "" });
  await recordNiHaoPayment(db, form, actor);
  // The Bank Accounts page sees both rows as paid from GCash; only the freight went to Ni Hao's BDO.
  assert.deepEqual(sql.prepare("SELECT paid_from_account, paid_to_account FROM expenses ORDER BY amount DESC").all().map((r) => [r.paid_from_account, r.paid_to_account]),
    [["kd-gcash", "nihao-bdo"], ["kd-gcash", null]]);
  const rows = sql.prepare("SELECT category, payee, amount, payment_method, tracking_number, description FROM expenses ORDER BY amount DESC").all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].category, "Freight / Ni Hao Cost");
  assert.equal(rows[0].payment_method, "GCash");
  assert.equal(rows[1].category, "Bank / Payment Fees");
  assert.equal(rows[1].payee, "GCash");
  assert.equal(rows[1].amount, 1000);
  assert.equal(rows[1].tracking_number, "KDAIR-900002");
  assert.match(String(rows[1].description), /GCash to Ni Hao/);
  assert.equal((await readNiHaoPayment(db, "KDAIR-900002"))?.fees, 1000);
  const statement = await readShipmentStatement(db, shipmentId);
  assert.equal(statement.transferFees, 1000);
  assert.equal(statement.profitAfterFees, 29000);
  const csv = await (await shipmentsLedgerCsv(db, "2026-11-02")).text();
  const [header, row] = csv.replace(/^﻿/, "").trim().split("\r\n");
  const cells = Object.fromEntries(header.split(",").map((name, i) => [name, row.split(",")[i]]));
  assert.equal(cells["Transfer Fees PHP"], "10.00");
  assert.equal(cells["Profit After Fees PHP"], "290.00");
  // A bad account or a second payment changes nothing.
  await assert.rejects(recordNiHaoPayment(db, new URLSearchParams({ ...Object.fromEntries(form), paid_from: "Bitcoin" }), actor), /paid from/);
  await assert.rejects(recordNiHaoPayment(db, form, actor), /already marked paid/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM expenses").get()!.n, 2);
});

test("Record payment on the shipment page makes and issues the invoice, records the money and marks the shipment Paid", async () => {
  const { db, sql, user } = database();
  const { recordShipmentPayment, readShipmentBilling, shipmentPaymentSection } = await import("../../lib/admin/shipment-payment");
  const customerId = randomUUID();
  const shipmentId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(customerId, "KD-PAY", "Pay Tester", "+639170000003", "2026-10-01", "2026-10-01");
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(shipmentId, customerId, "KDSEA900003", "Sea Freight", "Guangzhou", 1, 100, "China Warehouse", 60000, 0, "Unpaid", "2026-10-01", "2026-10-01");
  const actor = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  let billing = await readShipmentBilling(db, shipmentId, { shipping_charge: 60000, delivery_charge: 0 });
  assert.equal(billing.invoiceId, null);
  const form = shipmentPaymentSection({ path: "/admin/shipments", csrf: "t", shipmentId, billing, canWrite: true });
  assert.match(form, /value="600\.00"/);
  assert.match(form, /Record payment/);

  const pay = (amount: string) => new URLSearchParams({ csrf: "t", action: "customer_paid", id: shipmentId, amount, payment_method: "GCash", payment_date: "2026-11-02", reference_number: "GC-9", notes: "" });
  await recordShipmentPayment(db, pay("200.00"), actor);
  billing = await readShipmentBilling(db, shipmentId, {});
  assert.equal(billing.status, "Partial");
  assert.equal(sql.prepare("SELECT issued_at FROM invoices").get()!.issued_at, "2026-11-02");
  assert.equal(sql.prepare("SELECT payment_status FROM shipments").get()!.payment_status, "Partial");
  await assert.rejects(recordShipmentPayment(db, pay("500.00"), actor), /remaining balance/);
  await recordShipmentPayment(db, pay("400.00"), actor);
  billing = await readShipmentBilling(db, shipmentId, {});
  assert.equal(billing.status, "Paid");
  assert.equal(billing.paid, 60000);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM invoices").get()!.n, 1);
  assert.equal(sql.prepare("SELECT payment_status FROM shipments").get()!.payment_status, "Paid");
  assert.match(shipmentPaymentSection({ path: "/admin/shipments", csrf: "t", shipmentId, billing, canWrite: true }), /<strong>Paid<\/strong>/);
  await assert.rejects(recordShipmentPayment(db, pay("1.00"), actor), /already fully paid/);
  await assert.rejects(recordShipmentPayment(db, new URLSearchParams({ ...Object.fromEntries(pay("1")), extra: "x" }), actor), /Unexpected/);
});

test("₱30 transfer fee is inside every new admin shipping fee (not the website calculator), shown only inside the admin, and reported as collected vs paid", async () => {
  const { db, sql, user } = database();
  const { transferFeePesos, seaQuote, airQuote } = await import("../../lib/admin/quotation-pricing");
  const { getSeaEstimate, getAirEstimate } = await import("../../lib/shipping-estimate.mjs");
  const { financeDashboard } = await import("../../lib/admin/finance-summary");
  const { lastNiHaoTransferFee, niHaoPaymentSection } = await import("../../lib/admin/nihao-payment");
  assert.equal(transferFeePesos, 30);
  assert.equal(seaQuote("LOW VALUE GOODS", 0.01, 1).final, 280, "KD Mini ₱250 + ₱30");
  assert.equal(airQuote("Mobile Phones", 0, 0, 1).final, 980, "1 phone ₱950 + ₱30");
  // The public website calculator keeps the old prices (Em, 2026-11-02).
  assert.equal(getSeaEstimate(0.01, 1).amount, 250);
  assert.equal(getAirEstimate(1).amount, 500);

  // Existing shipments stay at 0; new ones get ₱30 (3000 centavos) by default.
  const customerId = randomUUID();
  const shipmentId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(customerId, "KD-FEE", "Fee Tester", "+639170000004", "2026-10-01", "2026-10-01");
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(shipmentId, customerId, "KDSEA900004", "Sea Freight", "Guangzhou", 0.01, 1, "China Warehouse", 28000, 0, "Unpaid", "2026-11-02", "2026-11-02");
  assert.equal(sql.prepare("SELECT transfer_fee_collected AS fee FROM shipments WHERE id = ?").get(shipmentId)!.fee, 3000);

  // Invoice it and record a ₱10 bank fee: Reports shows ₱30 collected, ₱10 paid, ₱20 left over.
  sql.prepare("INSERT INTO invoices (id, invoice_number, customer_id, shipment_id, subtotal, delivery_charge, total, status, issued_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(randomUUID(), "INV-FEE-1", customerId, shipmentId, 28000, 0, 28000, "Unpaid", "2026-11-02", "2026-11-02", "2026-11-02");
  sql.prepare("INSERT INTO expenses (id, expense_date, category, payee, description, amount, payment_method, tracking_number, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(randomUUID(), "2026-11-02", "Bank / Payment Fees", "GCash", "Transfer fee", 1000, "GCash", "KDSEA900004", "2026-11-02", "2026-11-02");
  const reports = await (await financeDashboard(db, new URL("https://admin.local/admin/finance/reports?preset=all"), user, new Date("2026-11-02T08:00:00Z"), true, "reports")).text();
  const section = reports.slice(reports.indexOf("<h2>Transfer fees</h2>"));
  assert.match(section, /Collected[^<]*<\/span><strong>₱30\.00/);
  assert.match(section, /Paid[^<]*<\/span><strong>₱10\.00/);
  assert.match(section, /Left over<\/span><strong>₱20\.00/);

  // The fee box on Mark Ni Hao paid is filled in from the last transfer.
  assert.equal(await lastNiHaoTransferFee(db), 1000);
  const form = niHaoPaymentSection({ path: "/admin/shipments", csrf: "t", shipmentId, trackingNumber: "KDSEA900004", nihaoCost: 20000, payment: null, canWrite: true, suggestedFee: 1000 });
  assert.match(form, /name="transfer_fee"[^>]*value="10\.00"/);
});

test("Ni Hao details on Edit shipment: No. 9945 for KDSEA000006, copy text uses Ni Hao cost and verified size, file upload", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", { ...customer, full_name: "Archie Aguirre", customer_code: "KD-NH" }, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", { ...shipment(customerId), tracking_number: "KDSEA000006", verified_cbm: 0.06, verified_weight_kg: 6 }, user, "", "");
  sql.prepare("UPDATE shipments SET nihao_cost = 60000, nihao_cost_source = 'actual' WHERE id = ?").run(shipmentId);

  const form = new URLSearchParams({ csrf: "x", delivery_charge: "0", nihao_no: " 9945 ", nihao_doc_no: "0040385", nihao_date: "2026-10-30", nihao_tracking: "2610040014-1" });
  const details = takeNiHaoDetails(form)!;
  assert.deepEqual({ ...details }, { nihao_no: "9945", nihao_doc_no: "0040385", nihao_date: "2026-10-30", nihao_tracking: "2610040014-1" });
  assert.deepEqual([...form.keys()], ["csrf", "delivery_charge"], "the shipment form no longer carries the Ni Hao fields");
  assert.equal(takeNiHaoDetails(new URLSearchParams({ csrf: "x" })), null);
  assert.throws(() => takeNiHaoDetails(new URLSearchParams({ nihao_date: "30/10/2026" })));
  assert.equal(await saveNiHaoDetails(db, shipmentId, details, user), true);
  assert.equal(await saveNiHaoDetails(db, shipmentId, details, user), false, "no change, no second log");

  const saved = await readNiHaoDetails(db, shipmentId);
  const record = sql.prepare("SELECT * FROM shipments WHERE id = ?").get(shipmentId) as Record<string, unknown>;
  assert.equal(niHaoCopyText(saved, record as never, "Archie Aguirre"), [
    "Ni Hao No.: 9945", "Ni Hao Doc No.: 0040385", "Ni Hao date: Oct 30, 2026", "Ni Hao Tracking No.: 2610040014-1",
    "Verified CBM: 0.060", "Verified weight: 6 kg", "Ni Hao freight cost: ₱600.00", "KargoDoor shipment: KDSEA000006 (Archie Aguirre)",
  ].join("\n"));

  const pdf = new File([new TextEncoder().encode("%PDF-1.7\nNi Hao 9945")], "NiHao 9945.pdf", { type: "application/pdf" });
  await saveNiHaoFile(db, shipmentId, pdf, user);
  await saveNiHaoFile(db, shipmentId, new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])], "photo.jpg"), user);
  const stored = await readNiHaoFile(db, shipmentId);
  assert.equal(stored?.file_mime, "image/jpeg");
  assert.equal(niHaoFileResponse(stored!).headers.get("Content-Type"), "image/jpeg");
  assert.equal((await readNiHaoDetails(db, shipmentId))?.nihao_no, "9945", "uploading keeps the typed details");
  await assert.rejects(saveNiHaoFile(db, shipmentId, new File(["<html><script>"], "x.pdf"), user), /PDF, JPEG, PNG or WebP/);
  await assert.rejects(saveNiHaoFile(db, shipmentId, new File([new Uint8Array(1.6 * 1024 * 1024)], "big.pdf"), user), /over 1\.5 MB/);
  await assert.rejects(saveNiHaoFile(db, randomUUID(), pdf, user), /Shipment not found/);
  assert.deepEqual(sql.prepare("SELECT action FROM activity_log WHERE action LIKE 'nihao_%' ORDER BY rowid").all().map((row) => row.action),
    ["nihao_details", "nihao_file_uploaded", "nihao_file_replaced"]);

  const box = niHaoDetailsBox({ shipmentId, record: record as never, details: await readNiHaoDetails(db, shipmentId), customerName: "Archie Aguirre", csrf: "token", canWrite: true });
  assert.match(box.inline, /<h4>Ni Hao details<\/h4>/);
  assert.match(box.inline, /name="nihao_no" value="9945"/);
  assert.match(box.inline, /photo\.jpg/);
  assert.match(box.inline, /href="\/admin\/shipments\/nihao-file\?id=/);
  assert.match(box.inline, /<input form="nihao-file-form" type="file" name="file"/);
  assert.match(box.inline, /data-copy-source="nihao-copy-/);
  assert.doesNotMatch(box.inline, /SOA/);
  assert.match(box.form, /<form id="nihao-file-form" method="post" action="\/admin\/shipments\/nihao-file" enctype="multipart\/form-data">/);
  const viewer = niHaoDetailsBox({ shipmentId, record: record as never, details: null, customerName: "", csrf: "", canWrite: false });
  assert.equal(viewer.form, "");
  assert.match(viewer.inline, /name="nihao_no" value="" maxlength="40" placeholder="9945" readonly/);
});

test("estimated arrival window counts from the China warehouse received date", async () => {
  const { arrivalWindow, arrivalWindowDone, formatArrivalWindow, shortArrivalWindow } = await import("../../lib/admin/arrival-window");
  const sea = arrivalWindow("Sea Freight", "2026-10-22");
  assert.deepEqual(sea, { from: "2026-11-12", to: "2026-11-26", span: "3–5 weeks" });
  assert.equal(formatArrivalWindow(sea!), "Nov 12 – Nov 26, 2026");
  assert.equal(shortArrivalWindow(sea!), "Nov 12 – 26");
  assert.deepEqual(arrivalWindow("FCL", "2026-10-22"), sea);
  const air = arrivalWindow("Air Freight", "2026-10-29");
  assert.deepEqual(air, { from: "2026-11-03", to: "2026-11-05", span: "5–7 days" });
  assert.equal(shortArrivalWindow(arrivalWindow("Air Freight", "2026-10-27")!), "Nov 1 – 3");
  assert.equal(formatArrivalWindow(arrivalWindow("Sea Freight", "2026-12-10")!), "Dec 31, 2026 – Jan 14, 2027");
  assert.equal(arrivalWindow("Sea Freight", null), null);
  assert.equal(arrivalWindow("Sea Freight", ""), null);
  assert.equal(arrivalWindowDone("Delivered"), true);
  assert.equal(arrivalWindowDone("Sea Transit"), false);
});

test("Malabon warehouse received date and Delivered date are saved and checked in order", async () => {
  const { db, user } = database();
  const customerId = await saveRecord(db, "customers", { ...customer, customer_code: "KD-DELIV", email: "deliv@example.test" }, user, "", "");
  const { tracking_number: _t, cargo_code: _c, ...formInput } = shipmentInput(customerId);
  void _t; void _c;
  const form = (values: Record<string, string>) => parseForm("shipments", new URLSearchParams(Object.entries({ ...formInput, ...values }))) as RecordData;
  assert.throws(() => form({ status: "Delivered", actual_arrival: "2026-11-20", delivered_date: "2026-11-18" }), /Delivered date cannot be before/);
  const values = form({ status: "Delivered", actual_arrival: "2026-11-20", delivered_date: "2026-11-22" });
  assert.equal(values.delivered_date, "2026-11-22");
  const id = await saveRecord(db, "shipments", values, user, "", "");
  const saved = await db.prepare("SELECT actual_arrival, delivered_date FROM shipments WHERE id = ?").bind(id).first<RecordData>();
  assert.deepEqual({ ...saved }, { actual_arrival: "2026-11-20", delivered_date: "2026-11-22" });
});

test("proof of payment: upload and replace on a customer payment and an expense, staff only on their own expenses", async () => {
  const { sql, db, user } = database();
  const admin = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  const customerId = await saveRecord(db, "customers", { ...customer, customer_code: "KD-PROOF" }, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", { ...shipment(customerId), tracking_number: "KDSEA900777" }, user, "", "");
  const invoiceId = randomUUID();
  sql.prepare(`INSERT INTO invoices (id, invoice_number, customer_id, shipment_id, subtotal, delivery_charge, total, status, issued_at, due_at, created_at, updated_at, other_charge)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceId, "INV-PROOF", customerId, shipmentId, 60000, 0, 60000, "Unpaid", "2026-11-01", null, "2026-11-01", "2026-11-01", 0);
  const paymentId = randomUUID();
  sql.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?,?,?)").run(paymentId, invoiceId, customerId, 60000, "GCash", "GC-123", "2026-11-02", null, "2026-11-02");

  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], "gcash receipt.png", { type: "image/png" });
  await saveProof(db, "payment", paymentId, png, admin);
  await saveProof(db, "payment", paymentId, new File([new TextEncoder().encode("%PDF-1.7 bank")], "bank.pdf"), admin);
  assert.equal((await readProofFile(db, "payment", paymentId))?.file_mime, "application/pdf");
  assert.equal((await readProofs(db, "payment", [paymentId, randomUUID(), "not-a-uuid"])).get(paymentId)?.file_name, "bank.pdf");
  await assert.rejects(saveProof(db, "payment", paymentId, new File(["<html>"], "x.png"), admin), /PDF, JPEG, PNG or WebP/);
  await assert.rejects(saveProof(db, "payment", paymentId, new File([new Uint8Array(1.6 * 1024 * 1024)], "big.pdf"), admin), /over 1\.5 MB/);
  await assert.rejects(saveProof(db, "payment", randomUUID(), png, admin), /Payment not found/);
  const staff = { id: "staff", name: "Staff", email: "staff@example.test", role: "staff" as const };
  sql.prepare("INSERT INTO admin_users VALUES ('staff','Staff','staff@example.test','staff','2026-01-01','2026-01-01')").run();
  await assert.rejects(saveProof(db, "payment", paymentId, png, staff), /only Quotations and Expenses/);
  assert.deepEqual(sql.prepare("SELECT action, entity_type FROM activity_log WHERE action LIKE 'proof_%' ORDER BY rowid").all().map((row) => [row.action, row.entity_type]),
    [["proof_uploaded", "payments"], ["proof_replaced", "payments"]]);

  // Payment rows on Edit shipment get their own detached upload forms.
  const received = await readShipmentPayments(db, invoiceId);
  const cell = proofCell({ kind: "payment", id: paymentId, proof: (await readProofs(db, "payment", [paymentId])).get(paymentId), csrf: "t", canWrite: true, back: `/admin/shipments?id=${shipmentId}&edit=1#customer-payment`, formId: "payment-proof-form-0" });
  assert.match(cell.inline, /📄 View proof/);
  assert.match(cell.inline, /<input form="payment-proof-form-0" type="file" name="file"/);
  assert.match(cell.form, /<form id="payment-proof-form-0" method="post" action="\/admin\/finance\/proof" enctype="multipart\/form-data">/);
  assert.match(shipmentPaymentsList(received, [cell.inline]), /View proof[\s\S]*GC-123/);
  assert.equal(proofCell({ kind: "payment", id: paymentId, proof: null, csrf: "", canWrite: false, back: "/admin/invoices" }).inline, '<span class="muted">—</span>');
  assert.equal(proofCell({ kind: "payment", id: paymentId, csrf: "t", canWrite: true, back: "https://evil.test/" }).form, "", "unknown return pages get no upload form");

  // Expenses: the list shows a Proof box per row; staff may add proof only to expenses they made.
  await saveExpense(db, parseExpenseForm(new URLSearchParams(expenseInput)), "staff");
  await saveExpense(db, parseExpenseForm(new URLSearchParams({ ...expenseInput, description: "Owner expense" })), user);
  const staffExpense = String(sql.prepare("SELECT id FROM expenses WHERE created_by_admin_user_id = 'staff'").get()!.id);
  const ownerExpense = String(sql.prepare("SELECT id FROM expenses WHERE created_by_admin_user_id = ?").get(user)!.id);
  await saveProof(db, "expense", staffExpense, png, staff);
  await assert.rejects(saveProof(db, "expense", ownerExpense, png, staff), /Expense not found/);
  const list = await (await expensesPage(db, new URL("https://admin.test/admin/finance/expenses?category=Office+%2F+Rent"), admin, "token")).text();
  assert.doesNotMatch(list, /View proof|proof-drop/, "the proof lives in Edit expense, not the list (Em, 2026-11-03)");
  const editPage = await (await expensesPage(db, new URL(`https://admin.test/admin/finance/expenses?edit=${staffExpense}`), admin, "token")).text();
  assert.match(editPage, /<h2>Proof of payment<\/h2>/);
  assert.match(editPage, /href="\/admin\/finance\/proof\?type=expense&amp;id=/);

  // Deleting an expense removes its proof file too.
  const revision = String(sql.prepare("SELECT updated_at FROM expenses WHERE id = ?").get(staffExpense)!.updated_at);
  await mutateExpense(db, new URLSearchParams({ csrf: "t", action: "delete", id: staffExpense, revision: "stale", confirm: "yes" }), { ...admin, role: "owner" }).catch(() => null);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM payment_proofs WHERE entity_type = 'expense'").get()!.n, 1, "a failed delete keeps the proof");
  await mutateExpense(db, new URLSearchParams({ csrf: "t", action: "delete", id: staffExpense, revision, confirm: "yes" }), { ...admin, role: "owner" });
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM payment_proofs WHERE entity_type = 'expense'").get()!.n, 0);
});

test("Transfer fee: ₱30 split on the shipment, Ni Hao fee merged into its Expenses row, GCash to UnionBank saved once per transfer", async () => {
  const { db, sql, user } = database();
  const { recordGcashTransfer, readTransferFeesPaid, splitFreightCharge, transferFeeSection, transferFeesPaidSummary, lastGcashTransferFee, gcashTransferSection } = await import("../../lib/admin/transfer-fees");
  const { recordNiHaoPayment } = await import("../../lib/admin/nihao-payment");
  const { readShipmentStatement } = await import("../../lib/admin/shipment-statement");
  const { expensesPage } = await import("../../lib/admin/expenses");
  const customerId = randomUUID();
  const shipmentId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(customerId, "KD-TF", "Fee Tester", "+639170000009", "2026-10-01", "2026-10-01");
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, nihao_cost, transfer_fee_collected, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(shipmentId, customerId, "KDAIR-900009", "Air Freight", "Guangzhou", 0, 1, "Delivered", 53000, 23100, 35000, 3000, "Paid", "2026-10-01", "2026-10-01");
  const actor = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  assert.deepEqual(splitFreightCharge(53000, 3000), { base: 50000, fee: 3000, charge: 53000 });
  assert.deepEqual(splitFreightCharge(2000, 3000), { base: 0, fee: 2000, charge: 2000 });

  let box = transferFeeSection({ shippingCharge: 53000, transferFeeCollected: 3000, fees: [] });
  assert.match(box, /₱500\.00<\/strong> KargoDoor base fee \+ <strong>₱30\.00<\/strong> transfer fee/);
  assert.doesNotMatch(box, /<form/);

  await recordNiHaoPayment(db, new URLSearchParams({ csrf: "t", action: "nihao_paid", id: shipmentId, expense_date: "2026-11-03", amount: "350.00", paid_from: "UnionBank", transfer_fee: "10.00", reference_number: "", notes: "" }), actor);
  const fees = await readTransferFeesPaid(db, "kdair-900009");
  assert.equal(transferFeesPaidSummary(fees), "₱10.00 UnionBank to Ni Hao");
  box = transferFeeSection({ shippingCharge: 53000, transferFeeCollected: 3000, fees });
  assert.match(box, /Paid ₱10\.00 of ₱30\.00 collected \(₱20\.00 left over\)/);
  assert.equal((await readShipmentStatement(db, shipmentId)).profitAfterFees, 17000);

  // GCash to UnionBank: one expense per transfer, no tracking number.
  assert.equal(await lastGcashTransferFee(db), null);
  const move = new URLSearchParams({ csrf: "t", action: "gcash_to_unionbank", expense_date: "2026-11-03", moved_amount: "2500", amount: "15.00", reference_number: "GC-1", notes: "" });
  await recordGcashTransfer(db, move, actor);
  const expense = sql.prepare("SELECT * FROM expenses WHERE description LIKE 'Transfer fee: GCash to UnionBank%'").get()!;
  assert.equal(expense.description, "Transfer fee: GCash to UnionBank (moved ₱2,500.00)");
  assert.equal(expense.category, "Bank / Payment Fees");
  assert.equal(expense.amount, 1500);
  assert.equal(expense.paid_from_account, "kd-gcash");
  assert.equal(expense.tracking_number, null);
  assert.equal(await lastGcashTransferFee(db), 1500);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE action = 'gcash_to_unionbank'").get()!.n, 1);
  assert.match(gcashTransferSection({ path: "/x", csrf: "t", suggestedFee: 1500 }), /value="15\.00"/);
  await assert.rejects(recordGcashTransfer(db, new URLSearchParams({ ...Object.fromEntries(move), id: "x" }), actor), /Unexpected/);
  await assert.rejects(recordGcashTransfer(db, new URLSearchParams({ ...Object.fromEntries(move), moved_amount: "-5" }), actor), /amount moved/);
  await assert.rejects(recordGcashTransfer(db, new URLSearchParams({ ...Object.fromEntries(move), moved_amount: "" }), actor), /amount moved/);

  // Expenses list: Ni Hao ₱350, its ₱10 fee and the GCash transfer fee are separate rows, counted apart.
  const all = sql.prepare("SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC").all() as Record<string, unknown>[];
  assert.equal(all.length, 3);
  const html = (await (await expensesPage(db, new URL("http://x/admin/finance/expenses"), actor, "t")).text());
  // One row for KDAIR-900009 (Ni Hao + fee in their own columns), one for the GCash transfer.
  const { groupExpenses } = await import("../../lib/admin/expenses");
  const lines = groupExpenses(all);
  assert.equal(lines.length, 2);
  const shipmentLine = lines.find((line) => line.niHao)!;
  assert.equal(shipmentLine.fee!.amount, 1000);
  assert.equal(shipmentLine.total, 36000);
  assert.equal(groupExpenses([{ id: "m", category: "Marketing / Advertising", amount: 50000 }])[0]!.other!.amount, 50000, "other expenses fill the Amount column");
  assert.doesNotMatch(html, /<th class="exp-tight">Actions<\/th>/, "rows open Edit; no Actions column (Em, 2026-11-03)");
  assert.match(html, /<th class="exp-num">Amount<\/th><th class="exp-num">Transfer fee<\/th><th class="exp-num">Delivery fee<\/th><th class="exp-num">Total<\/th>/);
  assert.match(html, /<tr class="exp-row" data-href="\/admin\/finance\/expenses\?edit=[^"]+" tabindex="0"/, "click the row to edit");
  assert.match(html, /₱350\.00<\/a><\/td><td class="exp-num"><a[^>]*>₱10\.00<\/a><\/td><td class="exp-num"><span class="muted">—<\/span><\/td>\s*<td class="exp-num"><strong>₱360\.00/);
  assert.match(html, /Ni Hao cost<\/span><strong>₱350\.00/);
  assert.match(html, /Transfer fees<\/span><strong>₱25\.00/);
  assert.match(html, /Delivery fees<\/span><strong>₱0\.00/);
  assert.match(html, /Total expenses<\/span><strong>₱375\.00/);
  assert.match(html, /Moved GCash to UnionBank/);
});

test("Money In & Out lists every payment, money-in entry and expense with a running balance that ends at Cash on Hand", async () => {
  const { db, sql, user } = database();
  const { readLedger, filterLedger, moneyLedgerPage } = await import("../../lib/admin/money-ledger");
  const { readCashOnHand } = await import("../../lib/admin/finance-cash");
  const { recordShipmentPayment } = await import("../../lib/admin/shipment-payment");
  const customerId = randomUUID();
  const shipmentId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(customerId, "KD-LG", "Ledger Tester", "+639170000010", "2026-10-01", "2026-10-01");
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(shipmentId, customerId, "KDAIR-900010", "Air Freight", "Guangzhou", 0, 1, "Delivered", 53000, 23100, "Unpaid", "2026-10-01", "2026-10-01");
  const actor = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  const cash = sql.prepare("INSERT INTO finance_cash_entries (id, entry_date, entry_type, amount, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)");
  cash.run(randomUUID(), "2026-10-16", "Opening Cash Balance", 2500000, "Opening", "2026-10-16", "2026-10-16");
  cash.run(randomUUID(), "2026-10-20", "Customer Reimbursement Due", 10000, "Owed, not cash", "2026-10-20", "2026-10-20");
  const expense = sql.prepare("INSERT INTO expenses (id, expense_date, category, payee, description, amount, payment_method, tracking_number, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  expense.run(randomUUID(), "2026-09-01", "Marketing", "Printer", "Tarp (paid personally, before opening cash)", 50000, "Cash", null, "2026-09-01", "2026-09-01");
  expense.run(randomUUID(), "2026-11-03", "Freight / Ni Hao Cost", "Ni Hao", "Ni Hao freight cost for KDAIR-900010", 35000, "Bank Transfer", "KDAIR-900010", "2026-11-03T01", "2026-11-03T01");
  await recordShipmentPayment(db, new URLSearchParams({ csrf: "t", action: "customer_paid", id: shipmentId, amount: "761.00", payment_method: "GCash", payment_date: "2026-11-03", reference_number: "GC-7", notes: "" }), actor);

  const { rows, openingDate } = await readLedger(db, "2026-11-30");
  assert.equal(openingDate, "2026-10-16");
  assert.equal(rows.length, 4, "the reimbursement due is not cash");
  assert.deepEqual(rows.map((row) => [row.date, row.direction, row.balance]), [
    ["2026-09-01", "out", null],
    ["2026-10-16", "in", 2500000],
    ["2026-11-03", "in", 2576100],
    ["2026-11-03", "out", 2541100],
  ]);
  assert.equal(rows[2]!.who, "Ledger Tester");
  assert.equal(rows[2]!.tracking, "KDAIR-900010");
  assert.equal((await readCashOnHand(db, "2026-11-30")).total, BigInt(2541100), "last balance = Cash on Hand");
  assert.equal(filterLedger(rows, { from: "", to: "", show: "out", q: "" }).length, 2);
  assert.equal(filterLedger(rows, { from: "2026-11-01", to: "", show: "", q: "kdair-900010" }).length, 2);

  const html = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger"), "Admin", true)).text();
  assert.match(html, /Money In &amp; Out/);
  assert.match(html, /₱25,411\.00/);
  const csv = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger?show=in&download=csv"), "Admin", true)).text();
  assert.match(csv, /2026-11-03,In,Customer payment,Ledger Tester,Invoice INV-[^,]+,KDAIR-900010,GCash,GCash,GC-7,761\.00,,25761\.00/);
  assert.doesNotMatch(csv, /Printer/);
  await assert.rejects(moneyLedgerPage(db, new URL("http://x/admin/finance/ledger?from=2026-13-01"), "Admin", true), /valid dates/);
});
test("admin pages allow same-origin fetch so the Leads count in the menu can load", () => {
  // admin-skin.js fetches /admin/leads?count=1; without connect-src the browser blocks it.
  assert.match(secureHeaders["Content-Security-Policy"], /connect-src 'self'/);
  assert.doesNotMatch(secureHeaders["Content-Security-Policy"], /connect-src [^;]*\*/);
});

test("Account balances: UnionBank, GCash and Cash each keep their own running balance; transfers move money between them", async () => {
  const { db, sql, user } = database();
  const { readLedger, walletBalances, walletBalancesSection, moneyLedgerPage, walletOf } = await import("../../lib/admin/money-ledger");
  const { recordGcashTransfer } = await import("../../lib/admin/transfer-fees");
  const { readCashOnHand } = await import("../../lib/admin/finance-cash");
  const { shipmentPaymentSection } = await import("../../lib/admin/shipment-payment");
  const actor = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  assert.equal(walletOf(null, "GCash"), "kd-gcash");
  assert.equal(walletOf(null, "Bank Transfer"), "kd-unionbank");
  assert.equal(walletOf("kd-gcash", "Bank Transfer"), "kd-gcash");
  assert.equal(walletOf(null, "Other"), "");
  const customerId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(customerId, "KD-AC", "Acct Tester", "+639170000011", "2026-10-01", "2026-10-01");
  const invoice = (n: string, total: number) => {
    const shipmentId = randomUUID();
    const invoiceId = randomUUID();
    sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(shipmentId, customerId, n, "Air Freight", "Guangzhou", 0, 1, "Delivered", total, 0, "Paid", "2026-10-01", "2026-10-01");
    sql.prepare("INSERT INTO invoices (id, invoice_number, customer_id, shipment_id, status, subtotal, delivery_charge, other_charge, total, issued_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(invoiceId, `INV-${n}`, customerId, shipmentId, "Paid", total, 0, 0, total, "2026-10-20", "2026-10-20", "2026-10-20");
    return invoiceId;
  };
  const pay = sql.prepare("INSERT INTO payments (id, invoice_id, customer_id, amount, payment_method, payment_date, created_at) VALUES (?,?,?,?,?,?,?)");
  pay.run(randomUUID(), invoice("T-1", 2840500), customerId, 2840500, "Bank Transfer", "2026-10-27", "2026-10-27");
  pay.run(randomUUID(), invoice("T-2", 100000), customerId, 100000, "GCash", "2026-11-02", "2026-11-02");
  pay.run(randomUUID(), invoice("T-3", 60000), customerId, 60000, "Cash", "2026-11-02", "2026-11-02");
  sql.prepare("INSERT INTO finance_cash_entries (id, entry_date, entry_type, amount, notes, bank_account, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(randomUUID(), "2026-10-16", "Opening Cash Balance", 2500000, "Archie & Em", "kd-unionbank", "2026-10-16", "2026-10-16");
  const expense = sql.prepare("INSERT INTO expenses (id, expense_date, category, payee, description, amount, payment_method, paid_from_account, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  expense.run(randomUUID(), "2026-11-02", "Freight / Ni Hao Cost", "Ni Hao", "KDSEA000005", 2541500, "Bank Transfer", null, "2026-11-02", "2026-11-02");
  expense.run(randomUUID(), "2026-11-02", "Freight / Ni Hao Cost", "Ni Hao", "KDAIR-362870", 70000, "GCash", null, "2026-11-02", "2026-11-02");
  expense.run(randomUUID(), "2026-11-02", "Freight / Ni Hao Cost", "Ni Hao", "KDSEA000006", 60000, "Other", null, "2026-11-02", "2026-11-02");

  await recordGcashTransfer(db, new URLSearchParams({ csrf: "t", action: "gcash_to_unionbank", expense_date: "2026-11-03", moved_amount: "200.00", amount: "15.00", reference_number: "", notes: "" }), actor);
  await recordGcashTransfer(db, new URLSearchParams({ csrf: "t", action: "gcash_to_unionbank", expense_date: "2026-11-03", moved_amount: "10.00", amount: "", reference_number: "", notes: "" }), actor);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM account_transfers").get()!.n, 2);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM expenses WHERE category = 'Bank / Payment Fees'").get()!.n, 1, "no fee, no expense");

  const { rows } = await readLedger(db, "2026-11-30");
  const { byWallet, untagged, total } = walletBalances(rows);
  // UnionBank 25,000 + 28,405 − 25,415 + 200 + 10 = 28,200; GCash 1,000 − 700 − 200 − 15 − 10 = 75.
  assert.equal(byWallet["kd-unionbank"], 2820000);
  assert.equal(byWallet["kd-gcash"], 7500);
  assert.equal(byWallet.cash, 60000);
  assert.deepEqual(untagged.map((row) => row.amount), [60000], "only the 'Other' Ni Hao payment; a cash payment is owner cash");
  assert.equal(total, 2820000 + 7500 + 60000 - 60000);
  assert.equal(BigInt(total), (await readCashOnHand(db, "2026-11-30")).total, "transfers don't change Cash on Hand");

  const section = await walletBalancesSection(db);
  assert.match(section, /1 record needs an account/);
  assert.match(section, /href="\/admin\/finance\/ledger\?account=untagged"/);
  const gcash = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger?account=kd-gcash"), "Admin", true)).text();
  assert.match(gcash, /GCash balance/);
  assert.match(gcash, /Moved to UnionBank/);
  assert.doesNotMatch(gcash, /KDSEA000005/);
  const csv = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger?account=kd-unionbank&download=csv"), "Admin", true)).text();
  assert.match(csv, /UnionBank Balance PHP/);
  assert.match(csv, /2026-11-03,In,Transfer,,Moved from GCash,,,UnionBank,,10\.00,,28200\.00/);
  const all = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger"), "Admin", true)).text();
  assert.match(all, /Not tagged \(1\)/);

  const box = shipmentPaymentSection({ path: "/admin/shipments", csrf: "t", shipmentId: randomUUID(), canWrite: true, billing: { invoiceId: null, invoiceNumber: null, status: null, total: 1000, paid: 0, lastPaymentDate: null } });
  assert.match(box, /Bank Transfer \(UnionBank\)/);
  assert.doesNotMatch(box, /<option value="Cash"/);
});

test("Delivery paid to rider: saved once as an expense with the tracking number and the account it was paid from", async () => {
  const { db, sql, user } = database();
  const { recordDeliveryPayment, readDeliveryPayment, deliveryPaymentSection } = await import("../../lib/admin/delivery-payment");
  const { readLedger, walletBalances } = await import("../../lib/admin/money-ledger");
  const actor = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  const customerId = randomUUID();
  const shipmentId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(customerId, "KD-DL", "Delivery Tester", "+639170000012", "2026-10-01", "2026-10-01");
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(shipmentId, customerId, "KDAIR-900012", "Air Freight", "Guangzhou", 0, 1, "Delivered", 53000, 23100, "Paid", "2026-10-01", "2026-10-01");
  let box = deliveryPaymentSection({ path: "/admin/shipments", csrf: "t", shipmentId, trackingNumber: "KDAIR-900012", deliveryCharge: 23100, payment: null, canWrite: true });
  assert.match(box, /value="231\.00"/);
  assert.match(box, /delivery_paid/);
  const form = new URLSearchParams({ csrf: "t", action: "delivery_paid", id: shipmentId, expense_date: "2026-11-03", amount: "220.00", payee: "", paid_from: "GCash", reference_number: "LM-1" });
  await recordDeliveryPayment(db, form, actor);
  const expense = sql.prepare("SELECT * FROM expenses").get()!;
  assert.equal(expense.category, "Local Delivery / Trucking");
  assert.equal(expense.payee, "Lalamove");
  assert.equal(expense.description, "Delivery for KDAIR-900012");
  assert.equal(expense.tracking_number, "KDAIR-900012");
  assert.equal(expense.paid_from_account, "kd-gcash");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE action = 'delivery_paid'").get()!.n, 1);
  const paid = await readDeliveryPayment(db, "kdair-900012");
  assert.equal(paid!.amount, 22000);
  box = deliveryPaymentSection({ path: "/admin/shipments", csrf: "t", shipmentId, trackingNumber: "KDAIR-900012", deliveryCharge: 23100, payment: paid, canWrite: true });
  assert.match(box, /₱11\.00 extra kept/);
  await assert.rejects(recordDeliveryPayment(db, form, actor), /already marked paid/);
  await assert.rejects(recordDeliveryPayment(db, new URLSearchParams({ ...Object.fromEntries(form), paid_from: "Bitcoin" }), actor), /paid from/);
  const { byWallet } = walletBalances((await readLedger(db, "2026-11-30")).rows);
  assert.equal(byWallet["kd-gcash"], -22000, "the delivery comes out of GCash");
});

test("Money In & Out counts Ni Hao cost, transfer fees and delivery fees separately", async () => {
  const { db, sql } = database();
  const { moneyLedgerPage } = await import("../../lib/admin/money-ledger");
  const expense = sql.prepare("INSERT INTO expenses (id, expense_date, category, payee, description, amount, payment_method, tracking_number, paid_from_account, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  expense.run(randomUUID(), "2026-11-02", "Freight / Ni Hao Cost", "Ni Hao", "Ni Hao freight cost for KDAIR-1", 70000, "GCash", "KDAIR-1", "kd-gcash", "2026-11-02T01", "2026-11-02T01");
  expense.run(randomUUID(), "2026-11-02", "Bank / Payment Fees", "GCash", "Transfer fee: GCash to Ni Hao for KDAIR-1", 1000, "GCash", "KDAIR-1", "kd-gcash", "2026-11-02T02", "2026-11-02T02");
  expense.run(randomUUID(), "2026-11-02", "Local Delivery / Trucking", "Lalamove", "Delivery for KDAIR-1", 23100, "GCash", "KDAIR-1", "kd-gcash", "2026-11-02T03", "2026-11-02T03");
  expense.run(randomUUID(), "2026-11-02", "Website / Technology", "Host", "Hosting", 5000, "GCash", null, "kd-gcash", "2026-11-02T04", "2026-11-02T04");
  const html = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger"), "Admin", true)).text();
  // Em 2026-11-04: the 5 cost cards became one line under the Money out card.
  assert.match(html, /Money out<\/span><strong>₱991\.00<\/strong><small class="muted">Ni Hao ₱700\.00 · Fees ₱10\.00 · Delivery ₱231\.00 · Other ₱50\.00<\/small>/);
  assert.doesNotMatch(html, /In minus out/);
  assert.equal((html.match(/ledger-out-amt">₱/g) ?? []).length, 4, "each record is its own row");
});

test("Invoices list: KargoDoor charge, ₱30 transfer fee and delivery fee in their own columns, payment method, click a row to open", async () => {
  const { db, sql } = database();
  const { list } = await import("../../lib/admin/billing");
  const customerId = randomUUID();
  const shipmentId = randomUUID();
  const invoiceId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(customerId, "KD-IL", "Michaela Juan", "+639170000010", "2026-11-01", "2026-11-01");
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, transfer_fee_collected, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(shipmentId, customerId, "KDAIR-466471", "Air Freight", "Guangzhou", 0, 1, "Delivered", 53000, 23100, 3000, "Paid", "2026-11-01", "2026-11-01");
  sql.prepare("INSERT INTO invoices (id, invoice_number, customer_id, shipment_id, subtotal, delivery_charge, total, status, issued_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(invoiceId, "INV-TEST-1", customerId, shipmentId, 53000, 23100, 76100, "Paid", "2026-11-02", "2026-11-02", "2026-11-02");
  sql.prepare("INSERT INTO payments (id, invoice_id, customer_id, amount, payment_method, payment_date, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(randomUUID(), invoiceId, customerId, 76100, "GCash", "2026-11-02", "2026-11-02");
  const html = await (await list(db, { name: "Admin", role: "admin" }, new URL("http://x/admin/invoices"))).text();
  assert.match(html, /<th>Date<\/th><th>Invoice no\.<\/th><th>Name<\/th><th>Tracking no\.<\/th>/);
  assert.match(html, new RegExp(`data-href="/admin/invoices\\?id=${invoiceId}"`));
  assert.match(html, /₱500\.00<\/td>\s*<td class="inv-num">₱30\.00<\/td>\s*<td class="inv-num">₱231\.00<\/td>\s*<td class="inv-num"><strong>₱761\.00<\/strong><small class="muted">Paid<\/small>/);
  assert.match(html, /<td>GCash<\/td>/);
});

test("Costs paid before the opening cash count under Cash (owners), which goes negative; columns Date, Category, Customer / Payee, Description, Account", async () => {
  const { db, sql } = database();
  const { readLedger, walletBalances, walletBalancesSection, moneyLedgerPage } = await import("../../lib/admin/money-ledger");
  sql.prepare("INSERT INTO finance_cash_entries (id, entry_date, entry_type, amount, notes, bank_account, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(randomUUID(), "2026-10-16", "Opening Cash Balance", 2500000, "Opening", "kd-unionbank", "2026-10-16", "2026-10-16");
  const expense = sql.prepare("INSERT INTO expenses (id, expense_date, category, payee, description, amount, payment_method, paid_from_account, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  expense.run(randomUUID(), "2026-08-28", "Permits / Government Fees", "DTI", "DTI Registration", 203000, "GCash", null, "2026-08-28", "2026-08-28");
  expense.run(randomUUID(), "2026-09-16", "Marketing / Advertising", "Great Image", "Tarpaulin", 90000, "Cash", null, "2026-09-16", "2026-09-16");
  expense.run(randomUUID(), "2026-11-02", "Freight / Ni Hao Cost", "Ni Hao", "Ni Hao freight cost", 70000, "GCash", null, "2026-11-02", "2026-11-02");
  const { rows } = await readLedger(db, "2026-11-30");
  const { byWallet } = walletBalances(rows);
  assert.equal(byWallet.cash, -293000, "owners paid ₱2,930 before opening: KargoDoor owes them");
  assert.equal(byWallet["kd-gcash"], -70000, "only the KargoDoor GCash payment after opening");
  assert.equal(byWallet["kd-unionbank"], 2500000);
  const cards = await walletBalancesSection(db);
  assert.match(cards, /-₱2,930\.00|₱-2,930\.00|\(₱2,930\.00\)|−₱2,930\.00/);
  assert.match(cards, /Pay it back from UnionBank/);
  const gcashTab = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger?account=kd-gcash"), "Admin", true)).text();
  assert.doesNotMatch(gcashTab, /DTI Registration|Tarpaulin/);
  const cashTab = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger?account=cash"), "Admin", true)).text();
  assert.match(cashTab, /DTI Registration/);
  assert.match(cashTab, /<th>Date<\/th><th>Category<\/th><th>Customer \/ Payee<\/th><th>Description<\/th><th>Account<\/th>/);
  assert.match(cashTab, /data-href="\/admin\/finance\/expenses\?edit=/);
});

test("Money In & Out profit card: customer payments minus Ni Hao, transfer fees and delivery; owner money left out", async () => {
  const { shipmentProfit } = await import("../../lib/admin/money-ledger");
  const row = (direction: "in" | "out", type: string, amount: number, link: string, transfer = false) =>
    ({ date: "2026-11-01", created: "", direction, type, who: "", details: "", tracking: "", method: "", account: "", reference: "", amount, link, wallet: "kd-unionbank" as const, balance: null, walletBalance: null, transfer });
  const result = shipmentProfit([
    row("in", "Customer payment", 3076600, "/admin/invoices?id=1"),
    row("in", "Opening Cash Balance", 2500000, "/admin/finance/cash"),
    row("in", "Owner Contribution", 100000, "/admin/finance/cash"),
    row("out", "Freight / Ni Hao Cost", 2706500, "/admin/finance/expenses?edit=1"),
    row("out", "Bank / Payment Fees", 2000, "/admin/finance/expenses?edit=2"),
    row("out", "Local Delivery / Trucking", 23100, "/admin/finance/expenses?edit=3"),
    row("out", "Permits / Government Fees", 1211380, "/admin/finance/expenses?edit=4"),
    row("out", "Transfer", 50000, "/admin/finance/expenses#gcash-transfer", true),
  ]);
  assert.equal(result.customerPayments, 3076600);
  assert.equal(result.profit, 3076600 - 2706500 - 2000 - 23100);
  assert.equal(result.otherCosts, 1211380);
});

test("Partner split: 60/40, 50/50, friend 10% on the first 3 shipments, 12-month bonus ends", async () => {
  const { sharesFor, bonusEndDate } = await import("../../lib/admin/partner-split");
  const pct = (s: { ae: number; pk: number; referrer: number }) => [Math.round(s.ae * 100), Math.round(s.pk * 100), Math.round(s.referrer * 100)];
  assert.deepEqual(pct(sharesFor("ae", 1, "2026-11-04", "2026-11-01")), [60, 40, 0]);
  assert.deepEqual(pct(sharesFor("pk", 5, "2026-11-04", "2026-11-01")), [40, 60, 0]);
  assert.deepEqual(pct(sharesFor("company", 1, "2026-11-04", "2026-11-01")), [50, 50, 0]);
  assert.deepEqual(pct(sharesFor("ref_ae", 1, "2026-11-04", "2026-11-01")), [54, 36, 10]);
  assert.deepEqual(pct(sharesFor("ref_pk", 3, "2026-11-04", "2026-11-01")), [36, 54, 10]);
  assert.deepEqual(pct(sharesFor("ref_company", 2, "2026-11-04", "2026-11-01")), [45, 45, 10]);
  assert.deepEqual(pct(sharesFor("ref_ae", 4, "2026-11-04", "2026-11-01")), [60, 40, 0], "no friend share from the 4th shipment");
  assert.deepEqual(pct(sharesFor("ae", 9, "2027-11-01", "2026-11-01")), [50, 50, 0], "back to 50/50 after 12 months");
  assert.deepEqual(pct(sharesFor("ae", 9, "2027-10-31", "2026-11-01")), [60, 40, 0]);
  assert.equal(bonusEndDate("2028-02-29"), "2029-02-28");
});

test("Referral commission: owed only after the customer and Ni Hao are paid, Paid saves one Referral Commission expense", async () => {
  const { db, sql, user } = database();
  const { readSplitShipments, readReferralsToPay, recordReferralPayment, clientSourceSection } = await import("../../lib/admin/partner-split");
  const { moneyLedgerPage } = await import("../../lib/admin/money-ledger");
  const actor = { id: user, name: "Admin", email: "admin@example.test", role: "admin" as const };
  const customerId = randomUUID();
  sql.prepare("INSERT INTO customers (id, customer_code, full_name, mobile, client_source, referral_code, referrer_name, referrer_pay_to, client_since, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(customerId, "KDOOR-7001", "Referred Client", "+639170000071", "ref_ae", "REF-MARIA", "Maria Santos", "GCash 0918 123 4567", "2026-11-01", "2026-11-01", "2026-11-01");
  const shipments = ["KDSEA-700001", "KDSEA-700002", "KDSEA-700003", "KDSEA-700004"].map((tracking, i) => {
    const id = randomUUID();
    sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, customerId, tracking, "Sea Freight", "Guangzhou", 1, 1, "Delivered", 500000, 0, i === 1 ? "Unpaid" : "Paid", `2026-11-0${i + 1}`, `2026-11-0${i + 1}`);
    const invoiceId = randomUUID();
    sql.prepare("INSERT INTO invoices (id, invoice_number, customer_id, shipment_id, subtotal, delivery_charge, total, status, created_at, updated_at, other_charge) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(invoiceId, `INV-70${i}`, customerId, id, 500000, 0, 500000, i === 1 ? "Unpaid" : "Paid", "2026-11-02", "2026-11-02", 0);
    if (i !== 1) sql.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?,?,?)").run(randomUUID(), invoiceId, customerId, 500000, "GCash", null, "2026-11-02", null, "2026-11-02");
    // Ni Hao paid for all but the 3rd shipment.
    if (i !== 2) sql.prepare(`INSERT INTO expenses (id, category, description, amount, expense_date, created_at, updated_at, tracking_number) VALUES (?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), "Freight / Ni Hao Cost", `Ni Hao for ${tracking}`, 200000, "2026-11-02", "2026-11-02", "2026-11-02", tracking);
    return id;
  });
  const rows = (await readSplitShipments(db, customerId)).sort((a, b) => a.number - b.number);
  assert.deepEqual(rows.map((r) => r.commissionStatus), ["owed", "waiting-customer", "waiting-nihao", "none"]);
  assert.equal(rows[0].profit, 300000);
  assert.equal(rows[0].commission, 30000);
  assert.equal(rows[0].ae, 162000, "54% of ₱3,000");
  assert.equal(rows[0].pk, 108000, "36% of ₱3,000");
  assert.equal(rows[3].ae, 180000, "4th shipment: 60%");
  assert.equal((await readReferralsToPay(db)).length, 1);

  await assert.rejects(recordReferralPayment(db, new URLSearchParams({ csrf: "t", action: "referral_paid", customer_id: customerId, shipment_id: shipments[1], paid_from: "GCash" }), actor), /not ready to pay/);
  const form = new URLSearchParams({ csrf: "t", action: "referral_paid", customer_id: customerId, shipment_id: shipments[0], paid_from: "GCash" });
  await recordReferralPayment(db, form, actor);
  const expense = sql.prepare("SELECT * FROM expenses WHERE category = 'Referral Commission'").get()!;
  assert.equal(expense.amount, 30000);
  assert.equal(expense.payee, "Maria Santos");
  assert.equal(expense.tracking_number, "KDSEA-700001");
  assert.equal(expense.paid_from_account, "kd-gcash");
  await assert.rejects(recordReferralPayment(db, form, actor), /already paid/);
  assert.equal((await readReferralsToPay(db)).length, 0);

  const customer = sql.prepare("SELECT * FROM customers WHERE id = ?").get(customerId) as Record<string, unknown>;
  const section = await clientSourceSection(db, customer, { path: "/admin/customers", csrf: "t", canWrite: true });
  assert.match(section, /Referral to Archie &amp; Em/);
  assert.match(section, /REF-MARIA/);
  assert.match(section, /Waiting for customer payment/);
  assert.doesNotMatch(section, /KDSEA-700004/, "no commission row from the 4th shipment");

  const split = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger?view=split"), "Admin", true)).text();
  assert.match(split, /Partner split/);
  // ₱300 paid + ₱500 still waiting on the 3rd shipment (Ni Hao not paid yet, so its profit is ₱5,000 for now).
  assert.match(split, /Referrers<\/span><strong>₱800\.00/);
  const ledger = await (await moneyLedgerPage(db, new URL("http://x/admin/finance/ledger"), "Admin", true)).text();
  assert.match(ledger, /Referrals ₱300\.00/);
});

test("Ni Hao quote request fills from the quotation and leaves unknowns blank", () => {
  assert.deepEqual(nihaoQuoteLines("Sea Freight", { description: "Office chairs", length: 60, width: 60, height: 110, measurementUnit: "cm", packageQuantity: 4, cbm: 1.584, weight: 180 }), [
    "Sea or Air: Sea", "Item: Office chairs", "Item Picture:", "Dimensions: 60 x 60 x 110 cm (4 packages)", "Declared Total CBM: 1.584", "Declared Weight: 180 kg",
  ]);
  assert.deepEqual(nihaoQuoteLines("Air Freight", { description: "Phone cases" }), ["Sea or Air: Air", "Item: Phone cases", "Item Picture:", "Dimensions:", "Declared Total CBM:", "Declared Weight:"]);
  assert.equal(nihaoQuoteLines("Full Container", { containerSize: "40 ft HQ" })[0], "Sea or Air: Sea (FCL, 40 ft HQ)");
});
