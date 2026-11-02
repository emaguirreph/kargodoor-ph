// Flat transfer fee included in every shipping fee (same as transferFeePesos in lib/admin/quotation-pricing.ts).
const transferFee = 30;
const withTransferFee = (estimate) => ({ ...estimate, amount: estimate.amount + transferFee });

export function getSeaEstimate(cbm, weight) {
  return withTransferFee(seaFreight(cbm, weight));
}

function seaFreight(cbm, weight) {
  const smallPackage = cbm <= 0.01
    ? { packageName: "KD Mini", amount: 250 }
    : cbm <= 0.05
      ? { packageName: "KD Lite", amount: 750 }
      : cbm <= 0.125
        ? { packageName: "KD Plus", amount: 1400 }
        : null;

  if (smallPackage) {
    const weightCharge = weight * 19;
    return weight / cbm > 425 && weightCharge > smallPackage.amount
      ? { packageName: "KD Max", amount: weightCharge }
      : smallPackage;
  }

  const volumeCharge = Math.max(cbm * 7999, 1700);
  const weightCharge = weight * 19;

  return {
    packageName: weightCharge > volumeCharge ? "KD Max" : "KD Standard",
    amount: Math.max(volumeCharge, weightCharge),
  };
}

export function getAirEstimate(weight) {
  return withTransferFee({ packageName: "Air Freight", amount: Math.ceil(weight) * 500 });
}
