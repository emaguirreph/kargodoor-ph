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
    const packageQuantity = section.querySelector('input[name="package_quantity"]');
    const converterQuantity = section.querySelector('[data-converter-quantity]');
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

    const converterQuantityLabel = converterQuantity?.closest("label");
    const cargoGrid = section.querySelector(":scope > .grid");
    const addressLabel = form.querySelector('[name="address"]')?.closest("label");
    const reflowQuotationHeader = () => {
      form.style.gridTemplateColumns = window.innerWidth <= 760
        ? "1fr"
        : window.innerWidth <= 1080
          ? "repeat(2, minmax(0, 1fr))"
          : "repeat(3, minmax(0, 1fr))";
      if (addressLabel instanceof HTMLElement) {
        addressLabel.classList.remove("wide");
        addressLabel.style.gridColumn = window.innerWidth <= 760 ? "auto" : "span 2";
      }
    };
    window.addEventListener("resize", reflowQuotationHeader);
    reflowQuotationHeader();
    if (cargoGrid) {
      const reflowCargoGrid = () => {
        cargoGrid.style.gridTemplateColumns = window.innerWidth <= 760
          ? "1fr"
          : window.innerWidth <= 1080
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(3, minmax(0, 1fr))";
      };
      window.addEventListener("resize", reflowCargoGrid);
      reflowCargoGrid();
    }
    const freightLabel = freight?.closest("label");
    if (freightLabel && !form.querySelector("[data-freight-section]")) {
      const freightSection = document.createElement("section");
      freightSection.className = "wide freight-and-cbm";
      freightSection.dataset.freightSection = "";
      freightSection.innerHTML = "<h2>FREIGHT TYPE</h2>";
      freightSection.appendChild(freightLabel);
      freightLabel.style.maxWidth = "320px";
      freightLabel.style.marginBottom = "16px";
      const converter = section.querySelector("[data-cbm-converter]");
      if (converter) {
        converter.classList.remove("wide");
        freightSection.appendChild(converter);
      }
      section.before(freightSection);
    }
    if (converterQuantityLabel && cargoGrid && cbm?.closest("label")) {
      converterQuantityLabel.firstChild.textContent = "Quantity of Packages *";
      cargoGrid.insertBefore(converterQuantityLabel, cbm.closest("label").nextSibling);
    }
    const weightLabel = weight?.closest("label");
    if (weightLabel && converterQuantityLabel) {
      cargoGrid?.insertBefore(weightLabel, converterQuantityLabel);
    }
    const descriptionLabel = form.querySelector('[name="description"]')?.closest("label");
    if (descriptionLabel && cargoGrid) cargoGrid.prepend(descriptionLabel);

    const updateCategory = () => {
      if (!item || !freight || !category) return;

      if (freight.value === "Full Container") {
        category.value = "Full Container";
      } else if (freight.value === "Sea Freight") {
        category.value = seaCategories[item.value] || "";
      } else {
        category.value = airItems.includes(item.value) ? item.value : "";
      }
    };

    const syncUnits = () => {
      if (!unitsField || !item || !freight) return;
      const itemUsesUnits = ["Mobile phones", "Computers", "Tablets", "Mobile Phones", "Tablets", "Laptop Computers"].includes(item.value);
      unitsField.hidden = !itemUsesUnits;
      unitsField.style.display = itemUsesUnits ? "" : "none";
    };

    const syncPricingPanel = () => {
      if (!freight) return;
      if (seaPricing) seaPricing.hidden = freight.value !== "Sea Freight";
      if (airPricing) airPricing.hidden = freight.value !== "Air Freight";
    };

    const updateItems = () => {
      if (!item || !freight) return;

      const previous = item.value;
      const allowed = freight.value === "Full Container"
        ? ["Full Container Shipment"]
        : freight.value === "Sea Freight" ? Object.keys(seaCategories) : airItems;

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
      const packages = packageQuantity?.value || section.querySelector("[data-converter-quantity]")?.value || "";
      setSea("package-quantity", packages ? `${packages} package${Number(packages) === 1 ? "" : "s"}` : "—");
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

    const showSeaMessage = (message = "") => {
      if (!seaPricing) return;
      let notice = seaPricing.querySelector("[data-sea-calculation-message]");
      if (!notice) {
        notice = document.createElement("p");
        notice.dataset.seaCalculationMessage = "";
        notice.className = "notice";
        seaPricing.appendChild(notice);
      }
      notice.textContent = message;
      notice.hidden = !message;
    };

    const ensureAirResults = () => {
      let panel = form.querySelector("[data-air-live-results]");
      if (panel) return panel;

      const pricingSection = form.querySelector("[data-air-pricing]");
      if (!pricingSection) return null;

      panel = document.createElement("div");
      panel.dataset.airLiveResults = "";
      panel.innerHTML = `
        <div data-air-pricing-layout>
          <dl><dt>Air Category</dt><dd data-air-category>—</dd><dt>Total CBM</dt><dd data-air-cbm>—</dd><dt>Actual Weight</dt><dd data-air-weight>—</dd></dl>
          <dl><dt>Volumetric Weight (CBM × 167)</dt><dd data-air-volumetric>—</dd><dt>Billable Weight</dt><dd data-air-billable>—</dd><dt>Units / Pieces</dt><dd data-air-units>—</dd><dt>Rate</dt><dd data-air-rate>—</dd></dl>
          <dl><dt>Pricing Method</dt><dd data-air-method>—</dd><div data-air-total-card><strong>Total Amount</strong><span data-air-system>—</span></div></dl>
        </div>
        <p class="notice" data-air-formula hidden></p>
      `;
      const layout = panel.querySelector("[data-air-pricing-layout]");
      if (layout instanceof HTMLElement) {
        const reflow = () => {
          layout.style.display = "grid";
          layout.style.gap = "18px";
          layout.style.gridTemplateColumns = window.innerWidth <= 760 ? "1fr" : "repeat(3, minmax(0, 1fr))";
        };
        window.addEventListener("resize", reflow);
        reflow();
        layout.querySelectorAll("dl").forEach((list) => {
          list.style.gridTemplateColumns = "1fr";
          list.style.margin = "0";
        });
      }
      const totalCard = panel.querySelector("[data-air-total-card]");
      if (totalCard instanceof HTMLElement) {
        totalCard.style.display = "flex";
        totalCard.style.justifyContent = "space-between";
        totalCard.style.alignItems = "center";
        totalCard.style.gap = "12px";
        totalCard.style.background = "#dff5e6";
        totalCard.style.border = "1px solid #8fc8a2";
        totalCard.style.borderRadius = "7px";
        totalCard.style.padding = "10px 12px";
        const amount = totalCard.querySelector("[data-air-system]");
        if (amount instanceof HTMLElement) {
          amount.style.color = "#0b6638";
          amount.style.fontSize = "1.4rem";
          amount.style.fontWeight = "700";
        }
      }
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
      const formula = ensureAirResults()?.querySelector("[data-air-formula]");
      if (formula instanceof HTMLElement) {
        if (pieces) {
          formula.textContent = `Calculation: Total Amount = Quantity × Rate = ${result.quantity} pieces × ${money(result.rate)} per piece = ${money(result.final)}.`;
        } else {
          const volumetric = Number(result.volumetricWeight).toFixed(2);
          formula.textContent = `Calculation: Volumetric Weight = Total CBM × 167 = ${result.cbm} CBM × 167 = ${volumetric} kg. Billable Weight = higher of Actual Weight (${result.weight} kg) and Volumetric Weight (${volumetric} kg) = ${result.billableWeight} kg. Total Amount = Billable Weight × Rate = ${result.billableWeight} kg × ${money(result.rate)} per kg = ${money(result.final)}.`;
        }
        formula.hidden = false;
      }
    };

    const showAirMessage = (message = "") => {
      const pricingSection = form.querySelector("[data-air-pricing]");
      if (!pricingSection) return;
      let notice = pricingSection.querySelector("[data-air-calculation-message]");
      if (!notice) {
        notice = document.createElement("p");
        notice.dataset.airCalculationMessage = "";
        notice.className = "notice";
        pricingSection.appendChild(notice);
      }
      notice.textContent = message;
      notice.hidden = !message;
    };

    let timer;

    const calculate = () => {
      updateCategory();

      if (freight?.value === "Full Container") return;

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
        if (!cbm.value || !weight.value) {
          showSeaMessage("Enter both Total CBM and Actual Weight to calculate Sea Freight.");
          return;
        }
      } else if (isPieceAir) {
        if (!units.value || Number(units.value) < 1) {
          showAirMessage("Enter Units (at least 1) for per-piece Air pricing.");
          return;
        }
      } else {
        if (!cbm.value || !weight.value) {
          showAirMessage("Enter both Total CBM and Actual Weight to calculate Air Freight.");
          return;
        }
      }
      if (freight.value === "Sea Freight") showSeaMessage();
      else showAirMessage();

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
          const message = error instanceof Error ? error.message : "Unable to calculate quotation.";
          if (freight.value === "Sea Freight") showSeaMessage(message);
          else showAirMessage(message);
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
    cbm?.addEventListener("input", calculate);
    weight?.addEventListener("input", calculate);
    units?.addEventListener("input", calculate);
    packageQuantity?.addEventListener("input", calculate);

    const calculateButton = form.querySelector("[data-quotation-calculate]");
    calculateButton?.addEventListener("click", calculate);
    calculateButton?.remove();

    updateItems();
    calculate();
  });
})();

