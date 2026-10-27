import type { D1Database } from "@cloudflare/workers-types";
import { itemCategories } from "../../lib/admin/quotation-pricing";
import { calculateCbmConversion, calculateTotalCbm } from "../../lib/admin/quotation-cbm";
import { calculateDensity, densityStatus, densityThreshold } from "../../lib/admin/quotation-density";
import { calculateAdminAirQuote, calculateAdminSeaQuote } from "../../lib/admin/quotation-calculation";
import { isQuotationNumeric } from "../../lib/admin/quotations";
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
} from "../../lib/admin/validation";
import { marginSummarySql, finance, activity, dashboard, saveStaffFollowUp } from "../../lib/admin/reports";
import { saveRecord } from "../../lib/admin/data";
import { createShipmentFromApprovedQuotation } from "../../lib/admin/quotation-shipment";
import { shipmentNiHaoEstimate } from "../../lib/admin/nihao-estimate";
import { syncVerifiedFreightToInvoice, verifiedShipmentFreight } from "../../lib/admin/shipment-verified-pricing";
import { shipmentCargo } from "../../lib/admin/shipment-cargo";
import { archiveInvoice, createInvoice, issueInvoice, recordPayment, voidInvoice } from "../../lib/admin/billing";
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
} from "../../lib/admin/security";
import { expensesPage, saveExpense, mutateExpense } from "../../lib/admin/expenses";
import { customerShippingInstructions, customerWarehouseAddressMessage, shipmentShippingInstructions, warehouseAddress } from "../../lib/admin/shipping-instructions";
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
  const customerMessage = customerShippingInstructions({ name: "Maria", customerCode: "KD-10025", warehouse: "Guangzhou" });
  assert.match(customerMessage, /Hi Maria/);
  assert.match(customerMessage, /Account\/Cargo Code: KD-10025/);
  assert.match(customerMessage, /place KD-10025 clearly on every package/);
  assert.match(customerMessage, /广州市白云区江高镇沙溪东路18号166通达仓库/);
  assert.match(customerMessage, /发货前注意重要事项/);
  assert.match(customerMessage, /IMPORTANT REMINDERS BEFORE SHIPPING/);
  assert.ok(customerMessage.includes("Customer Cargo Code: KDOOR-XXXX"));
  assert.match(customerMessage, /will NOT accept packages with incomplete labels/);

  const addressMessage = customerWarehouseAddressMessage({ name: "Maria", customerCode: "KD-10025", warehouse: "Yiwu" });
  assert.match(addressMessage, /Hi Maria/);
  assert.match(addressMessage, /Account\/Cargo Code: KD-10025/);
  assert.ok(addressMessage.includes(warehouseAddress("Yiwu")));
  assert.doesNotMatch(addressMessage, /发货前注意重要事项/);
  assert.match(customerWarehouseAddressMessage({ name: "Maria", warehouse: "Hong Kong" }), /\[Add warehouse address\]/);

  const shipmentMessage = shipmentShippingInstructions({
    name: "Maria",
    customerCode: "KD-10025",
    warehouse: "Guangzhou",
    supplierCourier: "SF Express",
    supplierWaybill: "SF123456",
  });
  assert.match(shipmentMessage, /Assigned Warehouse: Guangzhou/);
  assert.match(shipmentMessage, /广州市白云区江高镇沙溪东路18号166通达仓库/);
  assert.match(shipmentMessage, /Courier: SF Express/);
  assert.match(shipmentMessage, /Tracking\/Waybill number: SF123456/);
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
  assert.equal(ordinary.final, 8500);
  const actualWeight = calculateAdminAirQuote({ freightType: "Air Freight", item: "Ordinary Items", cbm: "0.01", weight: "20.1", quantity: "1" });
  assert.equal(actualWeight.billableWeight, 21);
  assert.equal(calculateAdminAirQuote({ freightType: "Air Freight", item: "Liquid, Powder, Food, Computer Parts, Electronics", cbm: "0.01", weight: "1", quantity: "1" }).rate, 600);
  assert.equal(calculateAdminAirQuote({ freightType: "Air Freight", item: "Medicine and Food Supplements", cbm: "0.01", weight: "1", quantity: "1" }).rate, 650);
  for (const [item, rate] of [["Mobile Phones", 950], ["Tablets", 1200], ["Laptop Computers", 2800]] as const) {
    const result = calculateAdminAirQuote({ freightType: "Air Freight", item, cbm: "0", weight: "0", quantity: "2" });
    assert.equal(result.rateBasis, "Per piece");
    assert.equal(result.final, rate * 2);
  }
});
test("live admin Sea calculation delegates to the authoritative pricing engine", () => {
  const solar = calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Solar panels", cbm: "8.38593", weight: "3400", units: "0" });
  assert.equal(solar.category, "COMMODITIES");
  assert.equal(solar.cbmRate, 9500);
  assert.equal(solar.packageTier, "KD Standard");
  assert.equal(solar.densityApplies, false);
  assert.equal(solar.final.toFixed(2), "79666.34");
  const denseSolar = calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Solar panels", cbm: "0.126", weight: "1000", units: "0" });
  assert.equal(denseSolar.category, "COMMODITIES");
  assert.equal(denseSolar.packageTier, "KD Max");
  assert.equal(denseSolar.densityApplies, true);
  assert.equal(denseSolar.base, 1700);
  assert.equal(denseSolar.densityCharge, 22000);
  assert.equal(denseSolar.final, 22000);
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "0.01", weight: "1", units: "0" }).packageTier, "KD Mini");
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "0.05", weight: "1", units: "0" }).packageTier, "KD Lite");
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "0.125", weight: "1", units: "0" }).packageTier, "KD Plus");
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "1", weight: "425", units: "0" }).densityApplies, false);
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "1", weight: "500", units: "0" }).packageTier, "KD Max");
  assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item: "Bags", cbm: "0.01", weight: "100", units: "0" }).packageTier, "KD Max");
  for (const item of ["Mobile phones", "Computers", "Tablets"])
    assert.equal(calculateAdminSeaQuote({ freightType: "Sea Freight", item, cbm: "1", weight: "1", units: "1" }).final, 10750);
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
test("shipments get a Ni Hao cost estimate from the Ni Hao rates unless Ni Hao's actual cost is known", async () => {
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
test("shipments added by hand use their own item, category and pieces for display, Ni Hao estimate and verified freight", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", { ...customer, customer_code: "KD-MANUAL", email: "manual@example.test" }, user, "", "");
  const { tracking_number: _t, cargo_code: _c, ...formInput } = shipmentInput(customerId);
  const form = (values: Record<string, string>) => parseForm("shipments", new URLSearchParams(Object.entries({ ...formInput, ...values })));

  assert.throws(() => form({ cargo_category: "Mobile Phones" }), /Sea Freight category/);
  assert.throws(() => form({ service_type: "Air Freight", status: "In Transit", cargo_category: "COMMODITIES" }), /Air Freight item type/);
  assert.throws(() => form({ cargo_quantity: "0" }));

  const seaValues = form({ cargo_item: "LED lights", cargo_category: "COMMODITIES" });
  assert.deepEqual([seaValues.cargo_item, seaValues.cargo_category, seaValues.cargo_quantity], ["LED lights", "COMMODITIES", null]);
  const seaId = await saveRecord(db, "shipments", seaValues, user, "", "");
  assert.deepEqual({ ...(await shipmentCargo(db, seaId)) }, { item: "LED lights", category: "Commodities", quotationId: null, quotationNumber: null });
  const seaEstimate = await shipmentNiHaoEstimate(db, seaId, { ...seaValues });
  assert.equal(seaEstimate?.cost, 1062500, "1.25 CBM of Commodities × ₱8,500");
  assert.equal((await shipmentNiHaoEstimate(db, "", { service_type: "Sea Freight", cbm: 1, weight_kg: 100, cargo_item: "Bags" }))?.cost, 700000, "the category is looked up from a catalog item name when none is picked");
  const seaVerified = await verifiedShipmentFreight(db, seaId, 1, 300);
  assert.equal(seaVerified?.shippingCharge, 950000, "picked category recalculates the KargoDoor charge from the verified size");

  const airValues = form({ service_type: "Air Freight", status: "In Transit", cargo_item: "Phones", cargo_category: "Mobile Phones", cargo_quantity: "3" });
  const airId = await saveRecord(db, "shipments", airValues, user, "", "");
  assert.equal((await shipmentNiHaoEstimate(db, airId, { ...airValues }))?.cost, 240000, "3 pcs × ₱800");
  assert.equal((await verifiedShipmentFreight(db, airId, 0.01, 1))?.shippingCharge, 285000, "3 pcs × ₱950");
  assert.equal((await verifiedShipmentFreight(db, airId, 0.01, 1, { ...airValues, cargo_quantity: 2 }))?.shippingCharge, 190000, "values being saved win over the stored ones");

  const legacyId = randomUUID();
  sql.prepare("INSERT INTO shipments (id, customer_id, tracking_number, service_type, china_warehouse, cbm, weight_kg, status, tracking_remarks, shipping_charge, delivery_charge, payment_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(legacyId, customerId, "KDAIR-100001", "Air Freight", "Guangzhou", 0.0381, 7.5, "In Transit", "Item: Ordinary Items\nPacked in 2 boxes", 300000, 0, "Unpaid", "2026-10-01", "2026-10-01");
  const migration = readFileSync("migrations/admin/0030_manual_shipment_cargo.sql", "utf8");
  sql.exec(migration.slice(migration.indexOf("UPDATE shipments")));
  assert.equal(sql.prepare("SELECT cargo_item FROM shipments WHERE id = ?").get(legacyId)!.cargo_item, "Ordinary Items", "migration copies the Item line");
  assert.equal(sql.prepare("SELECT cargo_item FROM shipments WHERE id = ?").get(seaId)!.cargo_item, "LED lights");
  assert.equal((await shipmentNiHaoEstimate(db, legacyId, { service_type: "Air Freight", cbm: 0.0381, weight_kg: 7.5 }))?.cost, 280000);
  assert.equal(await verifiedShipmentFreight(db, legacyId, 0.0381, 7.5), null, "older hand-added shipments without a picked category keep their typed charge");
});
test("verified warehouse measurements recalculate Sea and Air freight and refresh only eligible invoices", async () => {
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
  assert.deepEqual(sea, { shippingCharge: 950000, pricingMethod: "Density-Based" });
  await syncVerifiedFreightToInvoice(db, seaShipment.shipmentId, sea!.shippingCharge, user);
  const verifiedInvoice = sql.prepare("SELECT subtotal,total FROM invoices WHERE id=?").get(seaInvoice)!;
  assert.equal(verifiedInvoice.subtotal, 950000);
  assert.equal(verifiedInvoice.total, 960000);

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
    shippingCharge: 100000,
    pricingMethod: "CEILING(MAX(Declared Weight, CBM × 167)) × rate",
  });

  sql.prepare("UPDATE invoices SET status='Paid' WHERE id=?").run(seaInvoice);
  await syncVerifiedFreightToInvoice(db, seaShipment.shipmentId, 123400, user);
  const paidInvoice = sql.prepare("SELECT subtotal,total FROM invoices WHERE id=?").get(seaInvoice)!;
  assert.equal(paidInvoice.subtotal, 950000);
  assert.equal(paidInvoice.total, 960000);
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
test("an approved bulk furniture quotation creates one trackable shipment per package and keeps invoices separate", async () => {
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
  assert.match(html, /No staff communication has been added yet/);
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
  assert.match(html, /New Leads/);
  assert.match(html, /<h2>Money<\/h2>/);
  assert.match(html, /Money we have now/);
  assert.match(html, /Overall profit after expenses/);
  assert.match(html, /1 invoice not fully paid · ₱750\.00/);
  assert.match(html, /1 is past the due date/);
  assert.match(html, /Recent Invoices &amp; Payments/);
  assert.doesNotMatch(html, /Finance Overview/);
  assert.doesNotMatch(html, /<h2>Expenses<\/h2>/);
  assert.doesNotMatch(html, /href="\/admin\/finance\/expenses\?new=1"/);
  assert.match(html, new RegExp(`/admin/invoices\\?id=${invoiceId}`));
  assert.match(html, new RegExp(`/admin/shipments\\?id=${shipmentId}`));
  sql.prepare("UPDATE shipments SET archived_at='2026-09-09T00:00:00.000Z' WHERE id=?").run(shipmentId);
  html = await (await dashboard(db, admin, "csrf", true)).text();
  assert.match(html, /<span>Active Shipments<\/span>\s*<strong>0<\/strong>/);
  assert.ok(!html.includes(`/admin/shipments?id=${shipmentId}`));
  await saveStaffFollowUp(db, "Call customer\nConfirm delivery", admin);
  await saveStaffFollowUp(db, "Updated priority", admin);
  await assert.rejects(saveStaffFollowUp(db, "x".repeat(4001), admin), /4,000/);
  assert.equal(sql.prepare("SELECT note FROM staff_follow_up WHERE id=1").get()!.note, "Updated priority");
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE entity_type='staff_follow_up'").get()!.n, 2);
  html = await (await dashboard(db, { ...admin, role: "viewer" }, "csrf", false)).text();
  assert.match(html, /Updated priority/);
  assert.ok(!html.includes("Save follow-up"));
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

test("draft invoices require issuing and reject invalid charges, dates and overpayments", async () => {
  const { sql, db, user } = database();
  const customerId = await saveRecord(db, "customers", customer, user, "", "");
  const shipmentId = await saveRecord(db, "shipments", shipment(customerId), user, "", "");
  const invoiceId = await createInvoice(db, { shipment_id: shipmentId, delivery_charge: "0", other_charge: "0", status: "Draft", issued_at: "", due_at: "" }, user);
  await assert.rejects(recordPayment(db, { invoice_id: invoiceId, amount: "1", payment_method: "Cash", reference_number: "", payment_date: "2026-09-07", notes: "" }, user), /Issue/);
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
    "Professional Fees", "Utilities", "Bank / Payment Fees", "Repairs / Maintenance",
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
    for (const [i, row] of seed.entries()) assert.equal(html.includes(`<td>${row.description}</td>`), expected.includes(i), query);
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
