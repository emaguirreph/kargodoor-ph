(() => {
  const form = document.querySelector("[data-freight-calculator]");
  const converter = document.querySelector("[data-cbm-converter]");
  if (!form || !converter) return;
  let seaItems, airItems;
  try {
    seaItems = JSON.parse(form.dataset.seaItems || "{}");
    airItems = JSON.parse(form.dataset.airItems || "[]");
  } catch { return; }
  const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value || 0));
  const type = document.querySelector("[data-freight-type]"), item = document.querySelector("[data-item]"), category = document.querySelector("[data-category]"), cbm = document.querySelector("[data-cbm]"), weight = document.querySelector("[data-weight]"), units = document.querySelector("[data-units]"), unitsField = document.querySelector("[data-units-field]"), csrf = document.querySelector("[data-csrf]"), error = document.querySelector("[data-calculator-error]"), sea = document.querySelector("[data-sea-results]"), air = document.querySelector("[data-air-results]"), seaRules = document.querySelector("[data-sea-rules]"), airRules = document.querySelector("[data-air-rules]");
  const put = (group, key, value) => { const node = document.querySelector(`[data-${group}-${key}]`); if (node) node.textContent = value; };
  const pieceItem = () => ["Mobile Phones", "Tablets", "Laptop Computers"].includes(item.value);
  const seaPieceItem = () => type.value === "Sea Freight" && seaItems[item.value] === "MOBILE / COMPUTERS / TABLETS";
  const sync = () => {
    const allowed = type.value === "Sea Freight" ? Object.keys(seaItems) : airItems;
    const previous = item.value;
    item.replaceChildren(...allowed.map((value) => new Option(value, value)));
    if (allowed.includes(previous)) item.value = previous;
    category.value = type.value === "Sea Freight" ? (seaItems[item.value] || "") : item.value;
    const needsUnits = seaPieceItem() || (type.value === "Air Freight" && pieceItem());
    unitsField.hidden = !needsUnits;
    units.required = needsUnits;
    sea.hidden = type.value !== "Sea Freight";
    air.hidden = type.value !== "Air Freight";
    seaRules.hidden = type.value !== "Sea Freight";
    airRules.hidden = type.value !== "Air Freight";
  };
  const showError = (message = "") => { error.textContent = message; error.hidden = !message; };
  let timer;
  const calculate = async () => {
    const isPiece = type.value === "Air Freight" && pieceItem();
    if ((!isPiece && (!cbm.value || !weight.value)) || (isPiece && Number(units.value) < 1)) return showError(isPiece ? "Enter at least one piece." : "Enter both Total CBM and Actual Weight.");
    const payload = type.value === "Sea Freight" ? { freightType: type.value, item: item.value, category: category.value, cbm: cbm.value, weight: weight.value, units: units.value || "0" } : { freightType: type.value, item: item.value, cbm: cbm.value || "0", weight: weight.value || "0", quantity: isPiece ? units.value : "1" };
    clearTimeout(timer);
    timer = setTimeout(async () => { try {
      const response = await fetch("/admin/quotations/calculate", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.value }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to calculate freight.");
      showError();
      if (type.value === "Sea Freight") {
        put("sea", "category", result.category); put("sea", "tier", result.packageTier); put("sea", "cbm", result.cbm); put("sea", "weight", `${result.weight} kg`); put("sea", "density", `${Number(result.density).toFixed(2)} kg/CBM`); put("sea", "density-rule", result.densityApplies ? "Above 425 kg/CBM — comparison applies" : "Within threshold"); put("sea", "cbm-rate", `${money(result.cbmRate)} / CBM`); put("sea", "density-rate", result.densityRate === null ? "Exempt" : `${money(result.densityRate)} / kg`); put("sea", "base", money(result.base)); put("sea", "density-charge", result.densityRate === null ? "Not applicable" : money(result.densityCharge)); put("sea", "method", result.pricingMethod); put("sea", "total", money(result.final));
      } else {
        const pieces = result.rateBasis === "Per piece"; put("air", "category", result.airCategory); put("air", "rate", `${money(result.rate)} / ${pieces ? "piece" : "kg"}`); put("air", "cbm", pieces ? "Not applicable" : result.cbm); put("air", "weight", pieces ? "Not applicable" : `${result.weight} kg`); put("air", "volumetric", pieces ? "Not applicable" : `${Number(result.volumetricWeight).toFixed(2)} kg`); put("air", "billable", pieces ? "Not applicable" : `${Number(result.billableWeight).toFixed(2)} kg`); put("air", "basis", result.rateBasis); put("air", "units", pieces ? result.quantity : "Not applicable"); put("air", "total", money(result.final));
      }
    } catch (cause) { showError(cause instanceof Error ? cause.message : "Unable to calculate freight."); } }, 180);
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); calculate(); });
  type.addEventListener("change", () => { sync(); calculate(); });
  item.addEventListener("change", () => { sync(); calculate(); });
  [cbm, weight, units].forEach((field) => field.addEventListener("input", calculate));
  sync();
  const fields = ["length", "width", "height", "unit", "quantity"].map((key) => converter.querySelector(`[data-${key}]`));
  const single = converter.querySelector("[data-single]"), total = converter.querySelector("[data-total]"), use = converter.querySelector("[data-use-cbm]"); let converted = null;
  const convert = () => { const [length, width, height, unit, quantity] = fields.map((field) => field.value); const divisor = { mm: 1e9, cm: 1e6, m: 1 }[unit]; const values = [length, width, height, quantity].map(Number); if (!divisor || values.some((value) => !Number.isFinite(value) || value <= 0) || !Number.isInteger(values[3])) { converted = null; single.textContent = total.textContent = "—"; use.disabled = true; return; } const one = values[0] * values[1] * values[2] / divisor; converted = one * values[3]; single.textContent = Number(one.toFixed(6)); total.textContent = Number(converted.toFixed(6)); use.disabled = false; };
  fields.forEach((field) => field.addEventListener(field.tagName === "SELECT" ? "change" : "input", convert)); use.addEventListener("click", () => { if (converted !== null) { cbm.value = Number(converted.toFixed(6)); cbm.focus(); } }); convert();
})();