(() => {
  const groups = [
    ["Category", "Quantity of Packages", "Package Tier", "CBM Price", "Fixed / Base Charge"],
    ["Actual Density (kg/CBM)", "Density Rate / kg", "Density-Based Charge", "Density Rule Applies?"],
    ["Pricing Method", "Total Unit Amount"],
  ];
  document.querySelectorAll("[data-sea-pricing]").forEach((panel) => {
    const list = panel.querySelector("dl");
    if (!list) return;
    const pairs = new Map();
    for (const dt of list.querySelectorAll("dt")) pairs.set(dt.textContent?.trim(), [dt, dt.nextElementSibling]);
    const layout = document.createElement("div");
    layout.style.display = "grid";
    layout.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
    layout.style.gap = "18px";
    groups.forEach((labels, index) => {
      const group = document.createElement("dl");
      group.style.gridTemplateColumns = "1fr";
      group.style.margin = "0";
      labels.forEach((label) => pairs.get(label)?.forEach((node) => node && group.appendChild(node)));
      if (index === 0) group.dataset.seaPricingGroup = "cargo";
      layout.appendChild(group);
    });
    list.replaceWith(layout);
    const stack = () => { layout.style.gridTemplateColumns = window.innerWidth <= 760 ? "1fr" : "repeat(3, minmax(0, 1fr))"; };
    window.addEventListener("resize", stack);
    stack();
  });
})();

