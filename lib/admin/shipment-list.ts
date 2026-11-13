import type { D1Database } from "@cloudflare/workers-types";

import { niHaoExpenseCategory } from "./nihao-payment";
import { cargoItemSql } from "./shipment-cargo";
import { inClause, pickMany, pickSort, type CheckOption, type SortOption } from "./list-sort";
import { legacyShipmentStatuses, seaFreightStatuses, statuses, warehouses } from "./validation";

// Shipments list and Shipments CSV share these filters and sorts, so
// "Export these shipments" downloads exactly what the list shows.

const missing = (column: string) => `NULLIF(${column}, '') IS NULL`;

// Stage order: Air Transit sits where Sea Transit does; old statuses last.
const statusRank = `CASE s.status ${[
  ...seaFreightStatuses.map((value, index) => [value, index] as const),
  ["Air Transit", seaFreightStatuses.indexOf("Sea Transit")] as const,
  ...legacyShipmentStatuses.map((value, index) => [value, seaFreightStatuses.length + index] as const),
].map(([value, rank]) => `WHEN '${value.replaceAll("'", "''")}' THEN ${rank}`).join(" ")} ELSE 99 END`;

export const shipmentSorts: readonly SortOption[] = [
  { value: "newest", label: "Newest added", sql: "s.created_at DESC, s.id" },
  { value: "oldest", label: "Oldest added", sql: "s.created_at ASC, s.id" },
  { value: "ch-newest", label: "CH received (newest)", sql: `${missing("s.warehouse_received_date")}, s.warehouse_received_date DESC, s.created_at DESC, s.id` },
  { value: "ch-oldest", label: "CH received (oldest)", sql: `${missing("s.warehouse_received_date")}, s.warehouse_received_date ASC, s.created_at DESC, s.id` },
  { value: "ph-newest", label: "PH received (newest)", sql: `${missing("s.actual_arrival")}, s.actual_arrival DESC, s.created_at DESC, s.id` },
  { value: "ph-oldest", label: "PH received (oldest)", sql: `${missing("s.actual_arrival")}, s.actual_arrival ASC, s.created_at DESC, s.id` },
  { value: "status", label: "Status (by stage)", sql: `${statusRank}, s.created_at DESC, s.id` },
  { value: "mark", label: "Shipping mark (A–Z)", sql: "c.customer_code COLLATE NOCASE, s.created_at DESC, s.id" },
  { value: "customer", label: "Customer name (A–Z)", sql: "c.full_name COLLATE NOCASE, s.created_at DESC, s.id" },
  { value: "tracking", label: "Tracking no. (A–Z)", sql: "s.tracking_number COLLATE NOCASE, s.id" },
  { value: "cbm", label: "CBM (biggest first)", sql: "s.cbm DESC, s.created_at DESC, s.id" },
  { value: "weight", label: "Weight (heaviest first)", sql: "s.weight_kg DESC, s.created_at DESC, s.id" },
];

export const shipmentServiceTypes = ["Sea Freight", "Air Freight", "FCL"] as const;
export const shipmentPaymentStatuses = ["Unpaid", "Partial", "Paid"] as const;
export const niHaoPaymentFilters = [["Paid", "Ni Hao paid"], ["Unpaid", "Ni Hao not paid yet"]] as const satisfies readonly CheckOption[];

const niHaoPaidSql = `EXISTS (
  SELECT 1 FROM expenses e
  WHERE e.category = '${niHaoExpenseCategory}'
    AND e.tracking_number = s.tracking_number COLLATE NOCASE
)`;

export type ShipmentFilters = {
  q: string;
  status: string[];
  customer: string;
  service: string[];
  warehouse: string[];
  payment: string[];
  nihao: string[];
  sort: SortOption;
};

/**
 * Tick-box filters. The list starts with every status ticked except
 * Cancelled (as before); the plain export from Import / Export starts with
 * everything ticked.
 */
export function readShipmentFilters(params: URLSearchParams, hideCancelled = true): ShipmentFilters {
  return {
    q: (params.get("q") ?? "").trim().slice(0, 160),
    status: pickMany(params, "status", statuses, hideCancelled ? statuses.filter((value) => value !== "Cancelled") : statuses),
    customer: (params.get("customer_id") ?? "").trim().slice(0, 80),
    service: pickMany(params, "service", shipmentServiceTypes),
    warehouse: pickMany(params, "warehouse", warehouses),
    payment: pickMany(params, "payment", shipmentPaymentStatuses),
    nihao: pickMany(params, "nihao", niHaoPaymentFilters),
    sort: pickSort(shipmentSorts, params.get("sort")),
  };
}

