export const measurementUnits = ["mm", "cm", "m"] as const;
export type MeasurementUnit = typeof measurementUnits[number];

const numeric = (value: unknown, label: string) => {
  const raw = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) throw new Error(`Enter a valid non-negative ${label}.`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Enter a valid non-negative ${label}.`);
  return parsed;
};

export function calculateTotalCbm(input: {
  length: unknown;
  width: unknown;
  height: unknown;
  measurementUnit: unknown;
  quantity: unknown;
}) {
  const dimensions = [input.length, input.width, input.height].map((value) => String(value ?? "").trim());
  if (dimensions.every((value) => !value)) return null;
  if (dimensions.some((value) => !value)) throw new Error("Length, width, and height are all required when calculating Total CBM.");
  const [length, width, height] = dimensions.map((value, index) => numeric(value, ["length", "width", "height"][index]));
  if (length <= 0 || width <= 0 || height <= 0) throw new Error("Length, width, and height must be greater than zero.");
  const quantity = numeric(input.quantity, "quantity");
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be a whole number of at least 1.");
  const unit = String(input.measurementUnit ?? "").trim() as MeasurementUnit;
  if (!measurementUnits.includes(unit)) throw new Error("Choose mm, cm, or m as the measurement unit.");
  const divisor = unit === "mm" ? 1_000_000_000 : unit === "cm" ? 1_000_000 : 1;
  return (length * width * height * quantity) / divisor;
}