(() => {
  document.querySelectorAll("[data-cbm-converter]").forEach((converter) => {
    converter.style.background = "#edf9f1";
    converter.style.borderColor = "#8fc8a2";
    converter.style.padding = "12px";
    converter.style.margin = "0";
    const description = converter.querySelector("p.muted");
    if (description) {
      description.textContent = "Optional — L × W × H × package quantity.";
      description.style.margin = "0 0 8px";
    }
    const heading = converter.querySelector("h3");
    if (heading) {
      heading.textContent = "CBM CALCULATOR";
      heading.style.margin = "0 0 4px";
      heading.style.fontSize = "1rem";
    }
    const grid = converter.querySelector(".grid");
    if (grid) {
      grid.style.gap = "8px";
      const reflow = () => { grid.style.gridTemplateColumns = window.innerWidth <= 760 ? "1fr" : "repeat(4, minmax(0, 1fr))"; };
      window.addEventListener("resize", reflow);
      reflow();
    }
    const results = converter.querySelector("dl");
    if (results) {
      results.style.display = "flex";
      results.style.flexWrap = "wrap";
      results.style.gap = "6px 18px";
      results.style.margin = "12px 0 0";
      results.querySelector("dt").textContent = "Single CBM";
      results.querySelector("dt + dd").style.margin = "0";
      results.querySelector("dt + dd + dt").textContent = "Total CBM";
      results.querySelector("dt + dd + dt + dd").style.margin = "0";
    }
    const checkbox = converter.querySelector(".checkbox");
    if (checkbox) {
      checkbox.style.marginTop = "8px";
      checkbox.style.fontSize = ".9rem";
    }
  });
})();

