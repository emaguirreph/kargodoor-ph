(() => {
  const format = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value || 0);
  const round2 = (value) => Math.round(value * 100) / 100;
  const guessItem = (description) => /furniture|table|chair|sofa|bookshelf|cabinet|shelf|shelves|rack/i.test(description) ? "Furniture" : "";
  document.querySelectorAll("[data-bulk-intake]").forEach((section) => {
    const rows = section.querySelector("[data-package-rows]"), template = section.querySelector("[data-package-template]"), form = section.querySelector("[data-bulk-form]"), encoded = section.querySelector("[data-package-data]"), add = section.querySelector("[data-add-package]");
    if (!(rows instanceof HTMLElement) || !(template instanceof HTMLTemplateElement) || !(form instanceof HTMLFormElement) || !(encoded instanceof HTMLInputElement) || !(add instanceof HTMLButtonElement)) return;
    const pricing = JSON.parse(section.dataset.pricing || "{}");
    const categories = pricing.itemCategories || {}, rates = pricing.seaRates || {}, transferFee = Number(pricing.transferFee || 0), niHao = pricing.niHao || {};
    // Same rules as seaQuote() in lib/admin/quotation-pricing.ts.
    const kargoDoorCharge = (category, cbm, kg, count) => {
      if (category === "MOBILE / COMPUTERS / TABLETS") return Math.max(1700, cbm * rates[category].cbmRate) + count * 250 + transferFee;
      const rate = rates[category], fixed = cbm <= .01 ? 250 : cbm <= .05 ? 750 : cbm <= .125 ? 1400 : 0;
      const base = fixed || Math.max(1700, cbm * rate.cbmRate), density = kg / cbm > 425 ? kg * rate.densityRate : 0;
      return Math.max(base, density) + transferFee;
    };
    // Same rules as niHaoSeaQuote() in lib/admin/nihao-pricing.ts.
    const niHaoEstimate = (category, cbm, kg) => {
      const rate = niHao.rates[category], p = niHao.packages;
      const base = cbm <= p.mini.maximumCbm ? p.mini.rate : cbm <= p.lite.maximumCbm ? p.lite.rate : cbm <= p.plus.maximumCbm ? cbm * p.plus.rate : cbm * rate.cbmRate;
      const density = rate.densityRate !== null && kg / cbm > niHao.densityThreshold ? kg * rate.densityRate : 0;
      return Math.max(base, density);
    };
    const field = (row, name) => row.querySelector(`[data-${name}]`);
    const calculate = (row) => {
      const description = field(row, "description").value.trim(), catalog = field(row, "catalog"), nihao = field(row, "nihao");
      if (!catalog.value && !catalog.dataset.touched) catalog.value = guessItem(description);
      const category = categories[catalog.value] || "";
      field(row, "category").textContent = category;
      const count = Math.max(1, Math.floor(Number(field(row, "count").value) || 1));
      const [l, w, h] = ["length", "width", "height"].map((name) => Number(field(row, name).value));
      const kg = Number(field(row, "weight").value);
      const cbm = l > 0 && w > 0 && h > 0 ? (l * w * h * count) / 1000000 : 0;
      let charge = 0, estimate = 0;
      if (category && cbm > 0 && kg > 0) { charge = round2(kargoDoorCharge(category, cbm, kg, count)); estimate = round2(niHaoEstimate(category, cbm, kg)); }
      if (!nihao.dataset.typed) nihao.value = estimate ? estimate.toFixed(2) : "";
      const cost = Number(nihao.value) || 0;
      field(row, "nihao-tag").textContent = nihao.dataset.typed && Number(nihao.value) !== estimate ? "Ni Hao quote" : "Estimate";
      field(row, "cbm").textContent = cbm > 0 ? cbm.toFixed(4) : "—";
      field(row, "charge").textContent = charge > 0 ? format(charge) : "—";
      field(row, "profit").textContent = charge > 0 ? format(charge - cost) : "—";
      return { item: description, catalogItem: catalog.value, length: field(row, "length").value, width: field(row, "width").value, height: field(row, "height").value, packageCount: count, weight: field(row, "weight").value, nihaoCost: nihao.dataset.typed ? nihao.value : "", status: field(row, "status").value, charge, cost, cbm, kg };
    };
    const update = () => {
      const lines = [...rows.querySelectorAll("tr")].map((row, index) => { field(row, "line-no").textContent = String(index + 1); return calculate(row); });
      const sum = (key) => lines.reduce((total, line) => total + (Number(line[key]) || 0), 0);
      const charge = sum("charge"), cost = sum("cost"), profit = charge - cost, margin = charge > 0 ? (profit / charge) * 100 : null;
      section.querySelector("[data-total-packages]").textContent = `${lines.length} / ${sum("packageCount")}`;
      section.querySelector("[data-total-size]").textContent = `${sum("cbm").toFixed(3)} / ${round2(sum("kg"))}`;
      section.querySelector("[data-total-charge]").textContent = format(charge);
      section.querySelector("[data-total-nihao]").textContent = format(cost);
      section.querySelector("[data-total-profit]").textContent = format(profit);
      section.querySelector("[data-total-margin]").textContent = margin === null ? "—" : `${margin.toFixed(1)}%`;
      section.querySelector("[data-margin-warning]").hidden = margin === null || margin >= 15;
    };
    const addRow = () => {
      const fragment = template.content.cloneNode(true), row = fragment.querySelector("tr");
      field(row, "nihao").addEventListener("input", (event) => { event.currentTarget.dataset.typed = event.currentTarget.value ? "1" : ""; });
      row.querySelectorAll("input, select").forEach((input) => input.addEventListener("input", update));
      field(row, "catalog").addEventListener("change", (event) => { event.currentTarget.dataset.touched = "1"; update(); });
      field(row, "remove").addEventListener("click", () => { row.remove(); update(); });
      rows.append(fragment); update();
    };
    add.addEventListener("click", addRow); addRow();
    form.addEventListener("submit", (event) => {
      const lines = [...rows.querySelectorAll("tr")].map(calculate);
      if (!lines.length || lines.some((line) => !line.item || !line.catalogItem || !line.length || !line.width || !line.height || !line.weight)) {
        event.preventDefault(); alert("Complete every line: item, item list entry, size and weight."); return;
      }
      encoded.value = JSON.stringify(lines.map(({ item, catalogItem, length, width, height, packageCount, weight, nihaoCost, status }) => ({ item, catalogItem, length, width, height, packageCount, weight, nihaoCost, status })));
    });
  });
})();
