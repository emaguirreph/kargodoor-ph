import type { D1Database } from "@cloudflare/workers-types";

/**
 * Cargo item and category for a shipment. Shipments do not store these
 * themselves: they come from the quotation the shipment was created from
 * (cargo_snapshot), or from an "Item: ..." first line in tracking remarks for
 * shipments added by hand.
 */

/** SQL for the cargo item. Needs `s` (shipments) and `q` (LEFT JOIN quotations ON q.id = s.source_quotation_id). */
export const cargoItemSql = `CASE
  WHEN s.tracking_remarks LIKE 'Item: %'
    THEN substr(s.tracking_remarks, 7, instr(s.tracking_remarks || char(10), char(10)) - 7)
  ELSE COALESCE(NULLIF(json_extract(q.cargo_snapshot, '$.description'), ''), NULLIF(json_extract(q.cargo_snapshot, '$.item'), ''))
END`;

/** SQL for the two category parts; format them with cargoCategory(). */
export const cargoCategorySql = {
  item: "NULLIF(json_extract(q.cargo_snapshot, '$.item'), '')",
  group: "NULLIF(json_extract(q.cargo_snapshot, '$.category'), '')",
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