(() => {
  document.querySelectorAll("[data-sea-system], [data-air-system]").forEach((total) => {
    const label = total.previousElementSibling;
    if (!(label instanceof HTMLElement) || !(total instanceof HTMLElement)) return;
    const parent = total.parentElement;
    if (!parent) return;
    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.justifyContent = "space-between";
    card.style.gap = "12px";
    card.style.gridColumn = "1 / -1";
    card.style.background = "#dff5e6";
    card.style.border = "1px solid #8fc8a2";
    card.style.borderRadius = "7px";
    card.style.padding = "10px 12px";
    card.append(label, total);
    parent.appendChild(card);
    label.style.margin = "0";
    total.style.margin = "0";
    total.style.color = "#0b6638";
    total.style.fontSize = "1.4rem";
    total.style.fontWeight = "700";
  });
})();

(() => {
  document.querySelectorAll('select[name="origin_warehouse"]').forEach((warehouse) => {
    const current = warehouse.value;
    const known = [...warehouse.options].some((option) => option.value === current);
    if (!warehouse.querySelector('option[value="Other / enter manually"]')) warehouse.add(new Option("Other / enter manually", "Other / enter manually"));
    const manual = document.createElement("label");
    manual.textContent = "Manual warehouse / location";
    manual.hidden = known;
    manual.style.display = known ? "none" : "";
    manual.innerHTML += '<input name="origin_warehouse_manual" maxlength="160">';
    warehouse.closest("label")?.after(manual);
    const input = manual.querySelector("input");
    if (!known && input) { warehouse.value = "Other / enter manually"; input.value = current; }
    warehouse.addEventListener("change", () => { const visible = warehouse.value === "Other / enter manually"; manual.hidden = !visible; manual.style.display = visible ? "" : "none"; if (visible) input?.focus(); });
  });
})();

(() => {
  const defaultTerms = `This quotation is based on the cargo information provided. Final charges may change if the actual dimensions, CBM, weight, quantity, cargo category, or other shipment details differ upon warehouse inspection.

Rates and transit times are estimates and are subject to final warehouse confirmation. Additional charges may apply for special handling, restricted or regulated cargo, permits, taxes, or other government requirements.

Incoterm: FCA - KargoDoor Origin Warehouse
Service Coverage: Origin Warehouse > Manila Customs Clearance > KargoDoor Metro Manila Warehouse`;
  document.querySelectorAll('textarea[name="notes"]').forEach((notes) => {
    const label = notes.closest("label");
    if (label?.firstChild?.nodeType === Node.TEXT_NODE) label.firstChild.textContent = "Terms and Conditions";
    if (notes.form?.querySelector('input[name="action"]')?.value === "save" && !notes.value.trim()) notes.value = defaultTerms;
  });
})();

