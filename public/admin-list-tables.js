(() => {
  // Record links go in the first column, on the left (Em, 2026-11-02).
  const recordColumn = location.pathname === "/admin/quotations"
    ? "Quotation"
    : "";

  if (!recordColumn) return;

  document.querySelectorAll("details.admin-collapsible").forEach((details) => {
    const summary = details.querySelector(":scope > summary");
    if (summary?.textContent?.trim() !== "Quotation records") return;
    details.open = true;
    details.classList.remove("admin-collapsible");
    const heading = document.createElement("h2");
    heading.textContent = "Quotations";
    summary.replaceWith(heading);
  });

  document.querySelectorAll("table").forEach((table) => {
    const headers = [...table.querySelectorAll("thead th")];
    const recordIndex = headers.findIndex(
      (header) => header.textContent?.trim() === recordColumn,
    );
    if (recordIndex < 0) return;

    const updatedIndex = headers.findIndex(
      (header) => header.textContent?.trim() === "Updated",
    );

    [...table.rows].forEach((row) => {
      if (updatedIndex >= 0) row.children.item(updatedIndex)?.remove();
      const adjustedRecordIndex = updatedIndex >= 0 && updatedIndex < recordIndex
        ? recordIndex - 1
        : recordIndex;
      const recordCell = row.children.item(adjustedRecordIndex);
      if (recordCell) row.prepend(recordCell);
    });
  });
})();