/** WHERE clause (after "WHERE s.archived_at IS NULL") and its bindings. */
export function shipmentWhere(filters: ShipmentFilters) {
  const parts: string[] = [];
  const bindings: unknown[] = [];
  if (filters.q) {
    parts.push(`(instr(lower(s.tracking_number), lower(?)) > 0
      OR instr(lower(COALESCE(s.cargo_code, '')), lower(?)) > 0
      OR instr(lower(c.full_name), lower(?)) > 0
      OR instr(lower(c.customer_code), lower(?)) > 0)`);
    bindings.push(filters.q, filters.q, filters.q, filters.q);
  }
  if (filters.customer) { parts.push("s.customer_id = ?"); bindings.push(filters.customer); }
  for (const clause of [
    inClause("s.status", filters.status, statuses),
    inClause("s.service_type", filters.service, shipmentServiceTypes),
    inClause("s.china_warehouse", filters.warehouse, warehouses),
    inClause("s.payment_status", filters.payment, shipmentPaymentStatuses),
  ]) {
    if (clause.sql) { parts.push(clause.sql); bindings.push(...clause.bindings); }
  }
  if (filters.nihao.length === 0) parts.push("0");
  else if (filters.nihao.length === 1) parts.push(filters.nihao[0] === "Paid" ? niHaoPaidSql : `NOT ${niHaoPaidSql}`);
  return { sql: parts.map((part) => `AND ${part}`).join("\n"), bindings };
}

export const niHaoPaymentSql = `CASE WHEN ${niHaoPaidSql} THEN 'Paid' ELSE 'Unpaid' END`;

// Columns exactly as Em's shipments Google Sheet (2026-11-13, second
// screenshot). Courier and Waybill Number are the supplier courier and
// supplier waybill number from Edit shipment.
export const shipmentCsvColumns = [
  "Shipping Mark", "Item", "Service Type", "Origin Warehouse", "CH Received", "Courier",
  "Waybill Number", "CBM", "Weight KG", "Status", "NIHAO Ship Cost", "PH Received",
] as const;

// Whole pesos like the sheet (25415), centavos only when there are some.
const php = (centavos: unknown) => centavos === null || centavos === undefined || centavos === "" ? "" : String(Math.round(Number(centavos)) / 100);

export async function shipmentCsvRows(db: D1Database, params: URLSearchParams) {
  // From the Shipments page: same rows as the list. From Import / Export:
  // every shipment that is not archived, oldest first like the sheet.
  const fromList = params.get("scope") === "list";
  const filters = readShipmentFilters(params, fromList);
  const where = shipmentWhere(filters);
  const order = fromList || params.get("sort") ? filters.sort.sql : "s.created_at ASC, s.id";
  const records = (await db.prepare(`SELECT
      c.customer_code, ${cargoItemSql} AS cargo_item, s.service_type, s.china_warehouse,
      s.warehouse_received_date, s.supplier_courier, s.supplier_waybill_number,
      s.cbm, s.weight_kg, s.status, s.nihao_cost, s.actual_arrival
    FROM shipments s
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN quotations q ON q.id = s.source_quotation_id
    WHERE s.archived_at IS NULL
    ${where.sql}
    ORDER BY ${order}`).bind(...where.bindings).all<Record<string, unknown>>()).results;
  return records.map((record) => ({
    "Shipping Mark": record.customer_code,
    Item: record.cargo_item,
    "Service Type": record.service_type,
    "Origin Warehouse": record.china_warehouse,
    "CH Received": record.warehouse_received_date,
    Courier: record.supplier_courier,
    "Waybill Number": record.supplier_waybill_number,
    CBM: record.cbm,
    "Weight KG": record.weight_kg,
    Status: record.status,
    "NIHAO Ship Cost": php(record.nihao_cost),
    "PH Received": record.actual_arrival,
  }));
}

/** Query string for "Export these shipments": the list's filters and sort. */
export function shipmentExportQuery(params: URLSearchParams) {
  const out = new URLSearchParams({ download: "shipments", scope: "list" });
  for (const key of ["filtered", "q", "status", "customer_id", "service", "warehouse", "payment", "nihao", "sort"]) {
    for (const value of params.getAll(key)) if (value.trim()) out.append(key, value.trim());
  }
  return out.toString();
}
