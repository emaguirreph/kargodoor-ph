export const densityThreshold = 425;

const numeric = (value: unknown, label: string) => {
  const raw = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) throw new Error(`Enter a valid non-negative ${label}.`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Enter a valid non-negative ${label}.`);
  return parsed;
};

export function calculateDensity(cbm: unknown, weight: unknown) {
  const totalCbm = numeric(cbm, "Total CBM");
  const actualWeight = numeric(weight, "actual weight");
  if (totalCbm <= 0) return null;
  return actualWeight / totalCbm;
}

export function densityStatus(density: number | null) {
  if (density === null) return null;
  return density > densityThreshold
    ? "ABOVE THRESHOLD — WEIGHT CHARGE COMPARISON APPLIES"
    : "WITHIN THRESHOLD";
}
