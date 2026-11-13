export type SeaCategory = "LOW VALUE GOODS" | "VOLUME GOODS" | "COMMODITIES" | "HIGH VALUE" | "SENSITIVE - BATTERIES" | "SENSITIVE - CHEMICALS" | "MOBILE / COMPUTERS / TABLETS";
type SeaRateTable = Record<SeaCategory, { cbmRate: number; densityRate: number | null }>;
/**
 * New sea rates start on this Manila date. Quotations and shipments created
 * before it keep the earlier rates when they are recalculated; saved amounts
 * are never touched.
 */
export const seaRatesEffectiveDate = "2026-11-10";
/** KargoDoor sea rates for records created before seaRatesEffectiveDate. */
export const seaRatesBeforeNov2026: SeaRateTable = {
  "LOW VALUE GOODS": { cbmRate: 7999, densityRate: 19 },
  "VOLUME GOODS": { cbmRate: 8500, densityRate: 20 },
  COMMODITIES: { cbmRate: 9500, densityRate: 22 },
  "HIGH VALUE": { cbmRate: 11000, densityRate: 26 },
  "SENSITIVE - BATTERIES": { cbmRate: 16000, densityRate: 38 },
  "SENSITIVE - CHEMICALS": { cbmRate: 13000, densityRate: 31 },
  "MOBILE / COMPUTERS / TABLETS": { cbmRate: 10500, densityRate: null },
};
/** Current KargoDoor sea rates (from 2026-11-10). Density rates ≈ CBM rate ÷ 425. */
export const seaRates: SeaRateTable = {
  "LOW VALUE GOODS": { cbmRate: 9499, densityRate: 22 },
  "VOLUME GOODS": { cbmRate: 9999, densityRate: 24 },
  COMMODITIES: { cbmRate: 11199, densityRate: 26 },
  "HIGH VALUE": { cbmRate: 12499, densityRate: 29 },
  "SENSITIVE - BATTERIES": { cbmRate: 18999, densityRate: 45 },
  "SENSITIVE - CHEMICALS": { cbmRate: 15499, densityRate: 36 },
  "MOBILE / COMPUTERS / TABLETS": { cbmRate: 12999, densityRate: null },
};
/** KD Plus fixed price (>0.05–0.125 CBM): ₱1,400 before 2026-11-10, ₱1,499 from then. Mini and Lite are unchanged. */
export const kdPlusPriceBeforeNov2026 = 1400;
export const kdPlusPrice = 1499;
/**
 * Manila calendar date (YYYY-MM-DD) of a record's created_at or a plain date.
 * Missing or unreadable values count as today, so new work gets the new rates.
 */
export function manilaDate(value?: unknown): string {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const normalized = /^\d{4}-\d{2}-\d{2} \d/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const time = raw ? Date.parse(normalized) : NaN;
  return new Date((Number.isFinite(time) ? time : Date.now()) + 8 * 3600_000).toISOString().slice(0, 10);
}
/** True when a record dated pricingDate is priced on the earlier sea rates. */
export const usesEarlierSeaRates = (pricingDate?: unknown) => manilaDate(pricingDate) < seaRatesEffectiveDate;
/** KargoDoor sea rates for a record created on pricingDate (default: today). */
export const seaRatesOn = (pricingDate?: unknown): SeaRateTable => usesEarlierSeaRates(pricingDate) ? seaRatesBeforeNov2026 : seaRates;
/** KD Plus fixed price for a record created on pricingDate (default: today). */
export const kdPlusPriceOn = (pricingDate?: unknown) => usesEarlierSeaRates(pricingDate) ? kdPlusPriceBeforeNov2026 : kdPlusPrice;
export const itemCategories: Record<string, SeaCategory> = {
  "Bags":"LOW VALUE GOODS","Plastic toys (non-copy)":"LOW VALUE GOODS","Beddings":"LOW VALUE GOODS","Clothes":"LOW VALUE GOODS","Household wares":"LOW VALUE GOODS","Face masks":"LOW VALUE GOODS","Packaging materials":"LOW VALUE GOODS","Plastic products":"LOW VALUE GOODS","Shoes / slippers":"LOW VALUE GOODS","Textile & leather":"LOW VALUE GOODS","Tissue paper":"LOW VALUE GOODS",
  "Construction materials":"VOLUME GOODS","Daily necessities":"VOLUME GOODS","Eyeglasses":"VOLUME GOODS","Office & school supplies":"VOLUME GOODS","Pet supplies / grooming":"VOLUME GOODS","Umbrellas":"VOLUME GOODS",
  "Acrylic":"COMMODITIES","Bikes / accessories":"COMMODITIES","Cables / chargers":"COMMODITIES","Car / motor accessories":"COMMODITIES","Cosmetics":"COMMODITIES","Electrical appliances":"COMMODITIES","E-bikes / accessories":"COMMODITIES","Food ingredients":"COMMODITIES","Packaged non-alcoholic food":"COMMODITIES","Furniture":"COMMODITIES","Games / toys":"COMMODITIES","Hardware":"COMMODITIES","Home appliances except TV":"COMMODITIES","Keyboard / mouse / earphones":"COMMODITIES","LED lights":"COMMODITIES","Lighting / fixtures":"COMMODITIES","Medical supplies / tools":"COMMODITIES","Sanitary wares":"COMMODITIES","Solar panels":"COMMODITIES","Speakers":"COMMODITIES","Sports equipment":"COMMODITIES",
  "Medicines / health supplements":"HIGH VALUE","Machines":"HIGH VALUE","Motorized / electric tools & equipment":"HIGH VALUE","Novelty items":"HIGH VALUE","TV":"HIGH VALUE","USB":"HIGH VALUE","Watches":"HIGH VALUE",
  "Batteries":"SENSITIVE - BATTERIES","Chemicals":"SENSITIVE - CHEMICALS",
  "Mobile / computer parts & accessories":"MOBILE / COMPUTERS / TABLETS","Mobile phones":"MOBILE / COMPUTERS / TABLETS","Computers":"MOBILE / COMPUTERS / TABLETS","Tablets":"MOBILE / COMPUTERS / TABLETS",
};
export const airItems = ["Ordinary Items","Liquid, Powder, Food, Computer Parts, Electronics","Medicine and Food Supplements","Mobile Phones","Tablets","Laptop Computers"] as const;
export type AirItem = typeof airItems[number];
export const airPieceRates: Partial<Record<AirItem, number>> = { "Mobile Phones": 950, Tablets: 1200, "Laptop Computers": 2800 };
export const airPerKgRates = { ordinary: 500, restricted: 600, medicine: 650 } as const;
export const airVolumetricFactor = 167;
export const roundAirBillableWeight = (weight: number) => Math.ceil(weight);
/**
 * Flat transfer fee (PHP) added to every KargoDoor freight charge. The customer
 * sees one shipping fee; inside the admin this part is labelled the transfer
 * fee that covers bank / GCash transfer costs to Ni Hao.
 */