(() => {
  document.querySelectorAll("[data-cargo-details]").forEach((section) => {
    const form = section.closest("form");
    const freight = section.querySelector('select[name="freight_type"]');
    const item = section.querySelector('select[name="item"]');
    const cbm = section.querySelector('[name="cbm"]');
    const weight = section.querySelector('[name="weight"]');
    const converter = section.querySelector("[data-cbm-converter]");
    if (!form || !freight || !item) return;
    const fclMode = new URLSearchParams(location.search).get("fcl") === "1";
    const savedFullContainer = form.querySelector("[data-sea-pricing-method]")?.textContent?.trim() === "Manual full-container all-in rate";
    if ((fclMode || savedFullContainer) && ![...freight.options].some((option) => option.value === "Full Container")) freight.add(new Option("Full Container", "Full Container"));
    if (fclMode) freight.value = "Full Container";
    if (savedFullContainer) freight.value = "Full Container";
    if (fclMode) {
      document.title = "FCL Quotation | KargoDoor Admin";
      const heading = form.closest("section")?.querySelector("h2");
      if (heading) heading.textContent = "Create FCL quotation";
      ["item", "cbm", "weight", "units", "override_amount", "override_reason"].forEach((name) => form.querySelector(`[name="${name}"]`)?.closest("label")?.toggleAttribute("hidden", true));
      form.querySelector("[data-sea-pricing]")?.toggleAttribute("hidden", true);
      form.querySelector("[data-air-pricing]")?.toggleAttribute("hidden", true);
      form.querySelector("[data-cbm-converter]")?.toggleAttribute("hidden", true);
    }
    const fields = document.createElement("section");
    fields.className = "wide";
    fields.dataset.fullContainerFields = "";
    fields.innerHTML = '<h3>FULL CONTAINER DETAILS</h3><div class="grid"><label>Container size<select name="container_size"><option>20 ft</option><option>40 ft</option><option>40 ft HQ</option></select></label><label>Number of containers<input name="container_quantity" type="number" min="1" step="1" value="1"></label><label>All-in rate (PHP)<input name="manual_rate" type="number" min="0" step=".01"></label></div><p class="muted">Full-container quotes use a manual all-in rate. CBM and package measurements are not required.</p>';
    const containerSize = fields.querySelector('[name="container_size"]');
    const containerQuantity = fields.querySelector('[name="container_quantity"]');
    const manualRate = fields.querySelector('[name="manual_rate"]');
    if (containerSize && converter?.dataset.containerSize) containerSize.value = converter.dataset.containerSize;
    if (containerQuantity && converter?.dataset.containerQuantity) containerQuantity.value = converter.dataset.containerQuantity;
    if (manualRate && savedFullContainer) manualRate.value = form.querySelector("[data-sea-system]")?.textContent?.trim() || "";
    section.after(fields);
    const setFieldVisibility = (field, visible) => {
      const wrapper = field?.closest("label");
      if (!wrapper) return;
      wrapper.hidden = !visible;
      // The regular Sea/Air synchronizer may also touch these labels. Keep
      // the FCL-only fields decisively out of the layout in this mode.
      wrapper.style.setProperty("display", visible ? "" : "none", visible ? "" : "important");
    };
    const setNodeVisibility = (node, visible) => {
      if (!node) return;
      node.hidden = !visible;
      node.style.setProperty("display", visible ? "" : "none", visible ? "" : "important");
    };
    const sync = () => {
      const full = freight.value === "Full Container";
      fields.hidden = !full;
      [containerSize, containerQuantity, manualRate].forEach((field) => {
        if (field) field.disabled = !full;
      });
      const calculateButton = form.querySelector("[data-quotation-calculate]");
      setNodeVisibility(calculateButton, !full);
      setNodeVisibility(form.querySelector("p.wide.muted"), !full);
      ["override_amount", "override_reason"].forEach((name) => setFieldVisibility(form.querySelector(`[name="${name}"]`), !full));
      if (full) {
        if (![...item.options].some((option) => option.value === "Full Container Shipment")) item.add(new Option("Full Container Shipment", "Full Container Shipment"));
        item.value = "Full Container Shipment";
        if (cbm) { cbm.value = "0"; cbm.required = false; }
        if (weight) { weight.value = "0"; weight.required = false; }
        setFieldVisibility(cbm, false);
        setFieldVisibility(weight, false);
        section.querySelectorAll(".cbm-converter").forEach((node) => { node.hidden = true; node.style.display = "none"; });
      } else {
        if (cbm) cbm.required = true;
        if (weight) weight.required = true;
        setFieldVisibility(cbm, true);
        setFieldVisibility(weight, true);
        section.querySelectorAll(".cbm-converter").forEach((node) => { node.hidden = false; node.style.display = ""; });
      }
    };
    freight.addEventListener("change", sync);
    sync();
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
    const update = () => {
      const [length, width, height, unit, quantity] = fields.map((field) => field?.value.trim() || "");
      const values = [length, width, height, quantity].map(Number);
      if (!length || !width || !height || !quantity || !["cm", "mm", "m"].includes(unit) || values.some((value) => !validPositive(value)) || !Number.isInteger(values[3])) {
        if (single) single.textContent = "—";
        if (total) total.textContent = "—";
        return;
      }
      const divisor = unit === "mm" ? 1e9 : unit === "cm" ? 1e6 : 1;
      const singleCbm = (values[0] * values[1] * values[2]) / divisor;
      const totalCbm = singleCbm * values[3];
      if (!Number.isFinite(singleCbm) || !Number.isFinite(totalCbm)) return;
      if (single) single.textContent = formatCbm(singleCbm);
      if (total) total.textContent = formatCbm(totalCbm);
    };
    fields.forEach((field) => field?.addEventListener(field.tagName === "SELECT" ? "change" : "input", update));
    update();
  });
})();
