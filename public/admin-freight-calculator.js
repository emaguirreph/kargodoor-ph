(() => {
  const form = document.querySelector("[data-freight-calculator]");
  const quick = document.querySelector("[data-quick-input]");
  if (!form || !quick) return;

  let seaItems, airItems;
  try {
    seaItems = JSON.parse(form.dataset.seaItems || "{}");
    airItems = JSON.parse(form.dataset.airItems || "[]");
  } catch { return; }

  const type = form.querySelector("[data-freight-type]");
  const item = form.querySelector("[data-item]");
  const category = form.querySelector("[data-category]");
  const cbm = form.querySelector("[data-cbm]");
  const weight = form.querySelector("[data-weight]");
  const units = form.querySelector("[data-units]");
  const unitsField = form.querySelector("[data-units-field]");
  const csrf = form.querySelector("[data-csrf]");
  const error = form.querySelector("[data-calculator-error]");
  const sea = document.querySelector("[data-sea-results]");
  const air = document.querySelector("[data-air-results]");
  const seaRules = document.querySelector("[data-sea-rules]");
  const airRules = document.querySelector("[data-air-rules]");
  const source = quick.querySelector("[data-quick-text]");
  const notice = quick.querySelector("[data-extraction-notice]");
  const rows = quick.querySelector("[data-package-rows]");
  const review = quick.querySelectorAll("[data-package-review]");
  const createQuotation = document.querySelector("[data-create-quotation]");
  const createQuotationButton = document.querySelector("[data-create-quotation-button]");
  const extractedContact = document.querySelector("[data-extracted-contact]");

  const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value || 0));
  const put = (group, key, value) => { const node = document.querySelector(`[data-${group}-${key}]`); if (node) node.textContent = value; };
  const showError = (message = "") => { error.textContent = message; error.hidden = !message; };
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

  let timer;
  const calculate = () => {
    const isPiece = type.value === "Air Freight" && pieceItem();
    if ((!isPiece && (!cbm.value || !weight.value)) || (isPiece && Number(units.value) < 1)) return showError(isPiece ? "Enter at least one piece." : "Enter both Total CBM and Actual Weight.");
    const payload = type.value === "Sea Freight"
      ? { freightType: type.value, item: item.value, category: category.value, cbm: cbm.value, weight: weight.value, units: units.value || "0" }
      : { freightType: type.value, item: item.value, cbm: cbm.value || "0", weight: weight.value || "0", quantity: isPiece ? units.value : "1" };
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const response = await fetch("/admin/quotations/calculate", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.value }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to calculate freight.");
        showError();
        if (type.value === "Sea Freight") {
          put("sea", "category", result.category); put("sea", "tier", result.packageTier); put("sea", "cbm", result.cbm); put("sea", "weight", `${result.weight} kg`);
          put("sea", "density", `${Number(result.density).toFixed(2)} kg/CBM`); put("sea", "density-rule", result.densityApplies ? "Above 425 kg/CBM — comparison applies" : "Within threshold");
          put("sea", "cbm-rate", `${money(result.cbmRate)} / CBM`); put("sea", "density-rate", result.densityRate === null ? "Exempt" : `${money(result.densityRate)} / kg`);
          put("sea", "base", money(result.base)); put("sea", "density-charge", result.densityRate === null ? "Not applicable" : money(result.densityCharge)); put("sea", "method", result.pricingMethod); put("sea", "total", money(result.final));
        } else {
          const pieces = result.rateBasis === "Per piece";
          put("air", "category", result.airCategory); put("air", "rate", `${money(result.rate)} / ${pieces ? "piece" : "kg"}`); put("air", "cbm", pieces ? "Not applicable" : result.cbm); put("air", "weight", pieces ? "Not applicable" : `${result.weight} kg`);
          put("air", "volumetric", pieces ? "Not applicable" : `${Number(result.volumetricWeight).toFixed(2)} kg`); put("air", "billable", pieces ? "Not applicable" : `${Number(result.billableWeight).toFixed(2)} kg`); put("air", "basis", result.rateBasis); put("air", "units", pieces ? result.quantity : "Not applicable"); put("air", "total", money(result.final));
        }
      } catch (cause) { showError(cause instanceof Error ? cause.message : "Unable to calculate freight."); }
    }, 180);
  };

  const createRow = (group = {}) => {
    const tr = document.createElement("tr");
    const fields = [["product", "text"], ["quantity", "number"], ["length", "number"], ["width", "number"], ["height", "number"], ["weight", "number"]];
    tr.innerHTML = fields.map(([key, inputType]) => `<td><input data-package-${key} type="${inputType}" min="0" step="any" value="${group[key] || ""}"></td>`).join("") + '<td><button type="button" data-remove-package>Remove</button></td>';
    return tr;
  };
  const flag = (message) => { notice.textContent = message; notice.hidden = !message; };
  const unitFactor = (unit) => unit.toLowerCase() === "m" ? 100 : unit.toLowerCase() === "mm" ? 0.1 : 1;
  const packageQuantity = (text) => Number((text.match(/(\d+(?:\.\d+)?)\s*(?:cartons?|ctns?|boxes?|packages?|p(?:cs|ieces)?)/i) || [])[1] || 1);
  const productFor = (text) => ([...item.options].find((option) => text.toLowerCase().includes(option.value.toLowerCase())) || {}).value || "";
  const contactFor = (text) => {
    const labelled = (label) => ((text.match(new RegExp(`(?:^|[\\n,;])\\s*${label}\\s*[:\\-]\\s*([^\\n,;]+`, "i")) || [])[1] || "").trim();
    return { name: labelled("(?:customer\\s*)?name"), company: labelled("company"), email: (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i) || [])[0] || "", mobile: (text.match(/(?:\\+63|0)9\\d{9}/) || [])[0] || "" };
  };

  quick.querySelector("[data-extract-details]").addEventListener("click", () => {
    const text = source.value.trim();
    if (!text) return flag("Paste shipment details first.");
    const groups = [];
    const dimensions = /(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)(?:\s*(cm|mm|m))?/gi;
    for (const match of text.replace(/\r/g, "\n").matchAll(dimensions)) {
      const start = match.index || 0;
      const nearby = text.slice(Math.max(0, start - 100), start + match[0].length + 180);
      const foundWeight = nearby.match(/(?:gross\s*)?(?:weight|wt\.?|gw)?\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(?:kgs?|kilograms?)/i);
      if (!foundWeight) continue;
      const factor = unitFactor(match[4] || "cm");
      groups.push({ product: productFor(nearby), quantity: packageQuantity(nearby), length: Number(match[1]) * factor, width: Number(match[2]) * factor, height: Number(match[3]) * factor, weight: Number(foundWeight[1]) });
    }
    rows.replaceChildren(...groups.map(createRow));
    review.forEach((node) => { node.hidden = !groups.length; });
    if (!groups.length) return flag("No complete package details found. Include dimensions such as “60 × 50 × 40 cm” and a weight such as “35 kg”.");
    const lower = text.toLowerCase();
    if (/\bair(?:\s+freight|\s+cargo)?\b/.test(lower)) type.value = "Air Freight";
    else if (/\bsea(?:\s+freight)?\b|\bocean\b/.test(lower)) type.value = "Sea Freight";
    sync();
    const selectedProduct = productFor(text);
    if (selectedProduct) { item.value = selectedProduct; sync(); }
    const totals = groups.reduce((sum, group) => ({ cbm: sum.cbm + group.quantity * group.length * group.width * group.height / 1e6, weight: sum.weight + group.quantity * group.weight }), { cbm: 0, weight: 0 });
    cbm.value = totals.cbm.toFixed(6).replace(/\.?0+$/, "");
    weight.value = totals.weight.toFixed(2).replace(/\.?0+$/, "");
    const contact = contactFor(text);
    extractedContact.hidden = false;
    extractedContact.textContent = contact.name ? `Customer: ${contact.name}${contact.mobile ? ` · ${contact.mobile}` : ""}${contact.email ? ` · ${contact.email}` : ""}` : "Customer name was not found. Add “Name: …” to create a draft quotation.";
    createQuotation.hidden = false;
    createQuotationButton.disabled = !contact.name;
    flag(`Extracted ${groups.length} package group${groups.length === 1 ? "" : "s"}: ${cbm.value} CBM and ${weight.value} kg. Review or edit the package details, then calculate.`);
    calculate();
  });
  quick.querySelector("[data-add-package]").addEventListener("click", () => rows.append(createRow()));
  rows.addEventListener("click", (event) => { const button = event.target.closest("[data-remove-package]"); if (button) button.closest("tr").remove(); });
  quick.querySelector("[data-apply-packages]").addEventListener("click", () => {
    let totalCbm = 0, totalWeight = 0, valid = rows.children.length > 0;
    rows.querySelectorAll("tr").forEach((tr) => {
      const value = (key) => Number(tr.querySelector(`[data-package-${key}]`).value);
      const [quantity, length, width, height, eachWeight] = ["quantity", "length", "width", "height", "weight"].map(value);
      if (![quantity, length, width, height, eachWeight].every((number) => Number.isFinite(number) && number > 0)) valid = false;
      else { totalCbm += quantity * length * width * height / 1e6; totalWeight += quantity * eachWeight; }
    });
    if (!valid) return flag("Every package group needs quantity, dimensions, and weight before totals can be used.");
    cbm.value = totalCbm.toFixed(6).replace(/\.?0+$/, ""); weight.value = totalWeight.toFixed(2).replace(/\.?0+$/, "");
    flag(`Reviewed totals applied: ${cbm.value} CBM and ${weight.value} kg.`); calculate();
  });
  createQuotationButton.addEventListener("click", () => {
    const contact = contactFor(source.value);
    if (!contact.name) return;
    const first = rows.querySelector("tr");
    const value = (key) => first?.querySelector(`[data-package-${key}]`)?.value || "";
    const fields = { action: "save", csrf: csrf.value, status: "Draft", quotation_date: new Date().toISOString().slice(0, 10), customer_name: contact.name, company: contact.company, mobile: contact.mobile, email: contact.email, address: "", description: source.value.trim(), item: item.value, freight_type: type.value, cbm: cbm.value, weight: weight.value, units: units.value || "0", package_quantity: value("quantity") || "1", calculator_quantity: value("quantity") || "1", length: value("length"), width: value("width"), height: value("height"), measurement_unit: "cm", show_package_dimensions: "1", notes: "Created from Freight Calculator" };
    const draft = document.createElement("form");
    draft.method = "post"; draft.action = "/admin/quotations";
    Object.entries(fields).forEach(([name, fieldValue]) => { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = String(fieldValue); draft.append(input); });
    document.body.append(draft); draft.submit();
  });

  form.addEventListener("submit", (event) => { event.preventDefault(); calculate(); });
  type.addEventListener("change", () => { sync(); calculate(); });
  item.addEventListener("change", () => { sync(); calculate(); });
  [cbm, weight, units].forEach((field) => field.addEventListener("input", calculate));
  sync();
})();

