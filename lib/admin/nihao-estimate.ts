import type { D1Database } from "@cloudflare/workers-types";

import { niHaoAirQuote, niHaoSeaQuote } from "./nihao-pricing";
import { airItems, itemCategories, seaRates, type AirItem, type SeaCategory } from "./quotation-pricing";
import { manualCargoPricing } from "./shipment-cargo";

type Row = Record<string, unknown>;

export type NiHaoCostSource = "estimate" | "actual";

export type NiHaoEstimate = {
  /** Centavos. */
  cost: number;
  basis: string;
};

export type NiHaoEstimateInput = {
  serviceType: string;
  category?: string;
  item?: string;
  cbm: number;
  weight: number;
  packageCount?: number;
  quantity?: number;
};

const whole = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
};

const formatCbm = (cbm: number) => `${Number(cbm.toFixed(4))} CBM`;

/**
 * Ni Hao's cost from the rates on the Ni Hao Rates page. Returns null when the
 * cargo details are not enough to price it (FCL, unknown category or item).
 */
export function estimateNiHaoCost(input: NiHaoEstimateInput): NiHaoEstimate | null {
  const { serviceType, cbm, weight } = input;
  try {
    if (serviceType === "Sea Freight") {
      const category = String(input.category ?? "") as SeaCategory;
      if (!(category in seaRates)) return null;
      const quote = niHaoSeaQuote(category, cbm, weight, whole(input.packageCount, 1));
      return {
        cost: Math.round(quote.final * 100),
        basis: `Sea · ${category} · ${quote.tier} · ${formatCbm(cbm)}, ${weight} kg${quote.pricingMethod === "Density-Based" ? " · density rate" : ""}`,
      };
    }
    if (serviceType === "Air Freight") {
      const item = String(input.item ?? "") as AirItem;
      if (!airItems.includes(item)) return null;
      const quote = niHaoAirQuote(item, cbm, weight, whole(input.quantity, 1));
      return {
        cost: Math.round(quote.final * 100),
        basis: quote.rateBasis === "Per piece"
          ? `Air · ${item} · ${whole(input.quantity, 1)} pc × ₱${quote.rate.toLocaleString("en-PH")}`
          : `Air · ${item} · ${quote.billableWeight} kg × ₱${quote.rate.toLocaleString("en-PH")}`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function parseCargo(value: unknown): Row | null {
  try {
    const cargo = JSON.parse(String(value ?? ""));
    return cargo && typeof cargo === "object" && !Array.isArray(cargo) ? cargo as Row : null;
  } catch {
    return null;
  }
}

/** Ni Hao estimate for a quotation's saved cargo details. */
export function quotationNiHaoEstimate(freightType: string, cargo: Row | null): NiHaoEstimate | null {
  if (!cargo || Array.isArray(cargo.bulkPackages)) return null;
  return estimateNiHaoCost({
    serviceType: freightType,
    category: String(cargo.category || itemCategories[String(cargo.item ?? "")] || ""),
    item: String(cargo.item ?? ""),
    cbm: Number(cargo.cbm),
    weight: Number(cargo.weight),
    packageCount: Number(cargo.packageQuantity ?? 1),
    quantity: Number(cargo.calculatorQuantity ?? cargo.packageQuantity ?? 1),
  });
}

/**
 * Ni Hao estimate for a shipment. Uses the warehouse-verified size when there
 * is one. Quotation-linked shipments take the item/category from the quotation
 * (bulk ones from the "Category:" line bulk intake writes into the remarks);
 * shipments added by hand use their own Item, Category and Pieces fields.
 */
export async function shipmentNiHaoEstimate(
  db: D1Database,
  shipmentId: string,
  values: Row,
): Promise<NiHaoEstimate | null> {
  const shipment = shipmentId
    ? await db.prepare(
      `SELECT s.tracking_remarks, s.source_quotation_id, s.cargo_item, s.cargo_category, s.cargo_quantity, q.cargo_snapshot
       FROM shipments s
       LEFT JOIN quotations q ON q.id = s.source_quotation_id
       WHERE s.id = ?`,
    ).bind(shipmentId).first<Row>() ?? {}
    : {};
  const measured = values.verified_cbm !== null && values.verified_cbm !== undefined && values.verified_weight_kg !== null && values.verified_weight_kg !== undefined;
  const size = {
    serviceType: String(values.service_type ?? ""),
    cbm: Number(measured ? values.verified_cbm : values.cbm),
    weight: Number(measured ? values.verified_weight_kg : values.weight_kg),
  };
  const remarks = String(values.tracking_remarks ?? shipment.tracking_remarks ?? "");
  // Submitted form values win over what is saved, so the estimate follows edits.
  const field = (key: string) => (key in values ? values[key] : shipment[key]);

  if (!shipment.source_quotation_id) {
    const cargo = manualCargoPricing({ item: field("cargo_item"), category: field("cargo_category"), remarks });
    return estimateNiHaoCost({
      ...size,
      category: cargo.seaCategory ?? "",
      item: cargo.airItem ?? "",
      packageCount: 1,
      quantity: Number(field("cargo_quantity") ?? 1),
    });
  }

  const cargo = parseCargo(shipment.cargo_snapshot) ?? {};
  const isBulk = Array.isArray(cargo.bulkPackages);
  const remarksItem = /^Item:\s*(.+)$/m.exec(remarks)?.[1]?.trim() ?? "";
  const remarksCategory = /^Category:\s*(.+)$/m.exec(remarks)?.[1]?.trim() ?? itemCategories[remarksItem];
  return estimateNiHaoCost({
    ...size,
    category: isBulk || !cargo.category ? remarksCategory ?? itemCategories[String(cargo.item ?? "")] : String(cargo.category),
    item: String(cargo.item ?? remarksItem),
    packageCount: isBulk ? 1 : Number(cargo.packageQuantity ?? 1),
    quantity: Number(cargo.calculatorQuantity ?? cargo.packageQuantity ?? 1),
  });
}

/**
 * Decides what Ni Hao cost to save. A blank field, or one still holding the
 * previous estimate, takes the new estimate. Anything else typed in is Ni
 * Hao's actual quote and is never replaced automatically.
 */
export function resolveNiHaoCost(
  submitted: number | null,
  previous: { cost: unknown; source: unknown } | null,
  estimate: NiHaoEstimate | null,
): { cost: number | null; source: NiHaoCostSource | null } {
  const untouchedEstimate = previous !== null &&
    previous.source === "estimate" &&
    previous.cost !== null &&
    Number(previous.cost) === submitted;
  if (submitted === null || untouchedEstimate || (estimate && submitted === estimate.cost)) {
    return estimate ? { cost: estimate.cost, source: "estimate" } : { cost: untouchedEstimate ? submitted : null, source: untouchedEstimate ? "estimate" : null };
  }
  return { cost: submitted, source: "actual" };
}