export const transferFeePesos = 30;
const valid = (value: number) => Number.isFinite(value) && value >= 0;
/**
 * KargoDoor sea price. pricingDate is the record's created_at (or a
 * YYYY-MM-DD date); leave it out for new work to use the current rates.
 */
export function seaQuote(category: SeaCategory, cbm: number, weight: number, units = 0, pricingDate?: unknown) {
  if (!valid(cbm) || !valid(weight) || cbm <= 0 || (category === "MOBILE / COMPUTERS / TABLETS" && (!Number.isInteger(units) || units < 1))) throw new Error("Invalid sea quotation inputs.");
  const rate = seaRatesOn(pricingDate)[category], density = weight / cbm;
  if (category === "MOBILE / COMPUTERS / TABLETS") {
    const volumeCharge = cbm * rate.cbmRate, base = Math.max(1700, volumeCharge), unitCharge = units * 250;
    return { packageTier:"KD Standard", density, base, volumeCharge, densityCharge:0, unitCharge, densityApplies:false, final:base+unitCharge+transferFeePesos, transferFee:transferFeePesos, pricingMethod:`₱${rate.cbmRate.toLocaleString("en-PH")}/CBM + ₱250/unit` };
  }
  const tier = cbm <= .01 ? "KD Mini" : cbm <= .05 ? "KD Lite" : cbm <= .125 ? "KD Plus" : "KD Standard";
  const fixed = tier === "KD Mini" ? 250 : tier === "KD Lite" ? 750 : tier === "KD Plus" ? kdPlusPriceOn(pricingDate) : null;
  const volumeCharge = fixed ?? cbm * rate.cbmRate;
  const base = fixed ?? Math.max(1700, volumeCharge);
  const densityApplies = density > 425;
  const densityCharge = weight * rate.densityRate!;
  const final = Math.max(base, densityApplies ? densityCharge : 0) + transferFeePesos;
  return { transferFee:transferFeePesos, packageTier: densityApplies && densityCharge > base ? "KD Max" : tier, density, base, volumeCharge, densityCharge, unitCharge:0, densityApplies, final, pricingMethod:densityApplies && densityCharge > base ? "Density-Based" : fixed ? "Fixed Rate" : "CBM-Based" };
}
export function airQuote(item: AirItem, cbm: number, weight: number, quantity: number) {
  if (!valid(quantity) || !Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity is required.");
  if (item in airPieceRates) return { rate:airPieceRates[item]!, rateBasis:"Per piece", volumetricWeight:0, billableWeight:0, final:quantity*airPieceRates[item]!+transferFeePesos, transferFee:transferFeePesos, formula:"Quantity × rate" };
  if (!valid(cbm) || !valid(weight) || cbm <= 0 || weight <= 0) throw new Error("CBM and declared weight are required.");
  const rate = item === "Ordinary Items" ? airPerKgRates.ordinary : item === "Medicine and Food Supplements" ? airPerKgRates.medicine : airPerKgRates.restricted;
  const volumetricWeight=cbm*airVolumetricFactor, rawBillableWeight=Math.max(weight,volumetricWeight), billableWeight=roundAirBillableWeight(rawBillableWeight);
  return { rate, rateBasis:"Higher of Declared vs Volumetric, rounded up to a whole kg", volumetricWeight, rawBillableWeight, billableWeight, final:billableWeight*rate+transferFeePesos, transferFee:transferFeePesos, formula:"CEILING(MAX(Declared Weight, CBM × 167)) × rate" };
}
