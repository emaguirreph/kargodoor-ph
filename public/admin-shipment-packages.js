// Shipment form: "+ Add another package". With two or more packages the
// Declared CBM and weight become their totals (read-only). Back to one
// package, the rows go away and Declared CBM / weight are typed as before.
// Saving re-checks everything on the server.
(() => {
  const box = document.querySelector("[data-shipment-packages]");
  const form = box?.closest("form");
  if (!box || !form) return;

  const rows = box.querySelector("[data-package-rows]");
  const template = box.querySelector("[data-package-template]");
  const total = box.querySelector("[data-packages-total]");
  const hint = box.querySelector("[data-packages-hint]");
  const addButton = box.querySelector("[data-package-add]");
  const cbmField = form.querySelector('[name="cbm"]');
  const weightField = form.querySelector('[name="weight_kg"]');
  const max = Number(box.dataset.max || 100);
  const round = (value, places) => Number(value.toFixed(places));
  const value = (row, name) => {
    const raw = row.querySelector(`[name="${name}"]`)?.value.trim() || "";
    return raw === "" ? null : Number(raw);
  };
  const list = () => [...rows.querySelectorAll("[data-package-row]")];

  const lock = (on) => {
    for (const field of [cbmField, weightField]) {
      if (!field) continue;
      field.readOnly = on;
      field.classList.toggle("k-readonly", on);
      field.title = on ? "Total of the packages below" : "";
    }
  };

  const recalc = () => {
    const items = list();
    items.forEach((row, index) => {
      const number = row.querySelector("[data-package-number]");
      if (number) number.textContent = `Package ${index + 1}`;
      const [l, w, h] = ["pkg_length", "pkg_width", "pkg_height"].map((name) => value(row, name));
      const cbm = row.querySelector("[data-package-cbm]");
      if (cbm) {
        const sized = l > 0 && w > 0 && h > 0;
        if (sized) cbm.value = String(round((l * w * h) / 1e6, 6));
        cbm.readOnly = sized;
      }
    });
    const many = items.length >= 2;
    lock(many);
    total.hidden = !many;
    addButton.hidden = items.length >= max;
    if (!many) {
      hint.textContent = "One package. Cargo in more than one carton? Add each package so the totals add up.";
      return;
    }
    const cbm = round(items.reduce((sum, row) => sum + (value(row, "pkg_cbm") || 0), 0), 6);
    const weight = round(items.reduce((sum, row) => sum + (value(row, "pkg_weight") || 0), 0), 3);
    hint.textContent = `${items.length} packages. Declared CBM and weight are their totals.`;
    total.textContent = `Total: ${items.length} packages · ${cbm} CBM · ${weight} kg`;
    for (const [field, next] of [[cbmField, cbm], [weightField, weight]]) {
      if (!field || field.value === String(next)) continue;
      field.value = String(next);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const addRow = (values = {}) => {
    const row = template.content.firstElementChild.cloneNode(true);
    for (const [name, v] of Object.entries(values)) {
      const input = row.querySelector(`[name="${name}"]`);
      if (input && v !== "" && v !== null && v !== undefined) input.value = v;
    }
    rows.append(row);
    return row;
  };

  addButton.addEventListener("click", () => {
    // Going from one package to two: the first package keeps what Declared CBM / weight already say.
    if (!list().length) addRow({ pkg_cbm: cbmField?.value.trim(), pkg_weight: weightField?.value.trim() });
    addRow().querySelector("input")?.focus();
    recalc();
  });

  rows.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-package-remove]");
    if (!remove) return;
    remove.closest("[data-package-row]")?.remove();
    const left = list();
    if (left.length === 1) {
      // Back to one package: its numbers go into Declared CBM / weight, and the row goes away.
      const cbm = value(left[0], "pkg_cbm"), weight = value(left[0], "pkg_weight");
      left[0].remove();
      for (const [field, next] of [[cbmField, cbm], [weightField, weight]]) {
        if (!field || next === null) continue;
        field.value = String(next);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    recalc();
  });

  rows.addEventListener("input", recalc);
  recalc();
})();
