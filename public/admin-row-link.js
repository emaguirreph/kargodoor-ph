(() => {
  // Click anywhere on a list row to open it (Em, 2026-11-03). Links inside the
  // row still go where they point, and selecting text does not navigate.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest("a,button,input,select,textarea,label")) return;
    const row = target.closest("tr[data-href]");
    if (!row || String(window.getSelection?.() ?? "").length) return;
    const href = row.getAttribute("data-href");
    if (!href || !href.startsWith("/admin/")) return;
    if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
    else location.href = href;
  });
  document.addEventListener("keydown", (event) => {
    const row = event.target instanceof Element ? event.target.closest("tr[data-href]") : null;
    if (row && event.target === row && event.key === "Enter") location.href = row.getAttribute("data-href") ?? location.href;
  });
})();
