import { itemCategories, seaQuote, seaRates, type SeaCategory } from "./quotation-pricing";

const numeric = (value: unknown, label: string, required = true) => {
  const raw = String(value ?? "").trim();
  if (!raw && !required) return 0;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) throw new Error(`Enter a valid non-negative ${label}.`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Enter a valid non-negative ${label}.`);
  return parsed;
};

export function calculateAdminSeaQuote(input: Record<string, unknown>) {
  if (input.freightType !== "Sea Freight") throw new Error("Live calculation is available for Sea Freight only.");
  const item = String(input.item ?? "");
  if (!(item in itemCategories) && item !== "OTHER / NOT LISTED") throw new Error("Choose a valid Sea Freight item.");
  const category = item in itemCategories ? itemCategories[item] : String(input.category ?? "") as SeaCategory;
  if (!(category in seaRates)) throw new Error("Choose a valid Sea Freight category.");
  const cbm = numeric(input.cbm, "Total CBM");
  const weight = numeric(input.weight, "actual weight");
  const units = numeric(input.units, "units", false);
  const calculation = seaQuote(category, cbm, weight, units);
  return {
    item,
    category,
    cbm,
    weight,
    units,
    cbmRate: seaRates[category].cbmRate,
    densityRate: seaRates[category].densityRate,
    ...calculation,
  };
}
