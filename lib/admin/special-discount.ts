import { AdminError } from "./security";
import { pesos } from "./ui";

/**
 * Special discount (Em, 2026-11-17): any % off the KargoDoor base fee
 * (e.g. 10, 12.5, 20).
 *
 * - The ₱30 transfer fee inside the shipping fee is never discounted; it pays
 *   real bank fees.
 * - A discount may not leave less than 10% gross margin: (shipping fee after
 *   discount + additional fee − Ni Hao cost) / (shipping fee after discount +
 *   additional fee). The additional fee counts because it pays for Ni Hao's
 *   extra charge, which is inside the Ni Hao cost.
 * - shipping_charge holds what the customer pays AFTER the discount, so every
 *   total, payment, margin and profit already uses the discounted amount. The
 *   fee before the discount is shipping_charge + discount_amount.
 */
export const minGrossMargin = 0.1;

/** "10", "12.5" */
export const percentNumber = (percent: unknown) => String(Math.round(Number(percent) * 100) / 100);
export const discountLabel = (percent: unknown) => `Special discount ${percentNumber(percent)}%`;

const toCentavos = (value: unknown) => Number(value ?? 0) || 0;
const baseFee = (grossCharge: number, transferFee: unknown) =>
  Math.max(grossCharge - Math.min(Math.max(toCentavos(transferFee), 0), grossCharge), 0);

/** Discount in centavos, rounded to a whole peso, on the base fee (fee before discount minus the transfer fee). */
export function discountAmount(grossCharge: number, transferFee: unknown, percent: number) {
  if (!(percent > 0)) return 0;
  return Math.round((baseFee(grossCharge, transferFee) * percent) / 100 / 100) * 100;
}

/** Gross margin after the discount, as a fraction; null when there is no Ni Hao cost or no charge. */
export function grossMargin(netCharge: number, niHaoCost: unknown) {
  if (niHaoCost === null || niHaoCost === undefined || niHaoCost === "" || !(netCharge > 0)) return null;
  return (netCharge - Number(niHaoCost)) / netCharge;
}

const marginOk = (grossCharge: number, transferFee: unknown, percent: number, niHaoCost: unknown, additionalFee = 0) => {
  const margin = grossMargin(grossCharge - discountAmount(grossCharge, transferFee, percent) + additionalFee, niHaoCost);
  return margin !== null && margin >= minGrossMargin - 1e-9;
};

export const percentText = (fraction: number) => `${(fraction * 100).toFixed(1).replace(/\.0$/, "")}%`;

/**
 * Highest discount % (to 0.5%) that keeps at least 10% gross margin; 0 when
 * none fits or the Ni Hao cost is missing.
 */
export function maxDiscountPercent(grossCharge: number, transferFee: unknown, niHaoCost: unknown, additionalFee = 0) {
  const base = baseFee(grossCharge, transferFee);
  if (!base || niHaoCost === null || niHaoCost === undefined || niHaoCost === "") return 0;
  // Margin ≥ 10% means the income after discount ≥ Ni Hao cost / 0.9.
  const room = grossCharge + additionalFee - Number(niHaoCost) / (1 - minGrossMargin);
  let percent = Math.floor(((room / base) * 100) * 2) / 2;
  percent = Math.min(Math.max(percent, 0), 99.5);
  while (percent > 0 && !marginOk(grossCharge, transferFee, percent, niHaoCost, additionalFee)) percent -= 0.5;
  return percent;
}

/**
 * Applies the typed discount % to the fee before discount. Throws when the
 * discount would leave less than 10% gross margin, or when there is no Ni Hao
 * cost to check it against.
 */
export function applySpecialDiscount(input: {
  grossCharge: number;
  transferFee: unknown;
  percent: number;
  niHaoCost: unknown;
  /** Additional fee the customer pays on top (centavos); counts as income in the margin. */
  additionalFee?: number;
}): { percent: number; amount: number; netCharge: number } {
  const extra = Number(input.additionalFee ?? 0) || 0;
  const percent = Number(input.percent) || 0;
  if (!(percent > 0)) return { percent: 0, amount: 0, netCharge: input.grossCharge };
  if (percent >= 100) throw new AdminError("The special discount must be below 100%.");
  if (input.niHaoCost === null || input.niHaoCost === undefined || input.niHaoCost === "")
    throw new AdminError("Enter the Ni Hao cost before giving a special discount, so the 10% minimum margin can be checked.");
  const amount = discountAmount(input.grossCharge, input.transferFee, percent);
  const netCharge = input.grossCharge - amount;
  if (!marginOk(input.grossCharge, input.transferFee, percent, input.niHaoCost, extra)) {
    const margin = grossMargin(netCharge + extra, input.niHaoCost);
    const best = maxDiscountPercent(input.grossCharge, input.transferFee, input.niHaoCost, extra);
    throw new AdminError(
      `A ${percentNumber(percent)}% special discount (${pesos(amount)} off) leaves ${margin === null ? "no" : percentText(margin)} gross margin. The minimum is 10%. ` +
        (best ? `The most you can give on this shipment is ${percentNumber(best)}%.` : "This shipment's margin is too thin for any special discount."),
    );
  }
  return { percent, amount, netCharge };
}
