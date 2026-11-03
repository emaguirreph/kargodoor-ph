// Edit shipment tabs: "Shipment & KargoDoor" (cargo, status, customer pays us)
// and "Ni Hao" (Ni Hao cost, details, file, payment). Both tabs stay inside the
// one Save shipment form, so switching tabs never loses what was typed.
(() => {
  const bar = document.querySelector("[data-shipment-tabs]");
  const form = bar?.closest("form");
  if (!bar || !form) return;
  const buttons = [...bar.querySelectorAll("[data-tab]")];
  // The "Find customer" box above the form belongs to the first tab.
  const picker = form.closest(".compact-record-form")?.previousElementSibling;
  const pickerIsSearch = picker?.matches("section") && picker.querySelector('form[method="get"]');

  const show = (tab, scroll) => {
    form.dataset.tab = tab;
    for (const button of buttons) button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    if (pickerIsSearch) picker.hidden = tab !== "main";
    if (scroll) bar.scrollIntoView({ block: "nearest" });
  };

  const tabOf = (element) => (element?.closest(".shipment-money-nh") ? "nihao" : "main");
  const fromHash = () => {
    const target = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
    return target ? tabOf(target) : null;
  };

  const start = fromHash() || bar.dataset.initial || "main";
  form.classList.add("shipment-tabs-on");
  show(start, false);
  if (location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView();

  for (const button of buttons) button.addEventListener("click", () => show(button.dataset.tab, true));
  window.addEventListener("hashchange", () => { const tab = fromHash(); if (tab) show(tab, false); });

  // A required box on the other tab: open that tab so the browser can point at it.
  form.addEventListener("invalid", (event) => {
    const tab = tabOf(event.target);
    if (tab !== form.dataset.tab) show(tab, false);
  }, true);
})();
