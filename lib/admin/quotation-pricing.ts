export type SeaCategory = "LOW VALUE GOODS" | "VOLUME GOODS" | "COMMODITIES" | "HIGH VALUE" | "SENSITIVE GOODS" | "MOBILE / COMPUTERS / TABLETS";
export const seaRates: Record<SeaCategory, { cbmRate: number; densityRate: number | null }> = {
  "LOW VALUE GOODS": { cbmRate: 7999, densityRate: 19 },
  "VOLUME GOODS": { cbmRate: 8500, densityRate: 20 },
  COMMODITIES: { cbmRate: 9500, densityRate: 22 },
  "HIGH VALUE": { cbmRate: 11000, densityRate: 26 },
  "SENSITIVE GOODS": { cbmRate: 13000, densityRate: 31 },
  "MOBILE / COMPUTERS / TABLETS": { cbmRate: 10500, densityRate: null },
};
export const itemCategories: Record<string, SeaCategory> = {
  "Bags":"LOW VALUE GOODS","Plastic toys (non-copy)":"LOW VALUE GOODS","Beddings":"LOW VALUE GOODS","Clothes":"LOW VALUE GOODS","Household wares":"LOW VALUE GOODS","Face masks":"LOW VALUE GOODS","Packaging materials":"LOW VALUE GOODS","Plastic products":"LOW VALUE GOODS","Shoes / slippers":"LOW VALUE GOODS","Textile & leather":"LOW VALUE GOODS","Tissue paper":"LOW VALUE GOODS",
  "Construction materials":"VOLUME GOODS","Daily necessities":"VOLUME GOODS","Eyeglasses":"VOLUME GOODS","Office & school supplies":"VOLUME GOODS","Pet supplies / grooming":"VOLUME GOODS","Umbrellas":"VOLUME GOODS",
  "Acrylic":"COMMODITIES","Bikes / accessories":"COMMODITIES","Cables / chargers":"COMMODITIES","Car / motor accessories":"COMMODITIES","Cosmetics":"COMMODITIES","Electrical appliances":"COMMODITIES","E-bikes / accessories":"COMMODITIES","Food ingredients":"COMMODITIES","Packaged non-alcoholic food":"COMMODITIES","Furniture":"COMMODITIES","Games / toys":"COMMODITIES","Hardware":"COMMODITIES","Home appliances except TV":"COMMODITIES","Keyboard / mouse / earphones":"COMMODITIES","LED lights":"COMMODITIES","Lighting / fixtures":"COMMODITIES","Medical supplies / tools":"COMMODITIES","Sanitary wares":"COMMODITIES","Solar panels":"COMMODITIES","Speakers":"COMMODITIES","Sports equipment":"COMMODITIES",
  "Medicines / health supplements":"HIGH VALUE","Mobile / computer parts & accessories":"HIGH VALUE","Machines":"HIGH VALUE","Motorized / electric tools & equipment":"HIGH VALUE","Novelty items":"HIGH VALUE","TV":"HIGH VALUE","USB":"HIGH VALUE","Watches":"HIGH VALUE",
  "Batteries":"SENSITIVE GOODS","Chemicals":"SENSITIVE GOODS",
  "Mobile phones":"MOBILE / COMPUTERS / TABLETS","Computers":"MOBILE / COMPUTERS / TABLETS","Tablets":"MOBILE / COMPUTERS / TABLETS",
};
export const airItems = ["Ordinary Items","Liquid, Powder, Food, Computer Parts, Electronics","Medicine and Food Supplements","Mobile Phones","Tablets","Laptop Computers"] as const;
export type AirItem = typeof airItems[number];
const valid = (value: number) => Number.isFinite(value) && value >= 0;
export function seaQuote(category: SeaCategory, cbm: number, weight: number, units = 0) {
  if (!valid(cbm) || !valid(weight) || cbm <= 0 || (category === "MOBILE / COMPUTERS / TABLETS" && (!Number.isInteger(units) || units < 1))) throw new Error("Invalid sea quotation inputs.");
  const rate = seaRates[category], density = weight / cbm;
  if (category === "MOBILE / COMPUTERS / TABLETS") {
    const base = Math.max(1700, cbm * 10500), unitCharge = units * 250;
    return { packageTier:"KD Standard", density, base, volumeCharge:cbm*10500, densityCharge:0, unitCharge, densityApplies:false, final:base+unitCharge, pricingMethod:"₱10,500/CBM + ₱250/unit" };
  }
  const fixed = cbm <= .01 ? 250 : cbm <= .05 ? 750 : cbm <= .125 ? 1400 : null;
  const volumeCharge = fixed ?? cbm * rate.cbmRate;
  const base = fixed ?? Math.max(1700, volumeCharge);
  const densityApplies = density > 425;
  const densityCharge = densityApplies ? weight * rate.densityRate! : 0;
  const final = Math.max(base, densityCharge);
  return { packageTier: densityApplies && densityCharge > base ? "KD Max" : fixed === 250 ? "KD Mini" : fixed === 750 ? "KD Lite" : fixed === 1400 ? "KD Plus" : "KD Standard", density, base, volumeCharge, densityCharge, unitCharge:0, densityApplies, final, pricingMethod:densityApplies && densityCharge > base ? "Weight × category density rate" : fixed ? "Fixed package rate" : "Category CBM rate" };
}
export function airQuote(item: AirItem, cbm: number, weight: number, quantity: number) {
  if (!valid(quantity) || !Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity is required.");
  const pieces: Partial<Record<AirItem,number>> = {"Mobile Phones":800,Tablets:1000,"Laptop Computers":2000};
  if (item in pieces) return { rate:pieces[item]!, rateBasis:"Per piece", volumetricWeight:0, billableWeight:0, final:quantity*pieces[item]!, formula:"Quantity × rate" };
  if (!valid(cbm) || !valid(weight) || cbm <= 0 || weight <= 0) throw new Error("CBM and actual weight are required.");
  const rate = item === "Ordinary Items" ? 350 : item === "Medicine and Food Supplements" ? 500 : 450;
  const volumetricWeight=cbm*167, billableWeight=Math.ceil(Math.max(weight,volumetricWeight));
  return { rate, rateBasis:"Higher of Actual vs Volumetric", volumetricWeight, billableWeight, final:billableWeight*rate, formula:"ROUNDUP(MAX(Actual Weight, CBM × 167), 0) × rate" };
}