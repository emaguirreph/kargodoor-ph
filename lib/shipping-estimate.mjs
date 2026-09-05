export function getSeaEstimate(cbm, weight) {
  const smallPackage = cbm <= 0.01
    ? { packageName: "KD Mini", amount: 250 }
    : cbm <= 0.05
      ? { packageName: "KD Lite", amount: 750 }
      : cbm <= 0.125
        ? { packageName: "KD Plus", amount: 1400 }
        : null;

  if (smallPackage) {
    return weight / cbm > 425
      ? { packageName: smallPackage.packageName, amount: weight * 19 }
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
  return { packageName: "Air Freight", amount: weight * 500 };
}
