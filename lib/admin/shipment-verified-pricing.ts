import { randomUUID } from "node:crypto";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

import { AdminError } from "./security";
import { manualCargoPricing } from "./shipment-cargo";
import { resolveNiHaoCost } from "./nihao-estimate";
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
}): (VerifiedFreightRecalculation & { basis: string }) | null {
  const cargo = manualCargoPricing(input);
  const quantity = Number(input.quantity ?? 1) || 1;
  try {
    if (input.serviceType === "Sea Freight" && cargo.seaCategory) {
      const calculation = seaQuote(cargo.seaCategory, input.cbm, input.weight, quantity);
      return { shippingCharge: Math.round(calculation.final * 100), pricingMethod: calculation.pricingMethod, basis: `Sea · ${cargo.seaCategory}` };
    }
    if (input.serviceType === "Air Freight" && cargo.airItem) {
      const calculation = airQuote(cargo.airItem, input.cbm, input.weight, quantity);
      return { shippingCharge: Math.round(calculation.final * 100), pricingMethod: calculation.formula, basis: `Air · ${cargo.airItem}` };
    }
  } catch {
    return null;
  }
  return null;
}

/** KargoDoor freight from the rates for a hand-added shipment's saved or submitted values, using the verified size when there is one. */
export function manualShipmentRate(values: Row): { cost: number; basis: string } | null {
  const measured = values.verified_cbm !== null && values.verified_cbm !== undefined && values.verified_weight_kg !== null && values.verified_weight_kg !== undefined;
  const rate = manualShipmentFreight({
    serviceType: values.service_type,
    item: values.cargo_item,
    category: values.cargo_category,
    quantity: values.cargo_quantity,
    remarks: values.tracking_remarks,
    cbm: Number(measured ? values.verified_cbm : values.cbm),
    weight: Number(measured ? values.verified_weight_kg : values.weight_kg),
  });
  return rate ? { cost: rate.shippingCharge, basis: `${rate.basis} · ${measured ? "verified" : "declared"} size` } : null;
}

/**
 * KargoDoor charge to save for a hand-added shipment. A blank charge, or one
 * still holding the previous rate, follows the KargoDoor rates; a typed amount
 * is kept as is.
 */
export function resolveManualShipmentCharge(
  values: Row,
  previous: Row | null,
): { cost: number; source: "rate" | "manual" } {
  const submitted = values.shipping_charge === null || values.shipping_charge === undefined ? null : Number(values.shipping_charge);
  const charge = resolveNiHaoCost(
    submitted,
    previous ? { cost: previous.shipping_charge, source: previous.shipping_charge_source === "rate" ? "estimate" : "actual" } : null,
    manualShipmentRate(values),
  );
  if (charge.cost === null) {
    throw new AdminError("Choose an Item / Commodity so the KargoDoor charge can be computed, or type the charge.");
  }
  return { cost: charge.cost, source: charge.source === "estimate" ? "rate" : "manual" };
}

/**
 * Reuses the quotation pricing engine with measurements confirmed by the
 * China warehouse. Shipments added by hand return null here: when their charge
 * was filled from the rates, the save path refreshes it with
 * manualShipmentFreight(), and a typed charge is kept.
 */
export async function verifiedShipmentFreight(
  db: D1Database,
  shipmentId: string,
  verifiedCbm: number,
  verifiedWeight: number,
): Promise<VerifiedFreightRecalculation | null> {
  const shipment = await db.prepare(
    `SELECT s.service_type, s.source_quotation_id, s.tracking_remarks, q.cargo_snapshot
     FROM shipments s
     LEFT JOIN quotations q ON q.id = s.source_quotation_id
     WHERE s.id = ?`,
  ).bind(shipmentId).first<Row>();

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
