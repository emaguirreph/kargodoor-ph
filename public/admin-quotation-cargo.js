(() => {
  const divisors = { mm: 1e9, cm: 1e6, m: 1 };

  document.querySelectorAll("[data-cargo-details]").forEach((section) => {
    const form = section.closest("form");
    if (!form) return;

    const item = section.querySelector('select[name="item"]');
    const freight = section.querySelector('select[name="freight_type"]');
    const category = section.querySelector("[data-category-output]");
    const cbm = section.querySelector("[data-cbm-output]");
    const length = section.querySelector('input[name="length"]');
    const width = section.querySelector('input[name="width"]');
    const height = section.querySelector('input[name="height"]');
    const measurement = section.querySelector('select[name="measurement_unit"]');

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

    item?.addEventListener("change", updateCategory);
    freight?.addEventListener("change", updateItems);
    length?.addEventListener("input", updateCbm);
    width?.addEventListener("input", updateCbm);
    height?.addEventListener("input", updateCbm);
    measurement?.addEventListener("change", updateCbm);

    updateItems();
    updateCbm();
  });
})();
