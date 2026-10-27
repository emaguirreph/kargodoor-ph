// Shipment form: fills the category from the Item / Commodity and keeps the
// KargoDoor charge and Ni Hao cost up to date while the admin types. A box the
// admin typed into is left alone; an empty box, or one still holding the last
// automatic amount, follows the rates. Saving re-checks everything on the server.
(() => {
  const form = document.querySelector('form [name="nihao_cost"]')?.closest("form");
  if (!form) return;

  const field = (name) => form.querySelector(`[name="${name}"]`);
  const service = field("service_type");
  const item = form.querySelector("[data-shipment-cargo-item]");
  const category = form.querySelector("[data-shipment-cargo-category]");
  let seaCategories = {};
  try {
    seaCategories = JSON.parse(item?.dataset.seaCategories || "{}");
  } catch {
    seaCategories = {};
  }

  const syncCategory = () => {
    if (!item || !category) return;
    const type = service ? service.value : "";
    item.querySelectorAll("optgroup").forEach((group) => {
      const on = !type || group.dataset.service === type;
      group.disabled = !on;
      group.hidden = !on;
    });
    if (item.selectedOptions[0]?.parentElement?.disabled) item.value = "";
    category.value =
      type === "Sea Freight" ? seaCategories[item.value] || "" : type === "Air Freight" ? item.value : "";
  };

  const inputs = ["service_type", "cbm", "weight_kg", "verified_cbm", "verified_weight_kg", "cargo_item", "cargo_quantity", "tracking_remarks"];
  let timer = 0;
  let request = 0;

  const apply = (key, result) => {
    const box = form.querySelector(`[data-live-amount="${key}"]`);
    const hint = form.querySelector(`[data-live-hint="${key}"]`);
    if (!box) return;
    const following = box.value.trim() === "" || box.dataset.auto === box.value.trim();
    if (result && following) {
      box.value = result.amount;
      box.dataset.auto = result.amount;
    }
    if (hint) {
      hint.textContent = result
        ? `${key === "nihao" ? "Auto from Ni Hao rates" : "From KargoDoor rates"}: ${result.label}.${following ? "" : " You typed your own amount, so it is kept. Clear the box to use the rate."}`
        : "No automatic amount yet: fill in the item, CBM and weight. Or type the amount.";
    }
  };

  const update = async () => {
    const params = new URLSearchParams({ estimate: "1", id: field("id")?.value || "" });
    for (const name of inputs) {
      const element = field(name);
      if (element) params.set(name, element.value);
    }
    const mine = ++request;
    try {
      const response = await fetch(`${location.pathname}?${params}`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (!response.ok || mine !== request) return;
      const result = await response.json();
      if (mine !== request) return;
      apply("kargodoor", result.kargodoor);
      apply("nihao", result.nihao);
    } catch {
      // Offline or signed out: the amounts are still computed when the form is saved.
    }
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(update, 300);
  };

  for (const name of inputs) {
    const element = field(name);
    if (!element) continue;
    element.addEventListener("input", schedule);
    element.addEventListener("change", () => {
      syncCategory();
      schedule();
    });
  }
  for (const box of form.querySelectorAll("[data-live-amount]")) {
    box.addEventListener("change", () => {
      if (box.value.trim() === "") schedule();
    });
  }

  syncCategory();
  update();
})();
