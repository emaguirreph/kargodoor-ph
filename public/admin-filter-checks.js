(() => {
  // Tick all / Untick all inside a tick-box filter (Em, 2026-11-13).
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-check]") : null;
    const box = button?.closest(".filter-checks");
    if (!button || !box) return;
    const on = button.getAttribute("data-check") === "all";
    for (const input of box.querySelectorAll('input[type="checkbox"]')) input.checked = on;
  });
  // Close an open filter when clicking elsewhere.
  document.addEventListener("click", (event) => {
    for (const open of document.querySelectorAll(".filter-checks[open]")) {
      if (!(event.target instanceof Node) || !open.contains(event.target)) open.removeAttribute("open");
    }
  });
})();
