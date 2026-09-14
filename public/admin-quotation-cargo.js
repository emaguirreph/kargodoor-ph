(() => {
  const divisors = { mm: 1e9, cm: 1e6, m: 1 };
  const money = (value) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(Number(value || 0));

  document.querySelectorAll("[data-cargo-details]").forEach((section) => {
    const form = section.closest("form");
    if (!form) return;

    const item = section.querySelector('[name="item"]');
    const freight = section.querySelector('select[name="freight_type"]');
    const category = section.querySelector("[data-category-output]");
    const cbm = section.querySelector("[data-cbm-output]");
    const length = section.querySelector('input[name="length"]');
    const width = section.querySelector('input[name="width"]');
    const height = section.querySelector('input[name="height"]');
    const measurement = section.querySelector('select[name="measurement_unit"]');
    const weight = section.querySelector('input[name="weight"]');
    const units = section.querySelector('input[name="units"]');
    const unitsField = section.querySelector("[data-units-field]");
    const seaPricing = form.querySelector("[data-sea-pricing]");
    const airPricing = form.querySelector("[data-air-pricing]");
    const csrf = form.querySelector('input[name="csrf"]');

    let seaCategories = {};
    let airItems = [];

    try {
      seaCategories = JSON.parse(section.dataset.seaCategories || "{}");
      airItems = JSON.parse(section.dataset.airItems || "[]");
    } catch {
      return;
    }

    const updateCategory = () => {
      if (!item || !freight || !category) return;

      if (freight.value === "Sea Freight") {
        category.value = seaCategories[item.value] || "";
      } else {
        category.value = airItems.includes(item.value) ? item.value : "";
      }
    };

    const syncUnits = () => {
      if (!unitsField || !item || !freight) return;
      const itemUsesUnits = ["Mobile phones", "Computers", "Tablets", "Mobile Phones", "Tablets", "Laptop Computers"].includes(item.value);
      unitsField.hidden = !itemUsesUnits;
    };

    const syncPricingPanel = () => {
      if (!freight) return;
      if (seaPricing) seaPricing.hidden = freight.value !== "Sea Freight";
      if (airPricing) airPricing.hidden = freight.value !== "Air Freight";
    };

    const updateItems = () => {
      if (!item || !freight) return;

      const previous = item.value;
      const allowed =
        freight.value === "Sea Freight"
          ? Object.keys(seaCategories)
          : airItems;

      item.replaceChildren();

      allowed.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        item.appendChild(option);
      });

      if (allowed.includes(previous)) {
        item.value = previous;
      }

      updateCategory();
      syncUnits();
      syncPricingPanel();
    };

    const updateCbm = () => {
      if (!cbm || !length || !width || !height || !measurement) return;

      const l = Number(length.value);
      const w = Number(width.value);
      const h = Number(height.value);
      const divisor = divisors[measurement.value];

      if (
        !Number.isFinite(l) ||
        !Number.isFinite(w) ||
        !Number.isFinite(h) ||
        l <= 0 ||
        w <= 0 ||
        h <= 0 ||
        !divisor
      ) {
        cbm.value = "";
        return;
      }

      const total = (l * w * h) / divisor;
      cbm.value = String(Number(total.toFixed(6)));
    };

    const setSea = (key, value) => {
      form.querySelectorAll(`[data-sea-${key}]`).forEach((node) => {
        node.textContent = value;
      });
    };

    const renderSea = (result) => {
      setSea("category", result.category || "—");
      setSea("tier", result.packageTier || "—");
      setSea(
        "density",
        Number.isFinite(Number(result.density))
          ? `${Number(result.density).toFixed(2)} kg/CBM`
          : "—",
      );
      setSea(
        "cbm-rate",
        Number.isFinite(Number(result.cbmRate))
          ? `${money(result.cbmRate)} / CBM`
          : "—",
      );
      setSea(
        "density-rate",
        result.densityRate == null
          ? "Not applicable"
          : `${money(result.densityRate)} / kg`,
      );
      setSea("base", money(result.base));
      setSea(
        "density-charge",
        result.densityRate == null
          ? "Not applicable"
          : money(result.densityCharge),
      );
      setSea("density-applies", result.densityApplies ? "YES" : "NO");
      setSea("pricing-method", result.pricingMethod || "—");
      setSea("system", money(result.final));
    };

    const ensureAirResults = () => {
      let panel = form.querySelector("[data-air-live-results]");
      if (panel) return panel;

      const pricingSection = form.querySelector("[data-air-pricing]");
      if (!pricingSection) return null;

      panel = document.createElement("dl");
      panel.dataset.airLiveResults = "";
      panel.innerHTML = `
        <dt>Air Category</dt><dd data-air-category>—</dd>
        <dt>Total CBM</dt><dd data-air-cbm>—</dd>
        <dt>Actual Weight</dt><dd data-air-weight>—</dd>
        <dt>Volumetric Weight</dt><dd data-air-volumetric>—</dd>
        <dt>Billable Weight</dt><dd data-air-billable>—</dd>
        <dt>Units / Pieces</dt><dd data-air-units>—</dd>
        <dt>Rate</dt><dd data-air-rate>—</dd>
        <dt>Pricing Method</dt><dd data-air-method>—</dd>
        <dt>Total Amount</dt><dd data-air-system>—</dd>
      `;
      pricingSection.appendChild(panel);
      return panel;
    };

    const setAir = (key, value) => {
      const panel = ensureAirResults();
      const node = panel?.querySelector(`[data-air-${key}]`);
      if (node) node.textContent = value;
    };

    const renderAir = (result) => {
      const pieces = result.rateBasis === "Per piece";

      setAir("category", result.airCategory || result.item || "—");
      setAir("cbm", pieces ? "Not applicable" : String(result.cbm ?? "—"));
      setAir(
        "weight",
        pieces ? "Not applicable" : `${result.weight ?? "—"} kg`,
      );
      setAir(
        "volumetric",
        pieces
          ? "Not applicable"
          : `${Number(result.volumetricWeight).toFixed(2)} kg`,
      );
      setAir(
        "billable",
        pieces ? "Not applicable" : `${result.billableWeight} kg`,
      );
      setAir("units", pieces ? String(result.quantity) : "Not applicable");
      setAir(
        "rate",
        pieces
          ? `${money(result.rate)} / piece`
          : `${money(result.rate)} / kg`,
      );
      setAir("method", result.rateBasis || "—");
      setAir("system", money(result.final));
    };

    let timer;

    const calculate = () => {
      updateCategory();

      if (
        !item ||
        !freight ||
        !cbm ||
        !weight ||
        !units ||
        !csrf ||
        !item.value
      ) {
        return;
      }

      const isPieceAir =
        freight.value === "Air Freight" &&
        ["Mobile Phones", "Tablets", "Laptop Computers"].includes(item.value);

      if (freight.value === "Sea Freight") {
        if (!cbm.value || !weight.value) return;
      } else if (isPieceAir) {
        if (!units.value || Number(units.value) < 1) return;
      } else {
        if (!cbm.value || !weight.value) return;
      }

      const payload =
        freight.value === "Sea Freight"
          ? {
              freightType: freight.value,
              item: item.value,
              category: category?.value || "",
              cbm: cbm.value,
              weight: weight.value,
              units: units.value || "0",
            }
          : {
              freightType: freight.value,
              item: item.value,
              cbm: cbm.value || "0",
              weight: weight.value || "0",
              quantity: isPieceAir ? units.value : "1",
            };

      clearTimeout(timer);

      timer = setTimeout(async () => {
        try {
          const response = await fetch("/admin/quotations/calculate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrf.value,
            },
            body: JSON.stringify(payload),
          });

          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "Unable to calculate.");
          }

          if (freight.value === "Sea Freight") {
            renderSea(body);
          } else {
            renderAir(body);
          }
        } catch (error) {
          console.error("Live quotation calculation failed:", error);
        }
      }, 150);
    };

    item?.addEventListener("input", calculate);
    item?.addEventListener("change", calculate);
    freight?.addEventListener("change", () => {
      updateItems();
      calculate();
    });
    length?.addEventListener("input", calculate);
    width?.addEventListener("input", calculate);
    height?.addEventListener("input", calculate);
    measurement?.addEventListener("change", calculate);
    weight?.addEventListener("input", calculate);
    units?.addEventListener("input", calculate);

    const calculateButton = form.querySelector("[data-quotation-calculate]");
    calculateButton?.addEventListener("click", calculate);

    updateItems();
    calculate();
  });
})();

