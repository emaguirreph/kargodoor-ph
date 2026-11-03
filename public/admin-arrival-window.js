// Edit shipment: keeps the "Estimated arrival" box next to the CH warehouse
// received date current while the admin changes the date, service or status.
// Sea and FCL: 3 to 5 weeks after. Air: 5 to 7 days after. Estimate only.
(() => {
  const box = document.querySelector("[data-arrival-estimate]");
  const form = box?.closest("form");
  if (!box || !form) return;
  const field = (name) => form.querySelector(`[name="${name}"]`);
  const received = field("warehouse_received_date");
  const service = field("service_type");
  const status = field("status");
  const value = box.querySelector("[data-arrival-estimate-value]");
  const note = box.querySelector("[data-arrival-estimate-note]");
  const windows = {
    "Sea Freight": [21, 35, "3–5 weeks"],
    FCL: [21, 35, "3–5 weeks"],
    "Air Freight": [5, 7, "5–7 days"],
  };
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const add = (date, days) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  };
  const show = (a, b) => a.getUTCFullYear() === b.getUTCFullYear()
    ? `${months[a.getUTCMonth()]} ${a.getUTCDate()} – ${months[b.getUTCMonth()]} ${b.getUTCDate()}, ${b.getUTCFullYear()}`
    : `${months[a.getUTCMonth()]} ${a.getUTCDate()}, ${a.getUTCFullYear()} – ${months[b.getUTCMonth()]} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
  const update = () => {
    box.hidden = status?.value === "Cancelled";
    const window = windows[service?.value || ""];
    const date = received?.value || "";
    if (!window || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      value.textContent = "Enter the CH warehouse received date";
      note.textContent = "Sea and FCL: 3–5 weeks after · Air: 5–7 days after";
      return;
    }
    value.textContent = show(add(date, window[0]), add(date, window[1]));
    note.textContent = `Estimate only · ${window[2]} after CH warehouse received date`;
  };
  // Malabon warehouse received date and Delivered date follow the Status.
  const syncDates = () => {
    for (const label of form.querySelectorAll("[data-show-status]")) {
      label.hidden = !label.dataset.showStatus.split("|").includes(status?.value || "");
    }
  };
  // Air Freight: the Flight date picker cannot go before the CH warehouse received date.
  const flight = form.querySelector('[data-after="warehouse_received_date"]');
  const syncFlightMin = () => {
    if (!flight) return;
    if (received?.value) flight.min = received.value;
    else flight.removeAttribute("min");
  };
  received?.addEventListener("change", syncFlightMin);
  received?.addEventListener("input", syncFlightMin);
  syncFlightMin();
  status?.addEventListener("change", syncDates);
  for (const el of [received, service, status]) el?.addEventListener("change", update);
  received?.addEventListener("input", update);
})();
