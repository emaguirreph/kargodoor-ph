import { airVolumetricFactor, roundAirBillableWeight, type AirItem, type SeaCategory } from "./quotation-pricing";

export const niHaoDensityThreshold = 500;

export const niHaoSeaRates: Record<SeaCategory, { cbmRate: number; densityRate: number | null }> = {
  "LOW VALUE GOODS": { cbmRate: 7000, densityRate: 14 },
  "VOLUME GOODS": { cbmRate: 7500, densityRate: 15 },
  COMMODITIES: { cbmRate: 8500, densityRate: 17 },
  "HIGH VALUE": { cbmRate: 9500, densityRate: 19 },
  "SENSITIVE - BATTERIES": { cbmRate: 15000, densityRate: 30 },
  "SENSITIVE - CHEMICALS": { cbmRate: 12000, densityRate: 24 },
  "MOBILE / COMPUTERS / TABLETS": { cbmRate: 10000, densityRate: null },
};

export const niHaoPackagePricing = {
  mini: { maximumCbm: 0.01, rate: 200 },
  lite: { maximumCbm: 0.05, rate: 600 },
  plus: { maximumCbm: 0.125, rate: 10000 },
} as const;

const valid = (value: number) => Number.isFinite(value) && value >= 0;

export function niHaoSeaQuote(category: SeaCategory, cbm: number, weight: number, packageCount = 1) {
  if (!valid(cbm) || !valid(weight) || cbm <= 0 || !Number.isInteger(packageCount) || packageCount < 1) throw new Error("Invalid Ni Hao sea pricing inputs.");
  const rate = niHaoSeaRates[category], density = weight / cbm;
  const smallPackage = cbm <= niHaoPackagePricing.mini.maximumCbm
    ? { tier: "Mini", base: packageCount * niHaoPackagePricing.mini.rate, volumeCharge: 0 }
    : cbm <= niHaoPackagePricing.lite.maximumCbm
      ? { tier: "Lite", base: packageCount * niHaoPackagePricing.lite.rate, volumeCharge: 0 }
      : cbm <= niHaoPackagePricing.plus.maximumCbm
        ? { tier: "Plus", base: cbm * niHaoPackagePricing.plus.rate, volumeCharge: cbm * niHaoPackagePricing.plus.rate }
        : { tier: "Standard", base: cbm * rate.cbmRate, volumeCharge: cbm * rate.cbmRate };
  const densityApplies = rate.densityRate !== null && density > niHaoDensityThreshold;
  const densityCharge = rate.densityRate === null ? 0 : weight * rate.densityRate;
  const final = Math.max(smallPackage.base, densityApplies ? densityCharge : 0);
  return {
    ...smallPackage,
    density,
    densityCharge,
    densityApplies,
    final,
    pricingMethod: densityApplies && densityCharge > smallPackage.base ? "Density-Based" : smallPackage.tier === "Mini" || smallPackage.tier === "Lite" ? "Package-Based" : "CBM-Based",
  };
}

export const niHaoAirPerKgRates = { ordinary: 350, restricted: 450, medicine: 500 } as const;
export const niHaoAirPieceRates: Partial<Record<AirItem, number>> = { "Mobile Phones": 800, Tablets: 1000, "Laptop Computers": 2000 };

export function niHaoAirQuote(item: AirItem, cbm: number, weight: number, quantity: number) {
  const pieceRate = niHaoAirPieceRates[item];
  if (pieceRate !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Invalid Ni Hao air pricing inputs.");
    return { rate: pieceRate, rateBasis: "Per piece", billableWeight: 0, final: quantity * pieceRate };
  }
  if (!valid(cbm) || !valid(weight) || (cbm <= 0 && weight <= 0)) throw new Error("Invalid Ni Hao air pricing inputs.");
  const rate = item === "Ordinary Items" ? niHaoAirPerKgRates.ordinary : item === "Medicine and Food Supplements" ? niHaoAirPerKgRates.medicine : niHaoAirPerKgRates.restricted;
  const billableWeight = roundAirBillableWeight(Math.max(weight, cbm * airVolumetricFactor));
  return { rate, rateBasis: "Per kg", billableWeight, final: billableWeight * rate };
}