(() => {
  const validPositive = (value) => Number.isFinite(value) && value > 0;
  const formatCbm = (value) => Number(value.toFixed(12)).toString();

  document.querySelectorAll("[data-cargo-details]").forEach((section) => {
    const form = section.closest("form");
    const cbm = section.querySelector("[data-cbm-output]");
    const converter = section.querySelector("[data-cbm-converter]");
    if (!form || !cbm || !converter) return;

    const calculateButton = form.querySelector("[data-quotation-calculate]");
    cbm.addEventListener("input", () => calculateButton?.click());

    const fields = ["length", "width", "height", "unit", "quantity"].map((key) =>
      converter.querySelector(`[data-converter-${key}]`),
    );
    const single = converter.querySelector("[data-converter-single]");
    const total = converter.querySelector("[data-converter-total]");
    const use = converter.querySelector("[data-use-converted-cbm]");
    let convertedTotal = null;
    const update = () => {
      const [length, width, height, unit, quantity] = fields.map((field) => field?.value.trim() || "");
      const values = [length, width, height, quantity].map(Number);
      if (!length || !width || !height || !quantity || !["cm", "mm"].includes(unit) || values.some((value) => !validPositive(value)) || !Number.isInteger(values[3])) {
        convertedTotal = null;
        if (single) single.textContent = "—";
        if (total) total.textContent = "—";
        if (use) use.disabled = true;
        return;
      }
      const divisor = unit === "mm" ? 1e9 : 1e6;
      const singleCbm = (values[0] * values[1] * values[2]) / divisor;
      const totalCbm = singleCbm * values[3];
      if (!Number.isFinite(singleCbm) || !Number.isFinite(totalCbm)) return;
      convertedTotal = totalCbm;
      if (single) single.textContent = formatCbm(singleCbm);
      if (total) total.textContent = formatCbm(totalCbm);
      if (use) use.disabled = false;
    };
    fields.forEach((field) => field?.addEventListener(field.tagName === "SELECT" ? "change" : "input", update));
    use?.addEventListener("click", () => {
      if (convertedTotal === null) return;
      cbm.value = formatCbm(convertedTotal);
      cbm.dispatchEvent(new Event("input", { bubbles: true }));
    });
    update();
  });
})();
