import type { D1Database } from "@cloudflare/workers-types";

import { airItems, itemCategories, seaRates, type AirItem, type SeaCategory } from "./quotation-pricing";

/**
 * Cargo item and category for a shipment. Quotation-linked shipments take
 * them from the quotation's cargo_snapshot. Shipments added by hand store their
 * own (cargo_item, cargo_category); older ones may only have an "Item: ..."
 * first line in tracking remarks.
 */

/** SQL for the cargo item. Needs `s` (shipments) and `q` (LEFT JOIN quotations ON q.id = s.source_quotation_id). */
export const cargoItemSql = `CASE
  WHEN s.source_quotation_id IS NULL AND NULLIF(s.cargo_item, '') IS NOT NULL THEN s.cargo_item
  WHEN s.tracking_remarks LIKE 'Item: %'
    THEN substr(s.tracking_remarks, 7, instr(s.tracking_remarks || char(10), char(10)) - 7)
  ELSE COALESCE(NULLIF(json_extract(q.cargo_snapshot, '$.description'), ''), NULLIF(json_extract(q.cargo_snapshot, '$.item'), ''))
END`;

/** SQL for the two category parts; format them with cargoCategory(). */
export const cargoCategorySql = {
  item: "NULLIF(json_extract(q.cargo_snapshot, '$.item'), '')",
  group: "COALESCE(NULLIF(json_extract(q.cargo_snapshot, '$.category'), ''), CASE WHEN s.source_quotation_id IS NULL THEN NULLIF(s.cargo_category, '') END)",
};

const titleCase = (value: string) =>
  value === value.toUpperCase() ? value.charAt(0) + value.slice(1).toLowerCase() : value;

/** "Electrical appliances (Commodities)", or just "Ordinary Items" when both parts match. */
export function cargoCategory(item: unknown, group: unknown): string | null {
  const a = String(item ?? "").trim();
  const b = String(group ?? "").trim();
  if (a && b && a.toLowerCase() !== b.toLowerCase()) return `${a} (${titleCase(b)})`;
  return a || (b ? titleCase(b) : null);
}

export type ShipmentCargo = {
  item: string | null;
  category: string | null;
  quotationId: string | null;
  quotationNumber: string | null;
};

/** Item, category and source quotation for one shipment record. */
export async function shipmentCargo(db: D1Database, shipmentId: string): Promise<ShipmentCargo | null> {
  const row = await db
    .prepare(
      `SELECT ${cargoItemSql} AS cargo_item, ${cargoCategorySql.item} AS cargo_category_item,
        ${cargoCategorySql.group} AS cargo_category_group, q.id AS quotation_id, q.quotation_number
      FROM shipments s LEFT JOIN quotations q ON q.id = s.source_quotation_id
      WHERE s.id = ?`,
    )
    .bind(shipmentId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    item: row.cargo_item ? String(row.cargo_item) : null,
    category: cargoCategory(row.cargo_category_item, row.cargo_category_group),
    quotationId: row.quotation_id ? String(row.quotation_id) : null,
    quotationNumber: row.quotation_number ? String(row.quotation_number) : null,
  };
}

export type ManualCargoPricing = {
  seaCategory: SeaCategory | null;
  airItem: AirItem | null;
  /** True when an admin picked the category on the shipment form, not guessed from the item name. */
  categoryChosen: boolean;
};

/**
 * Sea category and air item type for a shipment added by hand. The category
 * picked on the form wins; otherwise it is looked up from the item name, then
 * from older "Item: ..." / "Category: ..." lines in tracking remarks.
 */
export function manualCargoPricing(cargo: { item?: unknown; category?: unknown; remarks?: unknown }): ManualCargoPricing {
  const item = String(cargo.item ?? "").trim();
  const category = String(cargo.category ?? "").trim();
  const remarks = String(cargo.remarks ?? "");
  const catalogCategory = (name: string) => (Object.hasOwn(itemCategories, name) ? itemCategories[name] : "");
  const remarksItem = /^Item:\s*(.+)$/m.exec(remarks)?.[1]?.trim() ?? "";
  const remarksCategory = /^Category:\s*(.+)$/m.exec(remarks)?.[1]?.trim() ?? "";
  const isSea = (value: string): value is SeaCategory => Object.hasOwn(seaRates, value);
  const isAir = (value: string): value is AirItem => (airItems as readonly string[]).includes(value);
  const seaCategory = [category, catalogCategory(item), remarksCategory, catalogCategory(remarksItem)].find((value) => value && isSea(value)) as SeaCategory | undefined;
  const airItem = [category, item, remarksItem].find((value) => value && isAir(value)) as AirItem | undefined;
  return { seaCategory: seaCategory ?? null, airItem: airItem ?? null, categoryChosen: isSea(category) || isAir(category) };
}