(() => {
  const root = document.querySelector("section[data-freight-calculator]");
  const form = document.querySelector("form[data-freight-calculator]");
  const quick = document.querySelector("[data-quick-input]");
  if (!root || !form || !quick) return;
  let seaRates, airRates, packageRates;
  try {
    seaRates = JSON.parse(root.dataset.nihaoSea || "{}");
    airRates = Object.fromEntries(JSON.parse(root.dataset.nihaoAir || "[]"));
    packageRates = JSON.parse(root.dataset.nihaoPackage || "{}");
  } catch { return; }
  const type = form.querySelector("[data-freight-type]");
  const item = form.querySelector("[data-item]");
  const category = form.querySelector("[data-category]");
  const cbm = form.querySelector("[data-cbm]");
  const weight = form.querySelector("[data-weight]");
  const units = form.querySelector("[data-units]");
  const rate = document.querySelector("[data-nihao-rate]");
  const rows = quick.querySelector("[data-package-rows]");
  const put = (key, value) => { const node = document.querySelector(`[data-profit-${key}]`); if (node) node.textContent = value; };
  const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value || 0));
  const clientAmount = () => Number((document.querySelector(type.value === "Sea Freight" ? "[data-sea-total]" : "[data-air-total]")?.textContent || "").replace(/[^0-9.-]/g, ""));
  const packageCount = () => [...rows.querySelectorAll("tr")].reduce((sum, row) => sum + Number(row.querySelector("[data-package-quantity]")?.value || 0), 0) || Math.max(1, Number(units.value) || 1);
  const setRate = () => {
    const categoryRate = seaRates[category.value];
    const next = type.value === "Air Freight" ? airRates[item.value] : categoryRate?.cbmRate;
    if (next !== undefined) rate.value = next;
  };
  const update = () => {
    const client = clientAmount();
    const baseRate = Number(rate.value);
    if (!Number.isFinite(client) || !Number.isFinite(baseRate) || baseRate < 0) return;
    let cost, basis;
    if (type.value === "Air Freight") {
      const pieces = ["Mobile Phones", "Tablets", "Laptop Computers"].includes(item.value);
      const amount = pieces ? Number(units.value) : Math.ceil(Math.max(Number(weight.value), Number(cbm.value) * 167));
      if (!Number.isFinite(amount) || amount <= 0) return;
      cost = baseRate * amount;
      basis = `${money(baseRate)} / ${pieces ? "piece" : "billable kg"}`;
    } else {
      const volume = Number(cbm.value), actualWeight = Number(weight.value), supplier = seaRates[category.value];
      if (!supplier || !Number.isFinite(volume) || volume <= 0 || !Number.isFinite(actualWeight) || actualWeight < 0) return;
      const count = packageCount();
      if (volume <= packageRates.mini.maximumCbm) { cost = count * packageRates.mini.rate; basis = `Ni Hao Mini · ${count} package${count === 1 ? "" : "s"}`; }
      else if (volume <= packageRates.lite.maximumCbm) { cost = count * packageRates.lite.rate; basis = `Ni Hao Lite · ${count} package${count === 1 ? "" : "s"}`; }
      else if (volume <= packageRates.plus.maximumCbm) { cost = volume * packageRates.plus.rate; basis = `Ni Hao Plus · ${money(packageRates.plus.rate)} / CBM`; }
      else { cost = volume * baseRate; basis = `Ni Hao Standard · ${money(baseRate)} / CBM`; }
      const densityCharge = supplier.densityRate === null ? 0 : actualWeight * supplier.densityRate;
      if (supplier.densityRate !== null && actualWeight / volume > Number(root.dataset.nihaoDensityThreshold || 500) && densityCharge > cost) {
        cost = densityCharge;
        basis = `Ni Hao density · ${money(supplier.densityRate)} / kg`;
      }
    }
    const gross = client - cost;
    put("client", money(client)); put("basis", basis); put("nihao", money(cost)); put("gross", money(gross)); put("margin", `${(client ? gross / client * 100 : 0).toFixed(2)}%`);
    const perCbm = document.querySelector("[data-profit-cbm-field]");
    if (perCbm) perCbm.hidden = type.value !== "Sea Freight" || !Number(cbm.value);
    if (type.value === "Sea Freight" && Number(cbm.value)) put("per-cbm", money(gross / Number(cbm.value)));
  };
  type.addEventListener("change", () => { setRate(); setTimeout(update); });
  item.addEventListener("change", () => { setRate(); setTimeout(update); });
  [rate, cbm, weight, units].forEach((field) => field.addEventListener("input", update));
  new MutationObserver(update).observe(document.querySelector("[data-sea-results]"), { subtree: true, childList: true, characterData: true });
  new MutationObserver(update).observe(document.querySelector("[data-air-results]"), { subtree: true, childList: true, characterData: true });
  setRate();
})();
