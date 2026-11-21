// Leads table (Em, 2026-11-21): the Save button sits at the far right of a very
// wide table, so changing Contacted to "Yes" looked saved but never was. A
// dropdown change now saves that row right away; Notes still save with Enter or Save.
(() => {
  document.addEventListener("change", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLSelectElement) || !field.closest(".leads-table")) return;
    const form = field.form;
    // form.id is the hidden "id" input here, so read the attribute.
    if (!form || !(form.getAttribute("id") || "").startsWith("lead-")) return;
    field.closest("tr")?.classList.add("lead-dirty");
    if (form.requestSubmit) form.requestSubmit();
    else form.submit();
  });
  document.addEventListener("input", (event) => {
    const field = event.target;
    if (field instanceof HTMLInputElement && field.closest(".leads-table")) field.closest("tr")?.classList.add("lead-dirty");
  });
})();
