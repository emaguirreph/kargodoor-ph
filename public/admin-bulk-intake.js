(() => {
  document.querySelectorAll("[data-bulk-intake]").forEach((section) => {
    try {
      const categories = JSON.parse(section.dataset.itemCategories || "{}");
      const item = section.querySelector('select[name="item"]');
      const output = section.querySelector("[data-category-output]");
      if (!(item instanceof HTMLSelectElement) || !(output instanceof HTMLInputElement)) return;
      const update = () => { output.value = categories[item.value] || ""; };
      item.addEventListener("change", update);
      update();
    } catch {
      // The server always validates the selected item before creating records.
    }
  });
})();
