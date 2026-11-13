import type { D1Database } from "@cloudflare/workers-types";

import { niHaoExpenseCategory } from "./nihao-payment";
import { cargoItemSql } from "./shipment-cargo";
import { pickFilter, pickSort, type SortOption } from "./list-sort";
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
export const niHaoPaymentFilters = [["Paid", "Ni Hao paid"], ["Unpaid", "Ni Hao not paid yet"]] as const;

const niHaoPaidSql = `EXISTS (
  SELECT 1 FROM expenses e
  WHERE e.category = '${niHaoExpenseCategory}'
    AND e.tracking_number = s.tracking_number COLLATE NOCASE
)`;

export type ShipmentFilters = {
  q: string;
  status: string;
  customer: string;
  service: string;
  warehouse: string;
  payment: string;
  nihao: string;
  sort: SortOption;
};

export function readShipmentFilters(params: URLSearchParams): ShipmentFilters {
  return {
    q: (params.get("q") ?? "").trim().slice(0, 160),
    status: pickFilter(statuses, params.get("status")),
    customer: (params.get("customer_id") ?? "").trim().slice(0, 80),
    service: pickFilter(shipmentServiceTypes, params.get("service")),
    warehouse: pickFilter(warehouses, params.get("warehouse")),
    payment: pickFilter(shipmentPaymentStatuses, params.get("payment")),
    nihao: pickFilter(niHaoPaymentFilters.map(([value]) => value), params.get("nihao")),
    sort: pickSort(shipmentSorts, params.get("sort")),
  };
}

/**
 * WHERE clause (after "WHERE s.archived_at IS NULL") and its bindings.
 * With no status chosen the list hides Cancelled; the plain export keeps them.
 */
export function shipmentWhere(filters: ShipmentFilters, hideCancelled: boolean) {
  const parts: string[] = [];
  const bindings: unknown[] = [];
  if (filters.q) {
    parts.push(`(instr(lower(s.tracking_number), lower(?)) > 0
      OR instr(lower(COALESCE(s.cargo_code, '')), lower(?)) > 0
      OR instr(lower(c.full_name), lower(?)) > 0
      OR instr(lower(c.customer_code), lower(?)) > 0)`);
    bindings.push(filters.q, filters.q, filters.q, filters.q);
  }
  if (filters.status) {
    parts.push("s.status = ?");
    bindings.push(filters.status);
  } else if (hideCancelled) {
    parts.push("s.status != 'Cancelled'");
  }
  if (filters.customer) { parts.push("s.customer_id = ?"); bindings.push(filters.customer); }
  if (filters.service) { parts.push("s.service_type = ?"); bindings.push(filters.service); }
  if (filters.warehouse) { parts.push("s.china_warehouse = ?"); bindings.push(filters.warehouse); }
  if (filters.payment) { parts.push("s.payment_status = ?"); bindings.push(filters.payment); }
  if (filters.nihao) parts.push(filters.nihao === "Paid" ? niHaoPaidSql : `NOT ${niHaoPaidSql}`);
  return { sql: parts.map((part) => `AND ${part}`).join("\n"), bindings };
}

export const niHaoPaymentSql = `CASE WHEN ${niHaoPaidSql} THEN 'Paid' ELSE 'Unpaid' END`;

// Columns in the order of Em's shipments Google Sheet (2026-11-13), then the
// extra columns the old export had, so nothing is lost.
export const shipmentCsvColumns = [
  "Shipping Mark", "Item", "Service Type", "Origin Warehouse", "CH Received", "PH Received",
  "CBM", "Weight KG", "Status", "Actual Arrival", "NIHAO Ship Cost",
  "Tracking Number", "Customer Name", "KargoDoor Freight Charge", "Delivery Charge",
  "Payment Status", "Ni Hao Payment", "Tracking Remarks", "Created", "Updated",
] as const;

const php = (centavos: unknown) => centavos === null || centavos === undefined || centavos === "" ? "" : (Number(centavos) / 100).toFixed(2);

export async function shipmentCsvRows(db: D1Database, params: URLSearchParams) {
  const filters = readShipmentFilters(params);
  // From the Shipments page: same rows as the list. From Import / Export:
  // every shipment that is not archived, oldest first like the sheet.
  const fromList = params.get("scope") === "list";
  const where = shipmentWhere(filters, fromList);
  const order = fromList || params.get("sort") ? filters.sort.sql : "s.created_at ASC, s.id";
  const records = (await db.prepare(`SELECT
      c.customer_code, c.full_name, ${cargoItemSql} AS cargo_item,
      s.tracking_number, s.service_type, s.china_warehouse, s.warehouse_received_date,
      s.actual_arrival, s.delivered_date, s.cbm, s.weight_kg, s.status, s.nihao_cost,
      s.shipping_charge, s.delivery_charge, s.payment_status, ${niHaoPaymentSql} AS nihao_payment,
      s.tracking_remarks, s.created_at, s.updated_at
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
    "PH Received": record.actual_arrival,
    CBM: record.cbm,
    "Weight KG": record.weight_kg,
    Status: record.status,
    "Actual Arrival": record.delivered_date,
    "NIHAO Ship Cost": php(record.nihao_cost),
    "Tracking Number": record.tracking_number,
    "Customer Name": record.full_name,
    "KargoDoor Freight Charge": php(record.shipping_charge),
    "Delivery Charge": php(record.delivery_charge),
    "Payment Status": record.payment_status,
    "Ni Hao Payment": record.nihao_payment,
    "Tracking Remarks": record.tracking_remarks,
    Created: record.created_at,
    Updated: record.updated_at,
  }));
}

/** Query string for "Export these shipments": the list's filters and sort. */
export function shipmentExportQuery(params: URLSearchParams) {
  const out = new URLSearchParams({ download: "shipments", scope: "list" });
  for (const key of ["q", "status", "customer_id", "service", "warehouse", "payment", "nihao", "sort"]) {
    const value = (params.get(key) ?? "").trim();
    if (value) out.set(key, value);
  }
  return out.toString();
}
