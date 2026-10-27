import { randomUUID } from "node:crypto";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

import { AdminError } from "./security";
import { manualCargoPricing } from "./shipment-cargo";
import {
  airItems,
  airQuote,
  itemCategories,
  seaQuote,
  seaRates,
  type AirItem,
  type SeaCategory,
} from "./quotation-pricing";

type Row = Record<string, unknown>;

type VerifiedFreightRecalculation = {
  shippingCharge: number;
  pricingMethod: string;
};

function savedCargo(value: unknown) {
  try {
    const cargo = JSON.parse(String(value ?? ""));
    if (!cargo || typeof cargo !== "object" || Array.isArray(cargo)) throw new Error();
    return cargo as Record<string, unknown>;
  } catch {
    throw new AdminError("The source quotation has invalid cargo details.", 422);
  }
}

function bulkCategory(remarks: unknown) {
  const match = /^Category:\s*(.+)$/m.exec(String(remarks ?? ""));
  return match?.[1]?.trim() ?? "";
}

/**
 * KargoDoor freight from the KargoDoor rates for a shipment added by hand.
 * Returns null when the cargo is not enough to price (FCL, no category/item).
 */
export function manualShipmentFreight(input: {
  serviceType: unknown;
  item?: unknown;
  category?: unknown;
  quantity?: unknown;
  remarks?: unknown;
  cbm: number;
  weight: number;
}): (VerifiedFreightRecalculation & { basis: string; categoryChosen: boolean }) | null {
  const cargo = manualCargoPricing(input);
  const quantity = Number(input.quantity ?? 1) || 1;
  try {
    if (input.serviceType === "Sea Freight" && cargo.seaCategory) {
      const calculation = seaQuote(cargo.seaCategory, input.cbm, input.weight, quantity);
      return { shippingCharge: Math.round(calculation.final * 100), pricingMethod: calculation.pricingMethod, basis: `Sea · ${cargo.seaCategory}`, categoryChosen: cargo.categoryChosen };
    }
    if (input.serviceType === "Air Freight" && cargo.airItem) {
      const calculation = airQuote(cargo.airItem, input.cbm, input.weight, quantity);
      return { shippingCharge: Math.round(calculation.final * 100), pricingMethod: calculation.formula, basis: `Air · ${cargo.airItem}`, categoryChosen: cargo.categoryChosen };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Reuses the quotation pricing engine with measurements confirmed by the
 * China warehouse. Shipments added by hand are recalculated only when an admin
 * picked their Category on the shipment form (`submitted` holds the form
 * values being saved); older ones without it keep their
 * manually entered charge because their pricing inputs are not reliable.
 */
export async function verifiedShipmentFreight(
  db: D1Database,
  shipmentId: string,
  verifiedCbm: number,
  verifiedWeight: number,
  submitted: Row = {},
): Promise<VerifiedFreightRecalculation | null> {
  const shipment = await db.prepare(
    `SELECT s.service_type, s.source_quotation_id, s.tracking_remarks, s.cargo_item, s.cargo_category, s.cargo_quantity, q.cargo_snapshot
     FROM shipments s
     LEFT JOIN quotations q ON q.id = s.source_quotation_id
     WHERE s.id = ?`,
  ).bind(shipmentId).first<Row>();

  if (shipment && !shipment.source_quotation_id) {
    // Values being saved win over what is stored, so a changed category counts.
    const field = (key: string) => (key in submitted ? submitted[key] : shipment[key]);
    const manual = manualShipmentFreight({
      serviceType: field("service_type"),
      item: field("cargo_item"),
      category: field("cargo_category"),
      quantity: field("cargo_quantity"),
      cbm: verifiedCbm,
      weight: verifiedWeight,
    });
    return manual?.categoryChosen ? { shippingCharge: manual.shippingCharge, pricingMethod: manual.pricingMethod } : null;
  }

  if (!shipment || !shipment.source_quotation_id || !shipment.cargo_snapshot) return null;

  const cargo = savedCargo(shipment.cargo_snapshot);
  const isBulk = Array.isArray(cargo.bulkPackages);

  if (shipment.service_type === "Sea Freight") {
    const category = (isBulk
      ? bulkCategory(shipment.tracking_remarks)
      : String(cargo.category ?? "")) as SeaCategory;
    if (!(category in seaRates)) {
      throw new AdminError("The source quotation is missing a valid Sea Freight category.", 422);
    }
    const units = isBulk ? 1 : Number(cargo.units ?? 0);
    const calculation = seaQuote(category, verifiedCbm, verifiedWeight, units);
    return {
      shippingCharge: Math.round(calculation.final * 100),
      pricingMethod: calculation.pricingMethod,
    };
  }

  if (shipment.service_type === "Air Freight") {
    const item = String(cargo.item ?? "") as AirItem;
    if (!airItems.includes(item)) {
      throw new AdminError("The source quotation is missing a valid Air Freight item.", 422);
    }
    const quantity = Number(cargo.calculatorQuantity ?? cargo.packageQuantity ?? 1);
    const calculation = airQuote(item, verifiedCbm, verifiedWeight, quantity);
    return {
      shippingCharge: Math.round(calculation.final * 100),
      pricingMethod: calculation.formula,
    };
  }

  return null;
}

/** Updates an unissued or unpaid invoice only; partial and paid invoices are never changed automatically. */
export async function syncVerifiedFreightToInvoice(
  db: D1Database,
  shipmentId: string,
  shippingCharge: number,
  adminUserId: string,
  note = "Invoice freight updated from verified warehouse measurements.",
) {
  const invoices = (await db.prepare(
    `SELECT id, subtotal, delivery_charge, total, other_charge, status
     FROM invoices
     WHERE shipment_id = ?
       AND archived_at IS NULL
       AND status IN ('Draft', 'Unpaid')
       AND subtotal != ?`,
  ).bind(shipmentId, shippingCharge).all<Row>()).results;

  if (!invoices.length) return 0;

  const timestamp = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const invoice of invoices) {
    const total = shippingCharge + Number(invoice.delivery_charge ?? 0);
    const next = {
      subtotal: shippingCharge,
      total,
    };
    statements.push(
      db.prepare(
        `UPDATE invoices
         SET subtotal = ?, total = ?, updated_at = ?
         WHERE id = ? AND status IN ('Draft', 'Unpaid') AND archived_at IS NULL`,
      ).bind(next.subtotal, next.total, timestamp, invoice.id),
      db.prepare(
        `INSERT INTO activity_log
          (id, admin_user_id, action, entity_type, entity_id, old_value, new_value, notes, created_at)
         VALUES (?, ?, 'update_verified_freight', 'invoices', ?, ?, ?, ?, ?)`,
      ).bind(
        randomUUID(),
        adminUserId,
        invoice.id,
        JSON.stringify({ subtotal: invoice.subtotal, total: invoice.total }),
        JSON.stringify(next),
        note,
        timestamp,
      ),
    );
  }

  await db.batch(statements);
  return invoices.length;
}
